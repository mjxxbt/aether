import { Kline, MarketSnapshot, Opportunity, StrategyInput } from "../types";
import { MACD, RSI } from "technicalindicators";

const DEFAULT_SHORT_WINDOW = 5;
const DEFAULT_STRONG_DIVERGENCE_PCT = 0.04; // Used to normalize MACD histogram roughly
const DEFAULT_RSI_THRESHOLD = 70; // RSI above 70 / below 30 => overextended
// technicalindicators only returns a defined MACD signal/histogram after the
// slow EMA (26) and signal EMA (9) have both warmed up: 26 + 9 - 1 = 34.
const MIN_KLINES = 34;

function evaluateMarket(
  m: MarketSnapshot,
  maxPositionUsd: number,
  shortWindow: number,
  strongDivergencePct: number,
  rsiThreshold: number,
): Opportunity | null {
  if (!m.klines || m.klines.length < MIN_KLINES) return null;
  const closes = m.klines.map((k: Kline) => k.close);

  // Calculate MACD (standard settings: 12, 26, 9)
  const macdInput = {
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  };
  const macdResult = MACD.calculate(macdInput);
  if (macdResult.length === 0) return null;

  const lastMacd = macdResult[macdResult.length - 1];
  if (lastMacd.histogram === undefined) return null;

  const currentPrice = closes[closes.length - 1];
  const effectiveShortWindow = Math.max(1, Math.floor(shortWindow));
  const shortWindowStart = closes.length - 1 - effectiveShortWindow;
  if (shortWindowStart < 0) return null;
  const shortChangePct = (currentPrice - closes[shortWindowStart]) / closes[shortWindowStart];
  // Normalize histogram as a percentage of price to compare against strongDivergencePct
  const divergencePct = lastMacd.histogram / currentPrice;
  const magnitude = Math.abs(divergencePct);

  // Noise floor, need at least a small divergence
  if (magnitude < 0.005) return null;

  let confidence = Math.min(1, magnitude / (strongDivergencePct / 2)); // Adjusted for MACD scale
  const direction = divergencePct > 0 ? "long" : "short";
  const shortTrendAgrees = Math.abs(shortChangePct) < 0.001 || Math.sign(shortChangePct) === Math.sign(divergencePct);
  if (!shortTrendAgrees) {
    confidence = Number((confidence * 0.75).toFixed(3));
  }

  // RSI overextension filter
  let rsiNote = "";
  if (rsiThreshold > 0) {
    const rsiInput = {
      values: closes,
      period: 14, // standard RSI period
    };
    const rsiResult = RSI.calculate(rsiInput);
    if (rsiResult.length > 0) {
      const currentRsi = rsiResult[rsiResult.length - 1];
      const overextendedLong = direction === "long" && currentRsi > rsiThreshold;
      const overextendedShort = direction === "short" && currentRsi < 100 - rsiThreshold;

      if (overextendedLong || overextendedShort) {
        // Down-weight by 40% when overextended — still propose but with reduced confidence
        confidence = Number((confidence * 0.6).toFixed(3));
        rsiNote =
          ` RSI(14) ≈ ${currentRsi.toFixed(1)} signals ` +
          `${overextendedLong ? "overbought" : "oversold"} conditions — ` +
          `confidence reduced to avoid chasing an exhausted move.`;
      } else {
        rsiNote = ` RSI(14) is healthy at ${currentRsi.toFixed(1)}.`;
      }
    }
  }

  return {
    strategy: "momentum",
    symbol: m.symbol,
    direction,
    // A spot SELL is not a short entry. Negative momentum must use a venue
    // that can actually open a short, while positive momentum can stay spot.
    venue: direction === "short" ? "usdm_futures" : "spot",
    confidence: Number(confidence.toFixed(3)),
    rationale:
      `${m.symbol} MACD histogram shows ${(divergencePct * 100).toFixed(2)}% divergence relative to price, ` +
      `indicating ${direction} momentum. The ${effectiveShortWindow}-candle move is ` +
      `${(shortChangePct * 100).toFixed(2)}%${shortTrendAgrees ? " and confirms" : " and partially conflicts with"} the signal.` +
      rsiNote,
    suggestedSizeUsd: Number((maxPositionUsd * confidence).toFixed(2)),
    raw: { macd: lastMacd, divergencePct, shortChangePct, shortWindow: effectiveShortWindow },
  };
}

export function runMomentumStrategy(input: StrategyInput): Opportunity[] {
  const maxPositionUsd = input.portfolio.totalEquityUsd * input.goals.maxPositionPct;
  const mc = input.goals.momentum ?? {};
  const shortWindow = mc.shortWindow ?? DEFAULT_SHORT_WINDOW;
  const strongDivergencePct = mc.strongDivergencePct ?? DEFAULT_STRONG_DIVERGENCE_PCT;
  const rsiThreshold = mc.rsiOverextendedThreshold ?? DEFAULT_RSI_THRESHOLD;

  return input.markets
    .map((m) => evaluateMarket(m, maxPositionUsd, shortWindow, strongDivergencePct, rsiThreshold))
    .filter((o): o is Opportunity => o !== null)
    .filter((o) => o.confidence >= input.goals.minConfidence);
}
