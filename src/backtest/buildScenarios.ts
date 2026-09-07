import * as fs from "fs";
import * as path from "path";
import { Kline, StrategyInput, RiskGoals, PortfolioSnapshot } from "../types";

export interface HistoricalKlineInput {
  [symbol: string]: Kline[];
}

export function buildScenarios(
  historicalData: HistoricalKlineInput,
  goals: RiskGoals,
  initialEquityUsd: number,
  // Keep the default window long enough for the momentum strategy's complete
  // MACD(12, 26, 9) signal and histogram to be defined.
  lookbackWindow: number = 34,
): StrategyInput[] {
  if (!Number.isInteger(lookbackWindow) || lookbackWindow < 2) {
    throw new Error("lookbackWindow must be an integer of at least 2 candles.");
  }
  if (!Number.isFinite(initialEquityUsd) || initialEquityUsd < 0) {
    throw new Error("initialEquityUsd must be a finite number greater than or equal to 0.");
  }

  const symbols = Object.keys(historicalData);
  if (symbols.length === 0) throw new Error("No symbols in historical data.");

  const sortedData: HistoricalKlineInput = {};
  for (const symbol of symbols) {
    const klines = historicalData[symbol];
    if (!Array.isArray(klines)) {
      throw new Error(`Historical data for ${symbol} must be an array of klines.`);
    }
    sortedData[symbol] = klines.slice().sort((a, b) => a.openTime.localeCompare(b.openTime));
  }

  // Collect all unique timestamps and sort them
  const allTimestamps = Array.from(new Set(symbols.flatMap((sym) => sortedData[sym].map((k) => k.openTime)))).sort();

  const scenarios: StrategyInput[] = [];

  for (let i = lookbackWindow; i < allTimestamps.length; i++) {
    const stepTime = allTimestamps[i];

    const markets = symbols
      .map((symbol) => {
        const klines = sortedData[symbol];
        const upToNow = klines.filter((k) => k.openTime <= stepTime);
        if (upToNow.length < 2) return null;
        const window = upToNow.slice(-lookbackWindow);
        const current = window[window.length - 1];
        const prev = window[window.length - 2];
        return {
          symbol,
          priceUsd: current.close,
          change24hPct: (current.close - prev.close) / prev.close,
          volume24hUsd: current.volume * current.close,
          fundingRate: 0,
          klines: window,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    if (markets.length === 0) continue;

    const portfolio: PortfolioSnapshot = {
      timestamp: stepTime,
      totalEquityUsd: initialEquityUsd,
      highWaterMarkUsd: initialEquityUsd,
      currentDrawdownPct: 0,
      positions: [],
    };

    scenarios.push({ goals, portfolio, markets });
  }

  if (scenarios.length === 0) {
    throw new Error(
      `Historical data does not contain enough candles for the ${lookbackWindow}-candle lookback window.`,
    );
  }

  return scenarios;
}

export function loadHistoricalData(filePath: string): HistoricalKlineInput {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Historical data file not found: ${resolved}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  } catch (error) {
    throw new Error(`Historical data is not valid JSON: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Historical data must be an object keyed by symbol.");
  }

  const data = parsed as Record<string, unknown>;
  for (const [symbol, rawKlines] of Object.entries(data)) {
    if (!Array.isArray(rawKlines) || rawKlines.length === 0) {
      throw new Error(`Historical data for ${symbol} must contain at least one kline.`);
    }
    for (const raw of rawKlines) {
      const kline = raw as Partial<Kline>;
      const openTime = new Date(String(kline.openTime)).getTime();
      const { open, high, low, close, volume } = kline;
      if (
        !Number.isFinite(openTime) ||
        typeof open !== "number" ||
        !Number.isFinite(open) ||
        open <= 0 ||
        typeof high !== "number" ||
        !Number.isFinite(high) ||
        high <= 0 ||
        typeof low !== "number" ||
        !Number.isFinite(low) ||
        low <= 0 ||
        typeof close !== "number" ||
        !Number.isFinite(close) ||
        close <= 0 ||
        typeof volume !== "number" ||
        !Number.isFinite(volume) ||
        volume < 0 ||
        low > high ||
        close < low ||
        close > high
      ) {
        throw new Error(`Historical data for ${symbol} contains an invalid kline.`);
      }
    }
  }
  return data as HistoricalKlineInput;
}
