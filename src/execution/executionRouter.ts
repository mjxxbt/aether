import { ExecutionConstraints, PendingAction } from "../types";
import { ACTION_TTL_MS } from "./confirmationGate";

export interface ProtectionPlan {
  mode: "futures_conditional_orders" | "post_fill_conditional" | "not_applicable";
  referencePriceUsd?: number;
  entrySide: "BUY" | "SELL";
  protectiveSide: "BUY" | "SELL";
  stopLossPct?: number;
  takeProfitPct?: number;
  trailingStopPct?: number;
  stopLossPriceUsd?: number;
  takeProfitPriceUsd?: number;
  stopLossOrder?: Record<string, unknown>;
  takeProfitOrder?: Record<string, unknown>;
  trailingStopOrder?: Record<string, unknown>;
  postFillOrderPlan?: Record<string, unknown>;
  requiresActualFilledQuantity?: boolean;
  requiresFuturesPositionSideResolution?: boolean;
  note: string;
}

export interface ExecutionInstruction {
  route: "binance_mcp" | "agentic_wallet" | "x402";
  /** Exact current Binance MCP name when known; resolve again if the server changes. */
  toolHint: string;
  /** The arguments that may be passed to the resolved primary tool. */
  args: Record<string, unknown>;
  note: string;
  mcpToolCandidates?: string[];
  preflight?: {
    status: "required";
    readOnlyChecks: string[];
    reason: string;
  };
  protectionPlan?: ProtectionPlan;
  executionPlan?: {
    kind: "single_market" | "split_market";
    chunks: number;
    intervalSeconds: number;
    totalQuantity?: number;
    perChunkQuantity?: number;
    chunkQuantities?: number[];
  };
  pairedLegInstruction?: Omit<ExecutionInstruction, "pairedLegInstruction">;
  pairedExecutionPolicy?: {
    mode: "two_phase_non_atomic";
    primaryMustBeFilled: true;
    pairedSizeSource: "actual_primary_fill";
    onPrimaryFailure: "stop";
    onPairedFailure: "stop_and_alert_user";
  };
}

