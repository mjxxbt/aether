import { Opportunity, PortfolioSnapshot, RiskGoals, SizedOpportunity, MarketSnapshot } from "../types";
import { ATR } from "technicalindicators";

// Binance spot/futures symbols commonly enforce a $5 minimum notional. This
// conservative floor prevents the engine from producing an approval that is
// guaranteed to fail for a tiny account. MCP exchangeInfo remains the final
// authority for symbol-specific filters at execution time.
export const CONSERVATIVE_MIN_CEX_NOTIONAL_USD = 5;

const QUOTE_ASSETS = ["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "USDP", "DAI"];

function spotBaseAsset(symbol: string): string | undefined {
  const normalized = symbol.toUpperCase();
  const quote = QUOTE_ASSETS.find((asset) => normalized.endsWith(asset));
  return quote ? normalized.slice(0, -quote.length) : undefined;
}

function balanceKeyForVenue(
  venue: Opportunity["venue"],
): keyof NonNullable<PortfolioSnapshot["availableBalancesUsd"]> | undefined {
  return venue === "spot"
    ? "spotUsd"
    : venue === "margin"
      ? "marginUsd"
      : venue === "usdm_futures"
        ? "usdmFuturesUsd"
        : venue === "coinm_futures"
          ? "coinmFuturesUsd"
          : undefined;
}

function availableSizeCap(
  opp: Opportunity,
  portfolio: PortfolioSnapshot,
  goals: RiskGoals,
): { capUsd?: number; error?: string } {
  if (portfolio.portfolioMode === "paper") return {};
  if (portfolio.portfolioMode === "live" && (!portfolio.availableBalancesUsd || !portfolio.spotAssetBalancesUsd)) {
    return { error: "Live sizing requires explicit venue balances and Spot base-asset holdings." };
  }
  if (opp.venue === "transfer") {
    const spot = portfolio.availableBalancesUsd?.spotUsd;
    return spot === undefined ? {} : { capUsd: spot * 0.999 };
  }
  const balanceKey = balanceKeyForVenue(opp.venue);
  const venueBalance = balanceKey ? portfolio.availableBalancesUsd?.[balanceKey] : undefined;

  if (opp.venue === "spot" && opp.direction === "sell") {
    const base = spotBaseAsset(opp.symbol);
    const assetBalances = portfolio.spotAssetBalancesUsd;
    if (!base || !assetBalances) {
      if (portfolio.portfolioMode === "live") {
        return { error: `Live Spot SELL ${opp.symbol} requires an explicit ${base ?? "base-asset"} balance snapshot.` };
      }
      return {};
    }
    const baseBalance = assetBalances[base];
    if (baseBalance === undefined || baseBalance <= 0) {
      return { error: `No available ${base} balance was supplied for Spot SELL ${opp.symbol}.` };
    }
    // Leave room for commission and valuation drift so a sell cannot exceed holdings.
    return { capUsd: baseBalance * 0.999 };
  }

  if (venueBalance !== undefined && venueBalance <= 0) {
    return {
      error:
        `No available ${opp.venue} collateral was supplied by the account snapshot. ` +
        "Fund that venue or create a confirmed internal transfer before trading.",
    };
  }

  if (venueBalance === undefined) return {};
  if (opp.venue === "spot" && (opp.direction === "buy" || opp.direction === "long")) {
    return { capUsd: venueBalance * 0.999 };
  }
  // Margin SELL may auto-borrow the base asset. Keep the notional bounded by
  // explicitly supplied collateral rather than assuming an unknown borrow
  // limit or silently allowing an oversized short.
  if (opp.venue === "margin") {
    return { capUsd: venueBalance * 0.999 };
  }
  if (opp.venue === "usdm_futures" || opp.venue === "coinm_futures") {
    // This is a conservative initial-margin ceiling. The executor still must
    // recheck actual leverage and margin rules immediately before writing.
    return { capUsd: venueBalance * Math.max(1, goals.maxLeverage) * 0.999 };
  }
  return {};
}

function currentTotalExposureUsd(portfolio: PortfolioSnapshot): number {
  return portfolio.positions.reduce((sum, p) => sum + Math.abs(p.sizeUsd), 0);
}

function currentOnchainExposureUsd(portfolio: PortfolioSnapshot): number {
  return portfolio.positions.filter((p) => p.venue === "onchain").reduce((sum, p) => sum + Math.abs(p.sizeUsd), 0);
}

export function isRiskReducingOpportunity(opp: Opportunity, portfolio?: PortfolioSnapshot): boolean {
  if (opp.venue !== "spot" || opp.direction !== "sell" || opp.pairedLeg || opp.raw?.type === "x402_payment")
    return false;
  const base = spotBaseAsset(opp.symbol);
  return !!base && (portfolio?.spotAssetBalancesUsd?.[base] ?? 0) > 0;
}

export function evaluateOpportunity(
  opp: Opportunity,
  goals: RiskGoals,
  portfolio: PortfolioSnapshot,
  markets?: MarketSnapshot[],
): SizedOpportunity {
  const riskNotes: string[] = [];
  let approved = true;
  let rejectionReason: string | undefined;
  const reducing = isRiskReducingOpportunity(opp, portfolio);

  if (!Number.isFinite(opp.suggestedSizeUsd) || opp.suggestedSizeUsd <= 0) {
    return finalize(opp, false, 0, "Suggested size must be a finite amount greater than zero.", riskNotes);
  }

  // A hold signal is an observation, not an executable order. Treating it as
  // a spot opportunity would silently turn it into a SELL in the execution
  // router, which is an unsafe direction change.
  if (opp.direction === "hold") {
    return finalize(
      opp,
      false,
      0,
      "Observation-only opportunity: hold signals do not produce executable orders.",
      riskNotes,
    );
  }

  if (opp.venue === "spot" && opp.direction === "short") {
    return finalize(
      opp,
      false,
      0,
      "Spot cannot open a short position; use Margin or USDⓈ-M/COIN-M Futures.",
      riskNotes,
    );
  }

  let market = markets?.find((m) => m.symbol === opp.symbol);
  const isCexVenue =
    opp.venue === "spot" || opp.venue === "margin" || opp.venue === "usdm_futures" || opp.venue === "coinm_futures";
  if (markets && isCexVenue && !market) {
    return finalize(
      opp,
      false,
      0,
      `No current market snapshot was supplied for ${opp.symbol}; no executable CEX proposal was created.`,
      riskNotes,
    );
  }

  // A venue-aware account snapshot is required before proposing collateral
  // dependent live trades. Paper mode deliberately skips live balance checks,
  // but its PendingAction is permanently blocked from execution later.
  const primaryAvailability = availableSizeCap(opp, portfolio, goals);
  if (primaryAvailability.error) {
    return finalize(opp, false, 0, primaryAvailability.error, riskNotes);
  }

  // 0. Flash Crash Circuit Breaker
  if (markets) {
    const btc = markets.find((m) => m.symbol === "BTCUSDT");
    const eth = markets.find((m) => m.symbol === "ETHUSDT");
    const isFlashCrash =
      (btc && btc.change24hPct !== undefined && btc.change24hPct < -0.1) ||
      (eth && eth.change24hPct !== undefined && eth.change24hPct < -0.1);
    const isDirectionalBuy =
      opp.direction === "buy" ||
      opp.direction === "long" ||
      opp.pairedLeg?.direction === "buy" ||
      opp.pairedLeg?.direction === "long";

    if (isFlashCrash && isDirectionalBuy) {
      approved = false;
      rejectionReason = "EMERGENCY_STOP: Flash crash detected (>10% drop in BTC/ETH). Directional buying is suspended.";
      return finalize(opp, approved, 0, rejectionReason, riskNotes);
    }
  }

  // 1. Drawdown circuit breaker — hard stop, no new risk-adding trades.
  if (!reducing && portfolio.currentDrawdownPct >= goals.maxDrawdownPct) {
    approved = false;
    rejectionReason =
      `EMERGENCY_STOP: Current drawdown ${(portfolio.currentDrawdownPct * 100).toFixed(2)}% ` +
      `has hit or exceeded the ${(goals.maxDrawdownPct * 100).toFixed(2)}% limit. ` +
      `All new risk-adding trades are blocked until drawdown recovers. ` +
      `Run set-goals with a higher maxDrawdownPct or wait for recovery.`;
    return finalize(opp, approved, 0, rejectionReason, riskNotes);
  }

  // 2. Confidence floor
  if (opp.confidence < goals.minConfidence) {
    approved = false;
    rejectionReason = `Confidence ${opp.confidence} is below the ${goals.minConfidence} floor.`;
    return finalize(opp, approved, 0, rejectionReason, riskNotes);
  }

  // 3. Position size cap + ATR Volatility Adjustment
  let maxPositionUsd = portfolio.totalEquityUsd * goals.maxPositionPct;
  if (!reducing && opp.venue !== "transfer") {
    const existing = portfolio.positions
      .filter((p) => p.symbol === opp.symbol && p.venue === opp.venue)
      .reduce((sum, p) => sum + Math.abs(p.sizeUsd), 0);
    maxPositionUsd = Math.max(0, maxPositionUsd - existing);
  }

  if (market && market.klines && market.klines.length > 14) {
    const atrResult = ATR.calculate({
      high: market.klines.map((k) => k.high),
      low: market.klines.map((k) => k.low),
      close: market.klines.map((k) => k.close),
      period: 14,
    });
    if (atrResult.length > 0) {
      const currentAtr = atrResult[atrResult.length - 1];
      const currentPrice = market.klines[market.klines.length - 1].close;
      const atrPct = currentAtr / currentPrice;

      // If ATR > 5% (high volatility), scale down the max position.
      // E.g., if ATR is 10%, scale down by half.
      if (atrPct > 0.05) {
        const scaleFactor = 0.05 / atrPct;
        maxPositionUsd = maxPositionUsd * scaleFactor;
        riskNotes.push(
          `Volatility scaling applied. ATR is high at ${(atrPct * 100).toFixed(2)}%. ` +
            `Scaled down position cap by ${(scaleFactor * 100).toFixed(0)}%.`,
        );
      }
    }
  }

  let sizeUsd = Math.min(opp.suggestedSizeUsd, maxPositionUsd);
  if (primaryAvailability.capUsd !== undefined && sizeUsd > primaryAvailability.capUsd) {
    riskNotes.push(
      `Available ${opp.venue} account capacity clamps this action to $${primaryAvailability.capUsd.toFixed(2)}.`,
    );
    sizeUsd = primaryAvailability.capUsd;
  }
  if (opp.suggestedSizeUsd > maxPositionUsd) {
    riskNotes.push(
      `Suggested size $${opp.suggestedSizeUsd.toFixed(2)} clamped to the adjusted per-position ` +
        `cap of $${maxPositionUsd.toFixed(2)}.`,
    );
  }

  // 4. On-chain exposure cap (aggregate).
  if (opp.venue === "onchain") {
    const maxOnchainUsd = portfolio.totalEquityUsd * goals.maxOnchainExposurePct;
    const currentOnchain = currentOnchainExposureUsd(portfolio);
    const remaining = Math.max(0, maxOnchainUsd - currentOnchain);
    if (sizeUsd > remaining) {
      riskNotes.push(
        `On-chain exposure cap reached: $${currentOnchain.toFixed(2)} already deployed ` +
          `against a $${maxOnchainUsd.toFixed(2)} limit. Size clamped to remaining ` +
          `budget of $${remaining.toFixed(2)}.`,
      );
      sizeUsd = remaining;
    }
    if (sizeUsd <= 0) {
      approved = false;
      rejectionReason = "On-chain exposure cap fully utilized — no budget remaining.";
      return finalize(opp, approved, 0, rejectionReason, riskNotes);
    }
  }

  // Delta-neutral legs consume their own venue balance. Limit the shared size
  // to the most constrained leg and reject an explicitly unavailable hedge.
  if (opp.pairedLeg) {
    const pairedAvailability = availableSizeCap(
      {
        ...opp,
        symbol: opp.pairedLeg.symbol,
        direction: opp.pairedLeg.direction,
        venue: opp.pairedLeg.venue,
      },
      portfolio,
      goals,
    );
    if (pairedAvailability.error) {
      return finalize(opp, false, 0, `Paired leg unavailable: ${pairedAvailability.error}`, riskNotes);
    }
    if (pairedAvailability.capUsd !== undefined && sizeUsd > pairedAvailability.capUsd) {
      riskNotes.push(
        `Paired ${opp.pairedLeg.venue} capacity clamps both legs to $${pairedAvailability.capUsd.toFixed(2)}.`,
      );
      sizeUsd = pairedAvailability.capUsd;
    }
    if (sizeUsd <= 0) {
      return finalize(opp, false, 0, "No executable capacity remains for the paired leg.", riskNotes);
    }
  }

  // 5. Leverage cap for futures venues.
  if ((opp.venue === "usdm_futures" || opp.venue === "coinm_futures") && goals.maxLeverage < 1) {
    approved = false;
    rejectionReason = "Configured max leverage is below 1x — futures trading disabled.";
    return finalize(opp, approved, 0, rejectionReason, riskNotes);
  }

  // 6. Total exposure sanity check.
  const pairedLegExposure = opp.pairedLeg ? Math.min(Math.abs(opp.pairedLeg.sizeUsd), sizeUsd) : 0;
  const totalExposure = currentTotalExposureUsd(portfolio) + sizeUsd + pairedLegExposure;
  // A 1x profile permits up to 1x gross exposure (spot/no leverage). Higher
  // profiles permit the configured gross multiple; paired legs count toward
  // the same ceiling because both notionals consume account margin.
  const exposureCeiling = portfolio.totalEquityUsd * Math.max(1, goals.maxLeverage);
  if (!reducing && opp.venue !== "transfer" && totalExposure > exposureCeiling) {
    const allowed = Math.max(0, (exposureCeiling - currentTotalExposureUsd(portfolio)) / (opp.pairedLeg ? 2 : 1));
    riskNotes.push(
      `Aggregate exposure would exceed the leverage-adjusted ceiling of ` +
        `$${exposureCeiling.toFixed(2)}. Size clamped to $${allowed.toFixed(2)}.`,
    );
    sizeUsd = allowed;
    if (sizeUsd <= 0) {
      approved = false;
      rejectionReason = "No remaining exposure budget under current leverage ceiling.";
      return finalize(opp, approved, 0, rejectionReason, riskNotes);
    }
  }

  const roundedSizeUsd = Number(sizeUsd.toFixed(2));
  if (roundedSizeUsd <= 0) {
    approved = false;
    rejectionReason = "Final sized amount rounded to zero after risk adjustments.";
  }

  // Do this after rounding so a genuinely zero order retains the more useful
  // zero-size diagnostic. The MCP exchangeInfo response is still checked by
  // the executor because filters vary by symbol and contract type.
  if (
    approved &&
    roundedSizeUsd > 0 &&
    (opp.venue === "spot" || opp.venue === "margin" || opp.venue === "usdm_futures" || opp.venue === "coinm_futures")
  ) {
    const minimum = market?.executionConstraints?.minNotionalUsd ?? CONSERVATIVE_MIN_CEX_NOTIONAL_USD;
    if (roundedSizeUsd < minimum) {
      approved = false;
      rejectionReason =
        `Final ${opp.venue} notional $${roundedSizeUsd.toFixed(2)} is below the ` +
        `minimum executable notional of $${minimum.toFixed(2)}. ` +
        `Increase the authorized size or provide current MCP exchange filters.`;
      riskNotes.push("No order was created because the notional would fail Binance filters.");
    }
  }

  const finalizedOpp =
    approved && opp.pairedLeg
      ? {
          ...opp,
          pairedLeg: {
            ...opp.pairedLeg,
            sizeUsd: roundedSizeUsd,
            ...(markets?.find((m) => m.symbol === opp.pairedLeg!.symbol)?.priceUsd
              ? { referencePriceUsd: markets.find((m) => m.symbol === opp.pairedLeg!.symbol)!.priceUsd }
              : {}),
            ...(markets?.find((m) => m.symbol === opp.pairedLeg!.symbol)?.executionConstraints
              ? { executionConstraints: markets.find((m) => m.symbol === opp.pairedLeg!.symbol)!.executionConstraints }
              : {}),
          },
        }
      : opp;
  return finalize(
    finalizedOpp,
    approved,
    approved ? roundedSizeUsd : 0,
    rejectionReason,
    riskNotes,
    goals,
    market?.priceUsd,
    market?.executionConstraints,
  );
}

function finalize(
  opp: Opportunity,
  approved: boolean,
  finalSizeUsd: number,
  rejectionReason: string | undefined,
  riskNotes: string[],
  goals?: RiskGoals,
  referencePriceUsd?: number,
  executionConstraints?: MarketSnapshot["executionConstraints"],
): SizedOpportunity {
  const sized: SizedOpportunity = {
    ...opp,
    approved,
    finalSizeUsd,
    rejectionReason,
    riskNotes,
    ...(Number.isFinite(referencePriceUsd) && referencePriceUsd! > 0 ? { referencePriceUsd } : {}),
    ...(executionConstraints ? { executionConstraints } : {}),
  };

  // Attach stop-loss / trailing-stop / take-profit for approved directional CEX trades.
  const isDirectional =
    opp.direction === "long" || opp.direction === "short" || opp.direction === "buy" || opp.direction === "sell";
  const isCex =
    opp.venue === "spot" || opp.venue === "margin" || opp.venue === "usdm_futures" || opp.venue === "coinm_futures";
  const isSpotExit = opp.venue === "spot" && opp.direction === "sell";

  if (approved && isDirectional && isCex && !isSpotExit && opp.direction !== "hold" && goals) {
    const stopPricePct = Number(
      Math.min(0.05, goals.maxPositionPct > 0 ? goals.maxDrawdownPct / goals.maxPositionPct : 0.05).toFixed(4),
    );
    sized.stopPricePct = stopPricePct;

    // Trailing stop instead of just static take profit, but we include takeProfit for safety
    sized.takeProfitPct = Number((stopPricePct * 3).toFixed(4)); // 3:1 R/R hard TP
    sized.trailingStopPct = Number((stopPricePct * 0.5).toFixed(4)); // Trailing stop tighter than initial stop

    riskNotes.push(
      `Initial hard stop: ${(stopPricePct * 100).toFixed(2)}%. ` +
        `Trailing stop activated at ${(sized.trailingStopPct * 100).toFixed(2)}% drawdown from peak. ` +
        `Hard take-profit: ${(sized.takeProfitPct * 100).toFixed(2)}%.`,
    );
  }

  return sized;
}

export function evaluateAll(
  opportunities: Opportunity[],
  goals: RiskGoals,
  portfolio: PortfolioSnapshot,
  markets?: MarketSnapshot[],
): SizedOpportunity[] {
  // Reserve each accepted leg against one shared budget. Never assume that an
  // unfilled sell/transfer has already credited another wallet.
  const remaining: PortfolioSnapshot = JSON.parse(JSON.stringify(portfolio));
  return opportunities.map((opp) => {
    const sized = evaluateOpportunity(opp, goals, remaining, markets);
    if (!sized.approved) return sized;
    const legs = [{ ...sized, sizeUsd: sized.finalSizeUsd }, ...(sized.pairedLeg ? [sized.pairedLeg] : [])];
    for (const leg of legs) {
      if (leg.venue === "spot" && leg.direction === "sell") {
        const base = spotBaseAsset(leg.symbol);
        if (base && remaining.spotAssetBalancesUsd) {
          remaining.spotAssetBalancesUsd[base] = Math.max(0, (remaining.spotAssetBalancesUsd[base] ?? 0) - leg.sizeUsd);
        }
      } else {
        if (leg.venue !== "transfer")
          remaining.positions.push({ symbol: leg.symbol, venue: leg.venue, sizeUsd: leg.sizeUsd, unrealizedPnlUsd: 0 });
        const key = leg.venue === "transfer" ? "spotUsd" : balanceKeyForVenue(leg.venue);
        if (key && remaining.availableBalancesUsd) {
          const leverage =
            leg.venue === "usdm_futures" || leg.venue === "coinm_futures" ? Math.max(1, goals.maxLeverage) : 1;
          remaining.availableBalancesUsd[key] = Math.max(
            0,
            remaining.availableBalancesUsd[key] - leg.sizeUsd / leverage,
          );
        }
      }
    }
    return sized;
  });
}
