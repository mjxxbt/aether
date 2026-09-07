import { fetchLiveMarkets } from "../../src/ingestor/binance";

describe("fetchLiveMarkets", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("fetches enough candles for the live MACD momentum strategy", async () => {
    const calls: string[] = [];
    const klines = Array.from({ length: 50 }, (_, index) => [index * 3_600_000, "100", "101", "99", "100", "1000"]);

    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("ticker/24hr")) {
        return {
          ok: true,
          json: async () => [
            {
              symbol: "BTCUSDT",
              quoteVolume: "1000000",
              lastPrice: "100",
              priceChangePercent: "1",
            },
          ],
        } as Response;
      }
      if (url.includes("premiumIndex")) {
        return {
          ok: true,
          json: async () => [{ symbol: "BTCUSDT", lastFundingRate: "0.0001" }],
        } as Response;
      }
      return { ok: true, json: async () => klines } as Response;
    }) as typeof fetch;
    jest.spyOn(console, "log").mockImplementation(() => undefined);

    const markets = await fetchLiveMarkets();

    expect(markets).toHaveLength(1);
    expect(markets[0].klines).toHaveLength(50);
    expect(calls.some((url) => url.includes("klines?symbol=BTCUSDT&interval=1h&limit=50"))).toBe(true);
  });
});