export function buildExecutionInstruction(action: PendingAction): ExecutionInstruction {
  if (action.status !== "confirmed") {
    throw new Error(
      `Cannot build an execution instruction for action ${action.id}: ` +
        `status is '${action.status}', not 'confirmed'. Confirmation gate was bypassed.`,
    );
  }

  if (
    action.executionMode !== "live" ||
    action.executionContext !== "mcp_live" ||
    action.opportunity.signalContext === "demo"
  ) {
    throw new Error(
      `Action ${action.id} is not a confirmed MCP-live action ` +
        `(${action.executionContext ?? "legacy/unknown"}/${action.executionMode ?? "legacy/unknown"}). ` +
        "Demo, paper, legacy, and demo-signal actions cannot produce live execution instructions; run a fresh real-signal scan.",
    );
  }

  const created = Date.parse(action.createdAt);
  const expiry = action.expiresAt ? Date.parse(action.expiresAt) : created + ACTION_TTL_MS;
  if (
    !Number.isFinite(created) ||
    !Number.isFinite(expiry) ||
    created > Date.now() + 60_000 ||
    Math.min(expiry, created + ACTION_TTL_MS) <= Date.now()
  ) {
    throw new Error(`Action ${action.id} has expired or invalid approval timestamps. Run a fresh scan.`);
  }
  const opp = action.opportunity;
  if (!opp.approved || !Number.isFinite(opp.finalSizeUsd) || opp.finalSizeUsd <= 0) {
    throw new Error(`Action ${action.id} has no risk-approved executable size.`);
  }
  if (!opp.symbol || typeof opp.symbol !== "string") {
    throw new Error(`Action ${action.id} has no executable symbol.`);
  }
  if (!["long", "short", "buy", "sell"].includes(opp.direction)) {
    throw new Error(`Action ${action.id} has unsupported executable direction '${opp.direction}'.`);
  }
  if (opp.direction === "hold") {
    throw new Error(`Cannot build an execution instruction for observation-only hold opportunity ${action.id}.`);
  }
  if (opp.raw?.type === "x402_payment") {
    const context = opp.raw.paymentContext as
      { source?: string; capturedAt?: string; walletAvailableUsd?: number; executionMode?: string } | undefined;
    const captured = Date.parse(context?.capturedAt ?? "");
    if (
      context?.source !== "agent_os_wallet" ||
      context.executionMode !== "live" ||
      !Number.isFinite(captured) ||
      captured > Date.now() + 60_000 ||
      Date.now() - captured >= ACTION_TTL_MS ||
      !Number.isFinite(context.walletAvailableUsd) ||
      Number(context.walletAvailableUsd) < opp.finalSizeUsd ||
      opp.raw.amountUsd !== opp.finalSizeUsd ||
      !String(opp.raw.endpoint).startsWith("https://")
    ) {
      throw new Error("x402 requires a fresh, funded live wallet attestation matching the payment.");
    }
    return {
      route: "x402",
      toolHint: "skills-hub.x402-payment",
      args: {
        endpoint: opp.raw.endpoint,
        currency: opp.raw.currency,
        amountUsd: opp.raw.amountUsd,
        targetStrategy: opp.raw.targetStrategy,
      },
      note:
        "x402 payment instruction only. The agent must build the X-PAYMENT " +
        "header from the Agentic Wallet and call the endpoint after confirmation.",
      preflight: {
        status: "required",
        readOnlyChecks: [
          "re-fetch the endpoint payment requirements over HTTPS",
          "verify currency, amount, recipient, and wallet balance",
          "confirm the signal endpoint and target strategy are unchanged",
        ],
        reason:
          "The payment quote and wallet balance can change after proposal creation; do not construct or send X-PAYMENT from stale data.",
      },
    };
  }

  const primary = buildLegInstruction(
    opp.strategy,
    opp.venue,
    opp.direction,
    opp.symbol,
    opp.finalSizeUsd,
    opp.raw,
    opp.stopPricePct,
    opp.takeProfitPct,
    opp.trailingStopPct,
    opp.referencePriceUsd,
    opp.executionConstraints,
  );

  let pairedLegInstruction: ExecutionInstruction["pairedLegInstruction"] | undefined;
  if (opp.pairedLeg) {
    const pl = opp.pairedLeg;
    pairedLegInstruction = buildLegInstruction(
      opp.strategy,
      pl.venue,
      pl.direction,
      pl.symbol,
      pl.sizeUsd,
      undefined,
      undefined,
      undefined,
      undefined,
      pl.referencePriceUsd ?? opp.referencePriceUsd,
      pl.executionConstraints ?? opp.executionConstraints,
    );
  }

  return {
    ...primary,
    pairedLegInstruction,
    ...(pairedLegInstruction
      ? {
          pairedExecutionPolicy: {
            mode: "two_phase_non_atomic" as const,
            primaryMustBeFilled: true as const,
            pairedSizeSource: "actual_primary_fill" as const,
            onPrimaryFailure: "stop" as const,
            onPairedFailure: "stop_and_alert_user" as const,
          },
        }
      : {}),
  };
}

function roundToPrecision(value: number, decimals = 8): number {
  return Number(value.toFixed(decimals));
}

function roundToStep(value: number, step: number | undefined, mode: "floor" | "ceil" = "floor"): number {
  if (!step || !Number.isFinite(step) || step <= 0) return roundToPrecision(value);
  const units = value / step;
  const rounded = mode === "ceil" ? Math.ceil(units - 1e-12) : Math.floor(units + 1e-12);
  return roundToPrecision(rounded * step);
}

const DEFAULT_MIN_NOTIONAL_USD = 5;

