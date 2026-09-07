import {
  MarketSnapshot,
  ExecutionContext,
  PortfolioMode,
  PortfolioSnapshot,
  PortfolioSource,
  StrategyInput,
} from "../types";
import { MemoryStore } from "../memory/store";
import { normalizePortfolio } from "../context";

const BINANCE_FAPI = "https://fapi.binance.com/fapi/v1";
// MACD(12, 26, 9) needs at least 34 candles before its signal/histogram are
// defined. Keep additional warm-up candles so live momentum scans are useful.
const KLINE_LIMIT = 50;

async function fetchJson(url: string, retries = 5): Promise<any> {
  for (let i = 0; i < retries; i++) {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      if (i === retries - 1) throw err;
      const baseDelay = 2 ** i * 1000;
      const jitter = Math.random() * 1000;
      console.warn(`[Network Error] Retrying in ${((baseDelay + jitter) / 1000).toFixed(1)}s... (${i + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, baseDelay + jitter));
      continue;
    }

    if (!res.ok) {
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
      }
      const baseDelay = 2 ** i * 1000;
      const jitter = Math.random() * 1000;
      const delay = baseDelay + jitter;
      console.warn(
        `[Binance API] ${res.status} error. Retrying in ${(delay / 1000).toFixed(1)}s... (${i + 1}/${retries})`,
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    return await res.json();
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts.`);
}

export async function fetchLiveMarkets(): Promise<MarketSnapshot[]> {
  console.log("Fetching live market data from Binance...");

  const [tickers, premium] = await Promise.all([
    fetchJson(`${BINANCE_FAPI}/ticker/24hr`),
    fetchJson(`${BINANCE_FAPI}/premiumIndex`),
  ]);

  // Dynamically find the top 20 highest volume USDT pairs
  if (!Array.isArray(tickers) || !Array.isArray(premium)) {
    throw new Error("Binance returned an invalid market-data payload.");
  }

  const topSymbols = tickers
    .filter((t: any) => typeof t?.symbol === "string" && t.symbol.endsWith("USDT"))
    .filter((t: any) => Number.isFinite(Number(t.lastPrice)) && Number.isFinite(Number(t.quoteVolume)))
    .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, 20)
    .map((t: any) => t.symbol);

  if (topSymbols.length === 0) {
    throw new Error("Binance returned no USDT perpetual markets to scan.");
  }

  console.log(`Scanning top ${topSymbols.length} pairs by volume...`);

  const markets: MarketSnapshot[] = [];

  // Fetch klines concurrently for all top symbols to avoid slow sequential requests
  const klinePromises = topSymbols.map((symbol: string) =>
    fetchJson(`${BINANCE_FAPI}/klines?symbol=${symbol}&interval=1h&limit=${KLINE_LIMIT}`).catch(() => null),
  );
  const klinesResults = await Promise.all(klinePromises);

  for (let i = 0; i < topSymbols.length; i++) {
    const symbol = topSymbols[i];
    const ticker = tickers.find((t: any) => t.symbol === symbol);
    const prem = premium.find((p: any) => p.symbol === symbol);
    const klinesData = klinesResults[i];

    if (!ticker || !prem || !Array.isArray(klinesData)) continue;

    const priceUsd = Number(ticker.lastPrice);
    const change24hPct = Number(ticker.priceChangePercent) / 100;
    const volume24hUsd = Number(ticker.quoteVolume);
    const fundingRate = Number(prem.lastFundingRate);

    const klines = klinesData
      .filter(
        (k: any) =>
          Array.isArray(k) &&
          k.length >= 6 &&
          Number.isFinite(Number(k[0])) &&
          [k[1], k[2], k[3], k[4], k[5]].every((value) => Number.isFinite(Number(value))),
      )
      .map((k: any) => ({
        openTime: new Date(Number(k[0])).toISOString(),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      }));

    if (
      !Number.isFinite(priceUsd) ||
      priceUsd <= 0 ||
      !Number.isFinite(change24hPct) ||
      !Number.isFinite(volume24hUsd) ||
      !Number.isFinite(fundingRate) ||
      klines.length < 35 ||
      klines.some(
        (k: any) =>
          !Number.isFinite(k.open) ||
          !Number.isFinite(k.high) ||
          !Number.isFinite(k.low) ||
          !Number.isFinite(k.close) ||
          !Number.isFinite(k.volume) ||
          k.low > k.high ||
          k.low <= 0,
      )
    )
      continue;

    markets.push({
      symbol,
      priceUsd,
      change24hPct,
      volume24hUsd,
      fundingRate,
      klines,
    });
  }

  // Prevent partial scenarios (e.g., Binance API glitch dropping most klines)
  if (markets.length < topSymbols.length * 0.8) {
    throw new Error(
      `CRITICAL: Market data incomplete. Only successfully processed ${markets.length} / ${topSymbols.length} pairs.`,
    );
  }

  return markets;
}

export async function buildLiveScenario(
  injectedPortfolio?: PortfolioSnapshot,
  portfolioSource: PortfolioSource = "public_rest",
): Promise<StrategyInput> {
  const markets = await fetchLiveMarkets();

  const store = new MemoryStore();
  const memory = store.load();

  const goals = memory.goals || {
    profile: "default",
    maxDrawdownPct: 0.1,
    maxPositionPct: 0.2,
    maxOnchainExposurePct: 0.1,
    maxLeverage: 3,
    minConfidence: 0.3,
    reviewIntervalHours: 4,
    onchainCooldownHours: 12,
  };

  const baseline: PortfolioSnapshot = {
    timestamp: new Date().toISOString(),
    totalEquityUsd: 10_000,
    highWaterMarkUsd: 10_000,
    currentDrawdownPct: 0,
    positions: [],
  };
  const normalized = normalizePortfolio(
    injectedPortfolio ?? baseline,
    portfolioSource,
    injectedPortfolio?.portfolioMode,
  );
  const label =
    normalized.executionContext === "demo"
      ? "DEMO / PAPER"
      : normalized.portfolioMode === "paper"
        ? "MCP DATA / PAPER"
        : "MCP LIVE ACCOUNT";
  console.log(`[${label}] Using $${normalized.portfolio.totalEquityUsd.toFixed(2)} equity for sizing.`);

  return {
    goals,
    portfolio: normalized.portfolio,
    markets,
    portfolioSource,
    portfolioMode: normalized.portfolioMode,
    executionContext: normalized.executionContext,
    // AGENT must populate these from Skills Hub before calling propose.
    // If empty, the onchain_alpha and prediction_market strategies will simply
    // return no opportunities — the engine handles empty arrays gracefully.
    // See AGENT.md Step 2 for the exact skill calls needed.
    onchainCandidates: [],
    predictionMarkets: [],
  };
}

import { PATHS } from "../config/paths";
import { writeJsonAtomic } from "../config/persistence";

export async function saveLiveScenario(
  injectedPortfolio?: PortfolioSnapshot,
  portfolioSource: PortfolioSource = "public_rest",
): Promise<StrategyInput> {
  const input = await buildLiveScenario(injectedPortfolio, portfolioSource);
  const outPath = PATHS.LIVE_SCENARIO;
  writeJsonAtomic(outPath, input);
  return input;
}