function buildChunkQuantities(totalQuantity: number, chunks: number, step: number | undefined): number[] {
  if (chunks <= 1) return [roundToStep(totalQuantity, step)];
  const base = roundToStep(totalQuantity / chunks, step);
  if (base <= 0) return [];
  const quantities = Array.from({ length: chunks - 1 }, () => base);
  const used = base * (chunks - 1);
  const remainder = roundToStep(totalQuantity - used, step);
  if (remainder <= 0) return [];
  quantities.push(remainder);
  return quantities;
}

function absoluteProtectionPrices(
  direction: string,
  referencePriceUsd: number | undefined,
  stopPricePct: number | undefined,
  takeProfitPct: number | undefined,
  constraints: ExecutionConstraints | undefined,
): { stopLossPriceUsd?: number; takeProfitPriceUsd?: number } {
  if (!referencePriceUsd || referencePriceUsd <= 0 || stopPricePct === undefined) return {};

  const isLong = direction === "long" || direction === "buy";
  const stop = isLong ? referencePriceUsd * (1 - stopPricePct) : referencePriceUsd * (1 + stopPricePct);
  const takeProfit = isLong
    ? referencePriceUsd * (1 + (takeProfitPct ?? stopPricePct * 2))
    : referencePriceUsd * (1 - (takeProfitPct ?? stopPricePct * 2));

  return {
    stopLossPriceUsd: roundToStep(stop, constraints?.priceTickSize, isLong ? "floor" : "ceil"),
    takeProfitPriceUsd: roundToStep(takeProfit, constraints?.priceTickSize, isLong ? "ceil" : "floor"),
  };
}

function buildProtectionPlan(
  venue: string,
  direction: string,
  symbol: string,
  referencePriceUsd: number | undefined,
  stopPricePct: number | undefined,
  takeProfitPct: number | undefined,
  trailingStopPct: number | undefined,
  constraints: ExecutionConstraints | undefined,
): ProtectionPlan | undefined {
  if (stopPricePct === undefined) return undefined;
  if (!Number.isFinite(stopPricePct) || stopPricePct <= 0 || stopPricePct >= 1) {
    throw new Error(`Invalid stop-loss percentage for ${symbol}: ${stopPricePct}`);
  }
  if (takeProfitPct !== undefined && (!Number.isFinite(takeProfitPct) || takeProfitPct <= 0 || takeProfitPct >= 10)) {
    throw new Error(`Invalid take-profit percentage for ${symbol}: ${takeProfitPct}`);
  }
  if (
    trailingStopPct !== undefined &&
    (!Number.isFinite(trailingStopPct) || trailingStopPct <= 0 || trailingStopPct >= 1)
  ) {
    throw new Error(`Invalid trailing-stop percentage for ${symbol}: ${trailingStopPct}`);
  }

  const entrySide = direction === "long" || direction === "buy" ? "BUY" : "SELL";
  const protectiveSide = entrySide === "BUY" ? "SELL" : "BUY";
  const prices = absoluteProtectionPrices(direction, referencePriceUsd, stopPricePct, takeProfitPct, constraints);
  if (
    referencePriceUsd &&
    (!prices.stopLossPriceUsd ||
      prices.stopLossPriceUsd <= 0 ||
      !prices.takeProfitPriceUsd ||
      prices.takeProfitPriceUsd <= 0)
  ) {
    throw new Error(`Protection levels for ${symbol} are invalid after price/tick rounding.`);
  }

  // A spot SELL is an exit/rebalance, not a new short position.
  if (venue === "spot" && entrySide === "SELL") {
    return {
      mode: "not_applicable",
      entrySide,
      protectiveSide,
      stopLossPct: stopPricePct,
      takeProfitPct,
      trailingStopPct,
      note: "Exit/rebalance order: no new protective entry orders are attached to a spot SELL.",
    };
  }

  if (!referencePriceUsd || !prices.stopLossPriceUsd || !prices.takeProfitPriceUsd) {
    return {
      mode:
        venue === "usdm_futures" || venue === "coinm_futures" ? "futures_conditional_orders" : "post_fill_conditional",
      entrySide,
      protectiveSide,
      stopLossPct: stopPricePct,
      takeProfitPct,
      trailingStopPct,
      note:
        "Reference price is missing. The executor must stop, fetch the live price and " +
        "exchange filters, recalculate absolute trigger prices, and show them for review.",
    };
  }

  if (venue === "usdm_futures" || venue === "coinm_futures") {
    const tool = venue === "usdm_futures" ? "futures_usds.newAlgoOrder" : "futures_coin.newAlgoOrder";
    const apiEndpoint = venue === "usdm_futures" ? "/fapi/v1/algoOrder" : "/dapi/v1/algoOrder";
    const makeConditionalOrder = (type: "STOP_MARKET" | "TAKE_PROFIT_MARKET", triggerPrice: number) => ({
      tool,
      apiEndpoint,
      algoType: "CONDITIONAL",
      symbol,
      side: protectiveSide,
      type,
      triggerPrice,
      closePosition: true,
      workingType: "MARK_PRICE",
    });
    const callbackRate = trailingStopPct === undefined ? undefined : Number((trailingStopPct * 100).toFixed(4));
    if (callbackRate !== undefined) {
      const maxCallbackRate = venue === "coinm_futures" ? 4 : 10;
      if (callbackRate < 0.1 || callbackRate > maxCallbackRate) {
        throw new Error(
          `Trailing stop for ${venue} must be between 0.1% and ${maxCallbackRate}%; got ${callbackRate}%.`,
        );
      }
    }
    return {
      mode: "futures_conditional_orders",
      referencePriceUsd,
      entrySide,
      protectiveSide,
      stopLossPct: stopPricePct,
      takeProfitPct,
      trailingStopPct,
      stopLossPriceUsd: prices.stopLossPriceUsd,
      takeProfitPriceUsd: prices.takeProfitPriceUsd,
      stopLossOrder: {
        ...makeConditionalOrder("STOP_MARKET", prices.stopLossPriceUsd),
      },
      takeProfitOrder: {
        ...makeConditionalOrder("TAKE_PROFIT_MARKET", prices.takeProfitPriceUsd),
      },
      ...(trailingStopPct !== undefined
        ? {
            trailingStopOrder: {
              tool,
              apiEndpoint,
              algoType: "CONDITIONAL",
              symbol,
              side: protectiveSide,
              type: "TRAILING_STOP_MARKET",
              callbackRate,
              workingType: "MARK_PRICE",
              quantitySource: "actual_primary_fill",
              requiresActualFilledQuantity: true,
            },
          }
        : {}),
      requiresActualFilledQuantity: true,
      requiresFuturesPositionSideResolution: true,
      note:
        "Resolve the venue's current algo-order MCP schema before writing. Submit the entry, " +
        "verify FILLED and actual position quantity, then submit close-position STOP_MARKET and " +
        "TAKE_PROFIT_MARKET algo orders using triggerPrice. A trailing order requires the actual " +
        "filled quantity. If the account is in Hedge Mode, add the resolved LONG/SHORT " +
        "positionSide to the entry and every protection order. Never send these protection " +
        "objects to the primary newOrder call.",
    };
  }

  return {
    mode: "post_fill_conditional",
    referencePriceUsd,
    entrySide,
    protectiveSide,
    stopLossPct: stopPricePct,
    takeProfitPct,
    trailingStopPct,
    stopLossPriceUsd: prices.stopLossPriceUsd,
    takeProfitPriceUsd: prices.takeProfitPriceUsd,
    requiresActualFilledQuantity: true,
    postFillOrderPlan: {
      venue,
      toolCandidates: venue === "spot" ? ["spot.orderListOco"] : ["margin.orderListOco", "margin.newOrder"],
      orderList: "OCO",
      side: protectiveSide,
      quantity: "actual_filled_quantity_required",
      aboveType: protectiveSide === "SELL" ? "TAKE_PROFIT" : "STOP_LOSS",
      belowType: protectiveSide === "SELL" ? "STOP_LOSS" : "TAKE_PROFIT",
      aboveStopPrice: protectiveSide === "SELL" ? prices.takeProfitPriceUsd : prices.stopLossPriceUsd,
      belowStopPrice: protectiveSide === "SELL" ? prices.stopLossPriceUsd : prices.takeProfitPriceUsd,
      trailingStop: trailingStopPct === undefined ? "none" : "not_combined_with_fixed_OCO_without_a_fresh_user_review",
      requiresReadOnlyExchangeInfo: true,
    },
    note:
      "After the entry fill, fetch actual filled quantity and current exchange filters, then " +
      "resolve the current Spot/Margin OCO or conditional-order schema. Submit protection as a " +
      "separate post-fill workflow and cancel/replace the sibling protection when one leg fills. " +
      "Do not pass this plan as fields to the primary newOrder call.",
  };
}

function buildLegInstruction(
  strategy: string,
  venue: string,
  direction: string,
  symbol: string,
  sizeUsd: number,
  raw: Record<string, unknown> | undefined,
  stopPricePct?: number,
  takeProfitPct?: number,
  trailingStopPct?: number,
  referencePriceUsd?: number,
  constraints?: ExecutionConstraints,
): ExecutionInstruction {
  if (strategy === "prediction_market") {
    const outcome = raw?.outcome;
    const marketId = raw?.marketId ?? symbol;
    if (outcome !== "YES" && outcome !== "NO") {
      throw new Error("Prediction-market instruction is missing a valid YES/NO outcome.");
    }
    return {
      route: "agentic_wallet",
      toolHint: "agentic-wallet.prediction-market-order",
      args: {
        marketId,
        outcome,
        side: "BUY",
        sizeUsd,
        priceUsd: outcome === "YES" ? raw?.yesPriceUsd : raw?.noPriceUsd,
        resolutionDate: raw?.resolutionDate,
      },
      note:
        "Prediction-market order instruction. The agent must verify the market is still open, " +
        "recheck the quoted outcome price/liquidity, and submit through Agentic Wallet after confirmation.",
      preflight: {
        status: "required",
        readOnlyChecks: [
          "market is still open and unresolved",
          "current YES/NO quote and available liquidity",
          "wallet balance, chain, and order permissions",
        ],
        reason:
          "Prediction-market prices and resolution state are time-sensitive; the stored quote is for review only.",
      },
    };
  }

  if (venue === "transfer") {
    const fromAccount = raw?.fromAccountType ?? "SPOT";
    const toAccount = raw?.toAccountType ?? "UMFUTURE";
    return {
      route: "binance_mcp",
      toolHint: "binance-mcp.futures.transfer",
      mcpToolCandidates: ["futures_usds.accountConfig", "wallet.transfer"],
      args: {
        asset: raw?.asset ?? symbol.replace("USDT", ""),
        amount: sizeUsd,
        type: fromAccount === "SPOT" ? 1 : 2,
        fromAccountType: fromAccount,
        toAccountType: toAccount,
      },
      note:
        "Internal Binance sub-account transfer. Resolve the currently exposed transfer tool " +
        "and verify both source balance and destination wallet before submitting.",
      preflight: {
        status: "required",
        readOnlyChecks: [
          `available ${fromAccount} balance for ${raw?.asset ?? symbol}`,
          `destination ${toAccount} wallet status and transfer permissions`,
          "current transfer tool schema and account-type enum",
        ],
        reason:
          "A transfer is a write-capable wallet action and must not be sent until source funds and the current MCP schema are rechecked.",
      },
    };
  }

  if (venue === "onchain") {
    return {
      route: "agentic_wallet",
      toolHint: direction === "buy" || direction === "sell" ? "agentic-wallet.swap" : "agentic-wallet.limit-order",
      args: {
        symbol,
        chain: raw?.chain,
        address: raw?.address ?? raw?.marketId,
        direction,
        sizeUsd,
      },
      note:
        "Route via Binance Agentic Wallet. Confirm liquidity, slippage tolerance, and token " +
        "approval state with the agent before submitting.",
      preflight: {
        status: "required",
        readOnlyChecks: [
          "token address and chain match the audited candidate",
          "current liquidity and quoted slippage",
          "wallet balance and token approval state",
        ],
        reason:
          "On-chain execution is not protected by exchange filters; the agent must recheck address, liquidity, slippage, and approvals.",
      },
    };
  }

  const toolByVenue: Record<string, string> = {
    spot: "spot.newOrder",
    margin: "margin.newOrder",
    usdm_futures: "futures_usds.newOrder",
    coinm_futures: "futures_coin.newOrder",
  };
  const tool = toolByVenue[venue];
  if (!tool) {
    throw new Error(`No safe Binance MCP order route exists for venue '${venue}'.`);
  }
  if (venue === "spot" && direction === "short") {
    throw new Error(`Spot cannot open a short position for ${symbol}; route a short through Margin or Futures.`);
  }
  if (venue === "coinm_futures" && !symbol.toUpperCase().includes("USD")) {
    throw new Error(`COIN-M symbol '${symbol}' is not a USD-margined contract symbol.`);
  }
  const side = direction === "long" || direction === "buy" ? "BUY" : "SELL";
  const isFutures = venue === "usdm_futures" || venue === "coinm_futures";

  if (!referencePriceUsd || referencePriceUsd <= 0) {
    throw new Error(
      `Cannot build an executable ${venue} instruction for ${symbol} without a current ` +
        "reference price. Re-run the read-only market scan and create a new action.",
    );
  }
  if (venue === "coinm_futures" && !constraints?.contractSize) {
    throw new Error(
      `Cannot build an executable COIN-M instruction for ${symbol} without contractSize ` +
        "from exchangeInfo. Re-run the read-only preflight and create a new action.",
    );
  }

  // Binance MARKET order schemas require quantity. USD-M quantity is base
  // quantity; COIN-M quantity is contract quantity. COIN-M contractSize is
  // the USD notional of one contract, so price is not part of the contract
  // count conversion (it only affects the base-asset amount and margin).
  const estimatedBaseQuantity = referencePriceUsd && referencePriceUsd > 0 ? sizeUsd / referencePriceUsd : undefined;
  const quantity =
    venue === "coinm_futures"
      ? constraints?.contractSize
        ? roundToStep(sizeUsd / constraints.contractSize, constraints.quantityStepSize)
        : undefined
      : estimatedBaseQuantity
        ? roundToStep(estimatedBaseQuantity, constraints?.quantityStepSize)
        : undefined;

  if (!quantity || quantity <= 0) {
    throw new Error(
      `Cannot build an executable ${venue} instruction for ${symbol}: exchange filters ` +
        "did not produce a positive order quantity.",
    );
  }

  if (constraints?.minQuantity !== undefined && quantity < constraints.minQuantity) {
    throw new Error(
      `Cannot build an executable ${venue} instruction for ${symbol}: quantity ${quantity} ` +
        `is below Binance minQuantity ${constraints.minQuantity}.`,
    );
  }

  const effectiveNotionalUsd =
    venue === "coinm_futures" ? quantity * constraints!.contractSize! : quantity * referencePriceUsd;
  const minimumNotionalUsd = constraints?.minNotionalUsd ?? DEFAULT_MIN_NOTIONAL_USD;
  if (effectiveNotionalUsd + 1e-8 < minimumNotionalUsd) {
    throw new Error(
      `Cannot build an executable ${venue} instruction for ${symbol}: rounded quantity ` +
        `notional $${effectiveNotionalUsd.toFixed(8)} is below the $${minimumNotionalUsd.toFixed(8)} minimum.`,
    );
  }

  // Large orders are represented as concrete quantities. The primary args are
  // the first chunk, while the executor must use chunkQuantities for each
  // subsequent call; repeating the full quantity would over-order the account.
  const requestedChunks = sizeUsd > 1000 ? 4 : 1;
  const minChunkNotional = minimumNotionalUsd;
  const maxChunksByNotional = Math.max(1, Math.floor(sizeUsd / minChunkNotional));
  const chunks = Math.min(requestedChunks, maxChunksByNotional);
  const chunkQuantities = buildChunkQuantities(quantity, chunks, constraints?.quantityStepSize);
  if (chunkQuantities.length !== chunks || chunkQuantities.some((chunk) => chunk <= 0)) {
    throw new Error(
      `Cannot safely split ${symbol}: exchange quantity step leaves an invalid chunk. ` +
        "Use a smaller order or provide current exchange filters.",
    );
  }
  if (constraints?.minQuantity !== undefined && chunkQuantities.some((chunk) => chunk < constraints.minQuantity!)) {
    throw new Error(
      `Cannot safely split ${symbol}: one chunk is below Binance minQuantity ${constraints.minQuantity}.`,
    );
  }
  if (
    chunkQuantities.some((chunk) => {
      const chunkNotional = venue === "coinm_futures" ? chunk * constraints!.contractSize! : chunk * referencePriceUsd;
      return chunkNotional + 1e-8 < minChunkNotional;
    })
  ) {
    throw new Error(`Cannot safely split ${symbol}: one chunk would be below the exchange minimum notional.`);
  }

  const args: Record<string, unknown> = {
    symbol,
    side,
    type: "MARKET",
    quantity: chunkQuantities[0],
    newOrderRespType: "RESULT",
    ...(venue === "margin"
      ? {
          // Current Margin order schemas use AUTO_BORROW_REPAY for a
          // borrow-backed short; AUTO_BORROW is not a valid generic enum.
          sideEffectType: side === "SELL" ? "AUTO_BORROW_REPAY" : "NO_SIDE_EFFECT",
        }
      : {}),
  };

  const protectionPlan = buildProtectionPlan(
    venue,
    direction,
    symbol,
    referencePriceUsd,
    stopPricePct,
    takeProfitPct,
    trailingStopPct,
    constraints,
  );

  return {
    route: "binance_mcp",
    toolHint: tool,
    mcpToolCandidates: [tool],
    args,
    preflight: {
      status: "required",
      readOnlyChecks: [
        "current symbol price",
        "symbol exchangeInfo filters (quantity step, price tick, minimum notional, contract size when applicable)",
        `available ${venue} collateral, account permissions, position mode, and leverage`,
        "current open orders/positions so the protection workflow cannot duplicate exposure",
        ...(isFutures
          ? [
              "resolve the currently exposed futures algo-order tool and schema",
              "if Hedge Mode is enabled, resolve and add positionSide=LONG or SHORT to the entry and protection payloads; never guess BOTH",
            ]
          : []),
      ],
      reason: quantity
        ? "Recheck the live price and filters immediately before submitting; the displayed quantity is an estimate from the proposal snapshot."
        : "This order has no safe quantity yet. Resolve exchangeInfo and calculate a valid quantity before any write call.",
    },
    protectionPlan,
    executionPlan: {
      kind: chunks > 1 ? "split_market" : "single_market",
      chunks,
      intervalSeconds: chunks > 1 ? 225 : 0,
      totalQuantity: quantity,
      perChunkQuantity: chunkQuantities[0],
      chunkQuantities,
    },
    note: isFutures
      ? "Futures order via the exact Binance MCP family. Verify leverage, margin mode, position side, " +
        "and available collateral during read-only preflight; submit protection orders after the fill. " +
        "In Hedge Mode, include the resolved positionSide on every relevant call."
      : venue === "margin"
        ? "Margin order via Binance MCP. Verify borrow availability, interest, and account margin mode during preflight."
        : "Spot market order via Binance MCP. The primary MARKET call requires quantity; protection is a separate post-fill workflow.",
  };
}
