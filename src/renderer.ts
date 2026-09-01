import Decimal from "decimal.js";
import type { Currency, ReplayPoint, ReplaySpec, TradeFill } from "./domain";

export type ThemeName = "obsidian" | "neon" | "minimal" | "cyberpunk" | "sunset" | "matrix" | "hacker";
export type BackgroundStyle = "glow" | "solid" | "grid" | "particles" | "aurora" | "cyberpunk-scene" | "starlit-lake" | "neon-tokyo" | "anime-edit" | "anime-edit-2" | "anime-edit-3" | "anime-edit-4" | "custom";
export type WalletVisibility = "hidden" | "short" | "full";
export type ChartAnimation = "progressive" | "follow" | "fixed";
export type TradeIndicatorStyle = "detailed" | "feed" | "hype" | "minimal";

export interface RenderConfig {
  duration: number;
  /** Recording/playback length when it differs from the chart animation duration. */
  outputDuration?: number;
  /** Actual preview/export clock, used for post-chart presentation fades. */
  playbackElapsedSeconds?: number;
  currency: Currency;
  theme: ThemeName;
  backgroundStyle: BackgroundStyle;
  exactValues: boolean;
  walletVisibility: WalletVisibility;
  width: number;
  height: number;
  fps?: 30 | 60;
  chartMetric?: "marketCap" | "price";
  marketCapFormat?: "auto" | "thousands" | "millions";
  marketCapThreshold?: number;
  backgroundImage?: CanvasImageSource | null;
  chartStyle?: "candlestick" | "line" | "area" | "bar";
  chartAnimation?: ChartAnimation;
  chartLeadSeconds?: number | null;
  chartTrailSeconds?: number | null;
  showAverageBuyLine?: boolean;
  showAverageSellLine?: boolean;
  tradeIndicatorStyle?: TradeIndicatorStyle;
  showAthLine?: boolean;
  affiliateLink?: string;
  speedrunMode?: boolean;
}

const THEMES = {
  obsidian: {
    background: "#020504",
    backgroundLift: "#0a1712",
    panel: "rgba(6, 13, 10, .88)",
    panelStrong: "rgba(7, 16, 12, .96)",
    grid: "rgba(111, 163, 137, .13)",
    border: "rgba(126, 194, 159, .20)",
    text: "#f3fff8",
    muted: "#789084",
    positive: "#0ff28b",
    positiveSoft: "#78ffc2",
    negative: "#ff3e78",
    accent: "#ffc43d",
  },
  neon: {
    background: "#020509",
    backgroundLift: "#071822",
    panel: "rgba(5, 13, 18, .88)",
    panelStrong: "rgba(4, 12, 17, .96)",
    grid: "rgba(73, 214, 241, .14)",
    border: "rgba(94, 221, 241, .22)",
    text: "#effdff",
    muted: "#7195a0",
    positive: "#20f3d0",
    positiveSoft: "#8affee",
    negative: "#ff4595",
    accent: "#75a7ff",
  },
  minimal: {
    background: "#090b0c",
    backgroundLift: "#16191a",
    panel: "rgba(17, 20, 21, .9)",
    panelStrong: "rgba(14, 17, 18, .97)",
    grid: "rgba(255, 255, 255, .075)",
    border: "rgba(255, 255, 255, .14)",
    text: "#f5f6f6",
    muted: "#929a9d",
    positive: "#6fe3a1",
    positiveSoft: "#b4f5cf",
    negative: "#ed6483",
    accent: "#d5dcdf",
  },
  cyberpunk: {
    background: "#0d0221",
    backgroundLift: "#1a0442",
    panel: "rgba(26, 4, 66, .88)",
    panelStrong: "rgba(26, 4, 66, .96)",
    grid: "rgba(255, 0, 85, .15)",
    border: "rgba(255, 0, 85, .25)",
    text: "#f0f0f0",
    muted: "#ff0055",
    positive: "#00ffcc",
    positiveSoft: "#80ffe6",
    negative: "#ff0055",
    accent: "#fcee0a",
  },
  sunset: {
    background: "#1a0b12",
    backgroundLift: "#331624",
    panel: "rgba(51, 22, 36, .88)",
    panelStrong: "rgba(51, 22, 36, .96)",
    grid: "rgba(255, 126, 103, .15)",
    border: "rgba(255, 126, 103, .25)",
    text: "#fdf5f3",
    muted: "#f0b6aa",
    positive: "#ff7e67",
    positiveSoft: "#ffbfb3",
    negative: "#804080",
    accent: "#ffc107",
  },
  matrix: {
    background: "#000000",
    backgroundLift: "#001a00",
    panel: "rgba(0, 26, 0, .88)",
    panelStrong: "rgba(0, 26, 0, .96)",
    grid: "rgba(0, 255, 0, .15)",
    border: "rgba(0, 255, 0, .25)",
    text: "#ccffcc",
    muted: "#009900",
    positive: "#00ff00",
    positiveSoft: "#80ff80",
    negative: "#990000",
    accent: "#ffffff",
  },
  hacker: {
    background: "#0a0a0a",
    backgroundLift: "#141414",
    panel: "rgba(20, 20, 20, .88)",
    panelStrong: "rgba(20, 20, 20, .96)",
    grid: "rgba(51, 255, 51, .1)",
    border: "rgba(51, 255, 51, .2)",
    text: "#33ff33",
    muted: "#1a801a",
    positive: "#33ff33",
    positiveSoft: "#99ff99",
    negative: "#ff3333",
    accent: "#000000",
  },
} as const;

type Theme = (typeof THEMES)[ThemeName];

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function easeInOut(value: number): number {
  const x = clamp(value);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
}

function phase(progress: number, start: number, end: number): number {
  return clamp((progress - start) / Math.max(0.001, end - start));
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function formatMoney(value: Decimal, currency: Currency, exact: boolean): string {
  const sign = value.isPositive() ? "+" : value.isNegative() ? "-" : "";
  const absolute = value.abs();
  if (currency === "USD") {
    if (exact) return `${sign}$${absolute.toDecimalPlaces(2).toFixed(2)}`;
    if (absolute.gte(1_000_000)) return `${sign}$${absolute.div(1_000_000).toFixed(2)}M`;
    if (absolute.gte(1_000)) return `${sign}$${absolute.div(1_000).toFixed(1)}K`;
    return `${sign}$${absolute.toFixed(2)}`;
  }
  if (!exact && absolute.gte(1_000)) return `${sign}${absolute.div(1_000).toFixed(1)}K SOL`;
  return `${sign}${absolute.toDecimalPlaces(exact ? 4 : 2).toString()} SOL`;
}

function compactNumber(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (absolute >= 1) return value.toFixed(2);
  if (absolute === 0) return "0";
  return value.toPrecision(3);
}

function compactExecutionValue(fill: TradeFill, spec: ReplaySpec): string {
  const value = new Decimal(fill.quoteLamports).div(fill.quoteScale ?? spec.episode.quoteScale ?? 1_000_000_000);
  return formatMoney(value, spec.accountingCurrency ?? "SOL", false).replace(/^\+/, "");
}

function formatMarketCap(value: number, format: "auto" | "thousands" | "millions", threshold = 1_000_000): string {
  if (!Number.isFinite(value)) return "—";
  const safeThreshold = Number.isFinite(threshold) && threshold >= 1_000 ? threshold : 1_000_000;
  if (format === "thousands" || (format === "auto" && Math.abs(value) < safeThreshold)) {
    const decimals = Math.abs(value) < 100_000 ? 1 : 0;
    return `$${(value / 1_000).toFixed(decimals)}K`;
  }
  if (format === "millions" || Math.abs(value) < 1_000_000_000) {
    const decimals = Math.abs(value) < 10_000_000 ? 2 : 1;
    return `$${(value / 1_000_000).toFixed(decimals)}M`;
  }
  return `$${(value / 1_000_000_000).toFixed(2)}B`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1) return value.toFixed(2);
  if (Math.abs(value) >= 0.01) return value.toFixed(4);
  return value.toPrecision(4);
}

/** Round tick values (1/2/2.5/5 x 10^n steps) spanning the padded chart range. */
function chartAxisTicks(minimum: number, maximum: number, targetCount = 4): number[] {
  const span = maximum - minimum;
  if (!Number.isFinite(span) || span <= 0) return [];
  const magnitude = 10 ** Math.floor(Math.log10(span / targetCount));
  const step = [1, 2, 2.5, 5, 10].map((multiple) => multiple * magnitude)
    .find((candidate) => span / candidate <= targetCount + 0.5) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let value = Math.ceil(minimum / step) * step; value <= maximum + step * 1e-6; value += step) {
    ticks.push(Math.abs(value) < step * 1e-6 ? 0 : value);
  }
  return ticks;
}

function currencyValue(value: Decimal, spec: ReplaySpec, currency: Currency): Decimal {
  const accountingCurrency = spec.accountingCurrency ?? "SOL";
  if (currency === accountingCurrency) return value;
  if (!spec.usdPerSol) return new Decimal(0);
  return accountingCurrency === "USD" ? value.div(spec.usdPerSol) : value.mul(spec.usdPerSol);
}

function walletDisclosure(spec: ReplaySpec, visibility: WalletVisibility): string {
  if (visibility === "hidden") return "";
  const addresses = [...new Set([...(spec.walletAddresses ?? []), spec.walletAddress].filter(Boolean))];
  if (!addresses.length) return "WALLET UNAVAILABLE";
  const visible = visibility === "short"
    ? addresses.map((address) => `${address.slice(0, 5)}…${address.slice(-5)}`)
    : addresses;
  return `${addresses.length > 1 ? "WALLETS" : "WALLET"} ${visible.join(" · ")}`;
}

function drawWalletDisclosure(
  context: CanvasRenderingContext2D,
  spec: ReplaySpec,
  config: RenderConfig,
  theme: Theme,
  x: number,
  y: number,
  maximumWidth: number,
  preferredFontSize: number,
): void {
  const text = walletDisclosure(spec, config.walletVisibility);
  let fontSize = preferredFontSize;
  do {
    context.font = `bold ${fontSize}px ui-monospace, SFMono-Regular, monospace`;
    if (context.measureText(text).width <= maximumWidth) break;
    fontSize -= 1;
  } while (fontSize > Math.max(10, preferredFontSize * 0.5));
  context.fillStyle = theme.muted;
  context.textAlign = "left";
  context.fillText(text, x, y, maximumWidth);
}

function eventProgress(fill: TradeFill, spec: ReplaySpec): number {
  const start = spec.episode.startTimestamp;
  const span = Math.max(1, spec.episode.endTimestamp - start);
  return clamp((fill.timestamp - start) / span);
}

const REPLAY_END_HOLD_SECONDS = 0.65;

function replayEase(value: number): number {
  const x = clamp(value);
  const smoothStep = x * x * (3 - 2 * x);
  // Keep the chart moving for the whole clip while retaining a soft start and stop.
  return x * 0.72 + smoothStep * 0.28;
}

function inverseReplayEase(value: number): number {
  const target = clamp(value);
  let low = 0;
  let high = 1;
  for (let index = 0; index < 20; index += 1) {
    const middle = (low + high) / 2;
    if (replayEase(middle) < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function replayWindow(duration: number, landscape: boolean): { start: number; end: number } {
  const safeDuration = Math.max(1, duration);
  const startSeconds = landscape ? 0.12 : 0.24;
  const start = clamp(startSeconds / safeDuration, 0.008, 0.06);
  const end = clamp(1 - REPLAY_END_HOLD_SECONDS / safeDuration, start + 0.5, 0.97);
  return { start, end };
}

function chartDisplayWindow(
  animation: ChartAnimation,
  chartStart: number,
  chartEnd: number,
  activeTimestamp: number,
  interval: number,
): { start: number; end: number } {
  const paddedStart = chartStart - interval * 0.35;
  const paddedEnd = chartEnd + interval * 0.35;
  if (animation === "fixed") return { start: paddedStart, end: paddedEnd };
  if (animation === "follow") {
    const visibleSpan = Math.min(paddedEnd - paddedStart, Math.max(interval * 18, (chartEnd - chartStart) * 0.32));
    const start = clamp(activeTimestamp - visibleSpan * 0.82, paddedStart, Math.max(paddedStart, paddedEnd - visibleSpan));
    return { start, end: Math.min(paddedEnd, start + visibleSpan) };
  }
  return {
    start: paddedStart,
    end: Math.min(paddedEnd, Math.max(activeTimestamp + interval * 0.65, chartStart + interval * 3.5)),
  };
}

export interface ChartReferenceLine {
  kind: "averageBuy" | "averageSell" | "ath";
  priceSol: number | null;
  placement: "line" | "top";
  marketCapUsd?: number;
}

function volumeWeightedExecutionPrice(spec: ReplaySpec, side: "buy" | "sell", activeTimestamp: number): number | null {
  let totalAmount = new Decimal(0);
  let weightedPrice = new Decimal(0);
  for (const fill of spec.episode.fills) {
    if (fill.side !== side || fill.timestamp > activeTimestamp) continue;
    const amount = new Decimal(fill.tokenAmountRaw || 0).div(new Decimal(10).pow(fill.tokenDecimals));
    const price = new Decimal(fill.estimatedPriceSol || 0);
    if (!amount.isFinite() || !price.isFinite() || amount.lte(0) || price.lte(0)) continue;
    totalAmount = totalAmount.plus(amount);
    weightedPrice = weightedPrice.plus(price.mul(amount));
  }
  if (totalAmount.lte(0)) return null;
  const result = weightedPrice.div(totalAmount).toNumber();
  return Number.isFinite(result) && result > 0 ? result : null;
}

export function chartReferenceLines(
  spec: ReplaySpec,
  config: Pick<RenderConfig, "showAverageBuyLine" | "showAverageSellLine" | "showAthLine">,
  activeTimestamp = Number.POSITIVE_INFINITY,
): ChartReferenceLine[] {
  const lines: ChartReferenceLine[] = [];
  if (config.showAverageBuyLine) {
    const priceSol = volumeWeightedExecutionPrice(spec, "buy", activeTimestamp);
    if (priceSol != null) lines.push({ kind: "averageBuy", priceSol, placement: "line" });
  }
  if (config.showAverageSellLine) {
    const priceSol = volumeWeightedExecutionPrice(spec, "sell", activeTimestamp);
    if (priceSol != null) lines.push({ kind: "averageSell", priceSol, placement: "line" });
  }
  if (config.showAthLine) {
    const marketCapMultiplier = Number(spec.marketCapMultiplier ?? 0);
    const capturedAth = Number(spec.athMarketCapUsd ?? 0);
    const capturedAthPrice = Number.isFinite(capturedAth) && capturedAth > 0 && Number.isFinite(marketCapMultiplier) && marketCapMultiplier > 0
      ? capturedAth / marketCapMultiplier
      : null;
    if (Number.isFinite(capturedAth) && capturedAth > 0) {
      const athOccursInClip = capturedAthPrice != null && (spec.candles ?? []).some((candle) => {
        const high = Number(candle.highSol);
        return Number.isFinite(high) && high >= capturedAthPrice * 0.995;
      });
      lines.push({
        kind: "ath",
        priceSol: capturedAthPrice,
        placement: athOccursInClip ? "line" : "top",
        marketCapUsd: capturedAth,
      });
    }
  }
  return lines;
}

function replayCandleInterval(spec: ReplaySpec): number {
  if (spec.candleIntervalSeconds && Number.isFinite(spec.candleIntervalSeconds)) {
    return Math.max(1, spec.candleIntervalSeconds);
  }
  return Math.max(1, Math.round(Math.max(1, spec.episode.endTimestamp - spec.episode.startTimestamp) / 60));
}

/** Returns the video progress where the renderer first reveals an execution marker. */
export function replayEventVisualProgress(
  fill: TradeFill,
  spec: ReplaySpec,
  width: number,
  height: number,
  duration: number,
  leadSeconds?: number | null,
  trailSeconds?: number | null,
  speedrunMode = false,
): number {
  const landscape = width / height >= 1.45;
  if ((leadSeconds != null || trailSeconds != null) && spec.chartStartTimestamp != null && spec.chartEndTimestamp != null) {
    const reveal = clamp((fill.timestamp - spec.chartStartTimestamp) / Math.max(1, spec.chartEndTimestamp - spec.chartStartTimestamp));
    return reveal;
  }
  const window = replayWindow(duration, landscape);
  const points = [...spec.points].sort((left, right) => left.timestamp - right.timestamp);
  const candles = [...(spec.candles ?? [])].sort((left, right) => left.timestamp - right.timestamp);
  const interval = replayCandleInterval(spec);
  const chartStart = spec.chartStartTimestamp ?? Math.min(spec.episode.startTimestamp, candles[0]?.timestamp ?? points[0]?.timestamp ?? spec.episode.startTimestamp);
  const chartEnd = spec.chartEndTimestamp ?? Math.max(
    spec.episode.endTimestamp,
    candles.length ? candles.at(-1)!.timestamp + interval : points.at(-1)?.timestamp ?? spec.episode.endTimestamp,
  );
  if (speedrunMode) {
    const eventAt = calculateSpeedrunProgressAtTimestamp(
      fill.timestamp,
      chartStart,
      chartEnd,
      spec.episode.fills.map((candidate) => candidate.timestamp),
      interval,
    );
    return window.start + eventAt * (window.end - window.start);
  }
  if (!landscape) {
    return window.start + inverseReplayEase(eventProgress(fill, spec)) * (window.end - window.start);
  }
  const reveal = clamp((fill.timestamp - chartStart) / Math.max(1, chartEnd - chartStart));
  return window.start + inverseReplayEase(reveal) * (window.end - window.start);
}

function interpolateReplayAtTimestamp(points: ReplayPoint[], timestamp: number): { price: number; pnl: Decimal } {
  if (points.length === 1) return { price: Number(points[0]!.priceSol), pnl: new Decimal(points[0]!.pnlSol) };
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const next = points[index]!;
    if (timestamp <= next.timestamp) {
      const local = clamp((timestamp - previous.timestamp) / Math.max(0.0001, next.timestamp - previous.timestamp));
      const price = Number(previous.priceSol) + (Number(next.priceSol) - Number(previous.priceSol)) * local;
      const pnl = new Decimal(previous.pnlSol).plus(new Decimal(next.pnlSol).minus(previous.pnlSol).mul(local));
      return { price, pnl };
    }
  }
  const last = points.at(-1)!;
  return { price: Number(last.priceSol), pnl: new Decimal(last.pnlSol) };
}

function drawPill(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: { fill: string; stroke: string; color: string; fontSize: number; paddingX?: number },
): number {
  context.font = `bold ${options.fontSize}px ui-monospace, SFMono-Regular, monospace`;
  const width = context.measureText(text).width + (options.paddingX ?? 16) * 2;
  const height = options.fontSize + 18;
  roundedRect(context, x, y, width, height, height / 2);
  context.fillStyle = options.fill;
  context.fill();
  context.strokeStyle = options.stroke;
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = options.color;
  context.textBaseline = "middle";
  context.fillText(text, x + (options.paddingX ?? 16), y + height / 2 + 1);
  context.textBaseline = "alphabetic";
  return width;
}

function drawChartReferenceLines(
  context: CanvasRenderingContext2D,
  lines: ChartReferenceLine[],
  yForPrice: (price: number) => number,
  plotX: number,
  plotY: number,
  plotWidth: number,
  plotHeight: number,
  unit: number,
  theme: Theme,
  config: RenderConfig,
): void {
  const placedLabels: number[] = [];
  for (const line of lines) {
    const color = line.kind === "averageBuy" ? theme.positive : line.kind === "averageSell" ? theme.negative : theme.accent;
    const name = line.kind === "averageBuy" ? "AVG BUY" : line.kind === "averageSell" ? "AVG SELL" : "ATH";
    context.save();
    context.font = `bold ${22 * unit}px ui-monospace, SFMono-Regular, monospace`;
    context.textAlign = "right";
    context.textBaseline = "middle";
    context.fillStyle = color;
    if (line.placement === "top" || line.priceSol == null) {
      const topLabel = line.kind === "ath" && line.marketCapUsd != null
        ? `${name} ${formatMarketCap(line.marketCapUsd, config.marketCapFormat ?? "auto", config.marketCapThreshold)}`
        : name;
      context.fillText(topLabel, plotX - 8 * unit, plotY + 12 * unit);
      context.restore();
      continue;
    }
    const y = clamp(yForPrice(line.priceSol), plotY, plotY + plotHeight);
    context.setLineDash(line.kind === "ath" ? [4 * unit, 7 * unit] : [14 * unit, 9 * unit]);
    context.strokeStyle = `${color}b8`;
    context.lineWidth = 2 * unit;
    context.beginPath();
    context.moveTo(plotX, y);
    context.lineTo(plotX + plotWidth, y);
    context.stroke();
    context.setLineDash([]);
    const desiredLabelY = clamp(y, plotY + 8 * unit, plotY + plotHeight - 8 * unit);
    const labelY = placedLabels.reduce((candidate, placed) => Math.abs(candidate - placed) < 16 * unit ? clamp(candidate + 18 * unit, plotY + 8 * unit, plotY + plotHeight - 8 * unit) : candidate, desiredLabelY);
    placedLabels.push(labelY);
    context.fillText(name, plotX - 8 * unit, labelY);
    context.restore();
  }
}

type ExecutionPosition = { fill: TradeFill; x: number; y: number; ageMs: number; index: number };

/** Canvas-only execution presentation. Every transient value is reconstructed from replay time. */
export function drawExecutionIndicators(
  context: CanvasRenderingContext2D,
  spec: ReplaySpec,
  style: TradeIndicatorStyle,
  videoProgress: number,
  config: Pick<RenderConfig, "duration" | "width" | "height" | "chartLeadSeconds" | "chartTrailSeconds" | "speedrunMode" | "chartStyle" | "playbackElapsedSeconds">,
  activeTimestamp: number,
  xForTime: (timestamp: number) => number,
  yForPrice: (price: number) => number,
  plot: { x: number; y: number; width: number; height: number },
  unit: number,
  theme: Theme,
): void {
  const seriesCandles = [...(spec.candles ?? [])].sort((left, right) => left.timestamp - right.timestamp);
  // Anchor markers to the drawn series. A fill's own estimated price can sit
  // visibly off the chart, and sparse feeds (e.g. Mobula) can start the first
  // candle well after the first buy. When no candle covers a fill, anchor it to
  // the nearest candle rather than letting its raw price float off the axis.
  const snapPriceToSeries = (timestamp: number, price: number): number => {
    if (!seriesCandles.length) return price;
    let previous = seriesCandles[0]!;
    let next = seriesCandles[0]!;
    for (const candle of seriesCandles) {
      next = candle;
      if (candle.timestamp > timestamp) break;
      previous = candle;
    }
    if (config.chartStyle === "line" || config.chartStyle === "area") {
      const previousClose = Number(previous.closeSol);
      const nextClose = Number(next.closeSol);
      if (!Number.isFinite(previousClose) || !Number.isFinite(nextClose)) return price;
      // Before the first candle, after the last, or with only one candle:
      // rest on the nearest close instead of interpolating past the edge.
      if (timestamp <= previous.timestamp || next === previous) return previousClose;
      const span = next.timestamp - previous.timestamp;
      const ratio = span > 0 ? clamp((timestamp - previous.timestamp) / span) : 0;
      return previousClose + (nextClose - previousClose) * ratio;
    }
    // Candlestick/bar: clamp the fill into the nearest candle's range, so a fill
    // in a sparse gap or before the first candle rests on the nearest bar.
    const nearest = Math.abs(timestamp - previous.timestamp) <= Math.abs(next.timestamp - timestamp) ? previous : next;
    const low = Number(nearest.lowSol);
    const high = Number(nearest.highSol);
    if (!Number.isFinite(low) || !Number.isFinite(high) || low > high) return price;
    const anchor = Number.isFinite(price) && price > 0 ? price : Number(nearest.closeSol);
    if (!Number.isFinite(anchor)) return price;
    return Math.min(Math.max(anchor, low), high);
  };
  const positioned: ExecutionPosition[] = [...spec.episode.fills]
    .sort((left, right) => left.timestamp - right.timestamp || left.slot - right.slot)
    .map((fill, index) => ({
      fill, index, x: xForTime(fill.timestamp),
      y: yForPrice(snapPriceToSeries(fill.timestamp, Number(fill.estimatedPriceSol || 0))),
      ageMs: (activeTimestamp - fill.timestamp) * 1_000,
    }));
  const timed = positioned.map((entry) => {
    const eventAt = replayEventVisualProgress(
      entry.fill,
      spec,
      config.width,
      config.height,
      config.duration,
      config.chartLeadSeconds,
      config.chartTrailSeconds,
      config.speedrunMode,
    );
    return { ...entry, eventAt, ageSeconds: (videoProgress - eventAt) * config.duration };
  }).sort((left, right) => left.eventAt - right.eventAt || left.index - right.index);
  const activeQueue = timed.filter((entry) => entry.ageSeconds >= 0).slice(-3);
  const upcoming = timed.find((entry) => entry.eventAt > videoProgress);
  const preFadeSeconds = 0.22;
  const secondsUntilNext = upcoming ? (upcoming.eventAt - videoProgress) * config.duration : Number.POSITIVE_INFINITY;
  const replacementOpacity = (index: number, visibleCount: number) => (
    index === 0 && visibleCount === 3 && secondsUntilNext <= preFadeSeconds
      ? clamp(secondsUntilNext / preFadeSeconds)
      : 1
  );
  const styleLifetime = style === "detailed" ? Number.POSITIVE_INFINITY : style === "hype" ? 1.35 : 1.45;
  const visibleQueue = activeQueue.filter((entry) => entry.ageSeconds <= styleLifetime);
  const isOnPlot = (entry: ExecutionPosition) => entry.x >= plot.x && entry.x <= plot.x + plot.width
    && entry.y >= plot.y && entry.y <= plot.y + plot.height;
  const dotRadius = (fill: TradeFill) => {
    const value = new Decimal(fill.quoteLamports)
      .div(fill.quoteScale ?? spec.episode.quoteScale ?? 1_000_000_000)
      .abs()
      .toNumber();
    const scaled = Number.isFinite(value) ? Math.log10(Math.max(1, value)) : 0;
    return clamp(7 + scaled * 1.25, 7, 13) * unit;
  };
  const elapsedSeconds = config.playbackElapsedSeconds ?? videoProgress * config.duration;
  const postChartTextOpacity = 1 - easeInOut(clamp((elapsedSeconds - config.duration) / 0.35));

  if (style !== "detailed") {
    // Dots are permanent chart markers: every fill keeps its dot once
    // revealed. Only the text overlays are limited to the recent queue.
    for (const entry of timed) {
      if (entry.ageSeconds < 0) continue;
      if (!isOnPlot(entry)) continue;
      const isBuy = entry.fill.side === "buy";
      const color = isBuy ? theme.positive : theme.negative;
      // Buy and sell executions share one high-visibility marker treatment;
      // color and the centered +/- glyph are the only visual distinction.
      const radius = dotRadius(entry.fill) * 1.7;
      const pulse = clamp(entry.ageMs / 620);
      if (pulse < 1) {
        context.beginPath();
        context.arc(entry.x, entry.y, radius + 20 * unit * pulse, 0, Math.PI * 2);
        context.strokeStyle = `${color}${Math.round((1 - pulse) * 180).toString(16).padStart(2, "0")}`;
        context.lineWidth = 3 * unit;
        context.stroke();
      }
      context.save();
      context.shadowColor = color;
      context.shadowBlur = 20 * unit;
      context.beginPath();
      context.arc(entry.x, entry.y, radius, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.shadowBlur = 0;
      context.lineWidth = Math.max(2 * unit, radius * 0.28);
      context.strokeStyle = theme.panelStrong;
      context.stroke();
      const arm = radius * 0.5;
      context.strokeStyle = theme.panelStrong;
      context.lineCap = "round";
      context.lineWidth = Math.max(2.5 * unit, radius * 0.3);
      context.beginPath();
      context.moveTo(entry.x - arm, entry.y);
      context.lineTo(entry.x + arm, entry.y);
      if (isBuy) {
        context.moveTo(entry.x, entry.y - arm);
        context.lineTo(entry.x, entry.y + arm);
      }
      context.stroke();
      context.restore();
    }
  }
  if (style === "minimal") return;
  if (postChartTextOpacity <= 0.001) return;
  if (style === "feed") {
    const lifetimeSeconds = 1.45;
    const visible = visibleQueue;
    const placed: Array<{ x: number; y: number; width: number; height: number }> = [];
    context.save();
    context.textBaseline = "middle";
    context.textAlign = "left";
    for (let index = 0; index < visible.length; index += 1) {
      const entry = visible[index]!;
      const color = entry.fill.side === "buy" ? theme.positive : theme.negative;
      const local = clamp(entry.ageSeconds / lifetimeSeconds);
      const entrance = easeInOut(clamp(entry.ageSeconds / 0.14));
      const naturalOpacity = entry.ageSeconds < 0.95 ? entrance : 1 - easeInOut(clamp((entry.ageSeconds - 0.95) / 0.5));
      const replacementFade = replacementOpacity(index, visible.length);
      const opacity = naturalOpacity * replacementFade * postChartTextOpacity;
      const rise = (18 + easeInOut(local) * 125) * unit;
      const label = `${entry.fill.side === "buy" ? "BUY" : "SELL"} ${compactExecutionValue(entry.fill, spec)}`;
      const fontSize = 54 * unit;
      const lineHeight = 68 * unit;
      context.font = `1000 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      const width = context.measureText(label).width;
      const baseX = clamp(entry.x - width / 2, plot.x + 12 * unit, plot.x + plot.width - width - 12 * unit);
      const baseY = clamp(entry.y - rise, plot.y + fontSize, plot.y + plot.height - fontSize * 0.5);
      const candidates = [
        [0, 0], [0, -lineHeight], [0, lineHeight],
        [-width * 0.65, 0], [width * 0.65, 0],
        [-width * 0.65, -lineHeight], [width * 0.65, -lineHeight],
        [-width * 0.65, lineHeight], [width * 0.65, lineHeight],
        [0, -lineHeight * 2], [0, lineHeight * 2],
      ].map(([offsetX, offsetY]) => ({
        x: clamp(baseX + offsetX!, plot.x + 12 * unit, plot.x + plot.width - width - 12 * unit),
        y: clamp(baseY + offsetY!, plot.y + fontSize, plot.y + plot.height - fontSize * 0.5),
      }));
      const clear = (candidate: { x: number; y: number }) => !placed.some((other) => (
        candidate.x < other.x + other.width + 18 * unit
        && candidate.x + width + 18 * unit > other.x
        && candidate.y - fontSize * 0.65 < other.y + other.height
        && candidate.y + fontSize * 0.65 > other.y
      ));
      const selected = candidates.find(clear) ?? {
        x: index % 2 === 0 ? plot.x + 12 * unit : plot.x + plot.width - width - 12 * unit,
        y: clamp(plot.y + fontSize + Math.floor(index / 2) * lineHeight, plot.y + fontSize, plot.y + plot.height - fontSize * 0.5),
      };
      const { x, y } = selected;
      placed.push({ x, y: y - fontSize * 0.65, width, height: fontSize * 1.3 });
      context.globalAlpha = opacity;
      context.lineJoin = "round";
      context.lineWidth = 10 * unit;
      context.strokeStyle = "rgba(0, 0, 0, .92)";
      context.shadowColor = "rgba(0, 0, 0, .9)";
      context.shadowBlur = 16 * unit;
      context.strokeText(label, x, y);
      context.fillStyle = color;
      context.shadowColor = color;
      context.shadowBlur = 18 * unit;
      context.fillText(label, x, y);
    }
    context.restore();
    return;
  }

  if (style === "hype") {
    // Oversized flat ticker, one fill at a time: uppercase mono with wide
    // tracking in flat theme color — no outline or neon glow — centered over
    // the full card. The newest fill crossfades over the one it replaces.
    const lifetime = 1.6;
    const entranceSeconds = 0.14;
    const activeAll = timed.filter((entry) => entry.ageSeconds >= 0);
    const newest = activeAll.at(-1);
    if (!newest) return;
    const entrance = easeInOut(clamp(newest.ageSeconds / entranceSeconds));
    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    (context as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${4 * unit}px`;
    // This treatment is an editorial overlay, so anchor it to the full card
    // rather than the chart plot (which is offset in the landscape layout).
    const centerX = config.width / 2;
    const tickerY = config.height / 2;
    const monoFont = (size: number) => `700 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const fitFont = (text: string, baseSize: number): number => {
      context.font = monoFont(baseSize);
      const width = context.measureText(text).width;
      const maxWidth = plot.width * 0.94;
      return width > maxWidth ? baseSize * (maxWidth / width) : baseSize;
    };
    // Every fill re-triggers the scale-in, so consecutive identical amounts
    // still read as separate executions.
    const drawTicker = (entry: (typeof activeAll)[number], alpha: number, pop: number) => {
      if (alpha <= 0.01) return;
      const isBuy = entry.fill.side === "buy";
      const color = isBuy ? theme.positive : theme.negative;
      const value = compactExecutionValue(entry.fill, spec).toUpperCase();
      const line = `${isBuy ? "BUYS" : "SELLS"} ${value}`;
      const fontSize = fitFont(line, 96 * unit);
      // Fast, restrained scale-in: begin slightly undersized and settle at
      // the final size alongside the existing entrance crossfade.
      const scale = 0.86 + 0.14 * pop;
      context.save();
      context.translate(centerX, tickerY);
      context.scale(scale, scale);
      context.globalAlpha = alpha * 0.88 * postChartTextOpacity;
      // A deeper dark shadow keeps the flat theme-colored text legible over
      // dense candles and bright custom backdrops without adding neon glow.
      context.shadowColor = "rgba(0, 0, 0, 1)";
      context.shadowBlur = 48 * unit;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 8 * unit;
      context.font = monoFont(fontSize);
      context.fillStyle = color;
      context.fillText(line, 0, 0);
      if (!isBuy) {
        const sold = new Decimal(entry.fill.tokenAmountRaw || 0).abs();
        const remaining = new Decimal(entry.fill.walletPostTokenRaw || 0).abs();
        const total = sold.plus(remaining);
        const percentage = total.gt(0) ? sold.div(total).mul(100).toNumber() : 100;
        if (Number.isFinite(percentage)) {
          const percentLabel = `${Math.max(0, Math.min(100, percentage)).toFixed(percentage < 10 ? 1 : 0)}%`;
          context.globalAlpha = alpha * 0.7 * postChartTextOpacity;
          context.font = monoFont(Math.max(22 * unit, fontSize * 0.34));
          context.fillText(percentLabel, 0, fontSize * 0.82);
        }
      }
      context.restore();
    };
    // The replaced fill drops out while the newest pops in over it.
    const previous = activeAll.at(-2);
    if (previous && entrance < 1 && previous.ageSeconds <= lifetime) drawTicker(previous, 1 - entrance, 1);
    if (newest.ageSeconds <= lifetime) {
      const exit = newest.ageSeconds < lifetime - 0.35 ? 1 : 1 - easeInOut(clamp((newest.ageSeconds - (lifetime - 0.35)) / 0.35));
      drawTicker(newest, entrance * exit, entrance);
    }
    context.restore();
    return;
  }

  // Detailed style — price tick + hairline leader + bordered mono chip.
  const labels: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let index = 0; index < visibleQueue.length; index += 1) {
    const entry = visibleQueue[index]!;
    if (!isOnPlot(entry)) continue;
    const isBuy = entry.fill.side === "buy";
    const color = isBuy ? theme.positive : theme.negative;
    const dir = isBuy ? 1 : -1; // buy annotates below the fill, sell above
    context.save();
    context.globalAlpha = replacementOpacity(index, visibleQueue.length) * postChartTextOpacity;

    // One-shot pulse ring on appearance
    const pulse = clamp(entry.ageMs / 620);
    if (pulse < 1) {
      context.beginPath();
      context.arc(entry.x, entry.y, 8 * unit + 26 * unit * pulse, 0, Math.PI * 2);
      context.strokeStyle = `${color}${Math.round((1 - pulse) * 128).toString(16).padStart(2, "0")}`;
      context.lineWidth = 2 * unit;
      context.stroke();
    }

    // Price tick — small triangle pointing at the fill
    const tick = 9 * unit;
    const tipY = entry.y + dir * 7 * unit;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(entry.x, tipY);
    context.lineTo(entry.x - tick, tipY + dir * tick * 1.6);
    context.lineTo(entry.x + tick, tipY + dir * tick * 1.6);
    context.closePath();
    context.fill();

    // Chip geometry
    const label = `${isBuy ? "▲ BUY" : "▼ SELL"} ${compactExecutionValue(entry.fill, spec)}`;
    const fontSize = 22 * unit;
    context.font = `600 ${fontSize}px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace`;
    const paddingX = 16 * unit;
    const chipWidth = context.measureText(label).width + paddingX * 2;
    const chipHeight = 40 * unit;
    const lead = 46 * unit;
    const x = clamp(entry.x - chipWidth / 2, plot.x + 8 * unit, plot.x + plot.width - chipWidth - 8 * unit);
    const baseY = dir === 1
      ? tipY + tick * 1.6 + lead
      : tipY - tick * 1.6 - lead - chipHeight;
    const y = [0, dir * 48, dir * 96, -dir * 48]
      .map((offset) => clamp(baseY + offset * unit, plot.y + 4 * unit, plot.y + plot.height - chipHeight - 4 * unit))
      .find((candidate) => !labels.some((placed) => x < placed.x + placed.width + 7 * unit
        && x + chipWidth + 7 * unit > placed.x
        && candidate < placed.y + placed.height + 6 * unit
        && candidate + chipHeight + 6 * unit > placed.y)) ?? baseY;
    labels.push({ x, y, width: chipWidth, height: chipHeight });

    // Leader — hairline from tick to chip edge
    const leaderFrom = tipY + dir * tick * 1.6;
    const leaderTo = dir === 1 ? y : y + chipHeight;
    context.strokeStyle = `${color}73`;
    context.lineWidth = 1.5 * unit;
    context.beginPath();
    context.moveTo(entry.x, leaderFrom);
    context.lineTo(entry.x, leaderTo);
    // Dogleg to the chip center when clamping shifted it sideways
    if (Math.abs(x + chipWidth / 2 - entry.x) > 12 * unit) {
      context.lineTo(x + chipWidth / 2, leaderTo);
    }
    context.stroke();

    // Chip — dark translucent fill, accent border at ~55%, two-tone mono text
    roundedRect(context, x, y, chipWidth, chipHeight, chipHeight / 2);
    context.fillStyle = theme.panelStrong;
    context.fill();
    context.strokeStyle = `${color}8c`;
    context.lineWidth = 1.5 * unit;
    context.stroke();
    context.textBaseline = "middle";
    const prefix = isBuy ? "▲ BUY " : "▼ SELL ";
    context.fillStyle = color;
    context.fillText(prefix, x + paddingX, y + chipHeight / 2 + 1);
    context.fillStyle = theme.text;
    context.fillText(label.slice(prefix.length), x + paddingX + context.measureText(prefix).width, y + chipHeight / 2 + 1);
    context.textBaseline = "alphabetic";
    context.restore();
  }
}

function drawSolanaGlyph(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string) {
  context.save();
  context.translate(x, y);
  context.scale(width / 24, height / 18);
  context.beginPath();
  context.moveTo(4, 3.5); context.lineTo(20, 3.5); context.lineTo(16.5, 7); context.lineTo(0.5, 7); context.closePath();
  context.moveTo(7.5, 7.5); context.lineTo(23.5, 7.5); context.lineTo(20, 11); context.lineTo(4, 11); context.closePath();
  context.moveTo(4, 11.5); context.lineTo(20, 11.5); context.lineTo(16.5, 15); context.lineTo(0.5, 15); context.closePath();
  
  context.fillStyle = fill;
  context.fill();
  context.restore();
}

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: Theme,
  config: RenderConfig,
  _progress: number,
): void {
  const unit = Math.min(width, height) / 1080;
  const isLandscape = width / height >= 1.45;

  context.fillStyle = theme.background;
  context.fillRect(0, 0, width, height);

  const style = config.backgroundStyle || "glow";

  if (config.backgroundImage) {
    const image = config.backgroundImage;
    const sourceWidth = image instanceof HTMLVideoElement ? image.videoWidth : (image as ImageBitmap).width;
    const sourceHeight = image instanceof HTMLVideoElement ? image.videoHeight : (image as ImageBitmap).height;
    if (sourceWidth > 0 && sourceHeight > 0) {
      const scale = Math.max(width / sourceWidth, height / sourceHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      context.fillStyle = "rgba(0, 0, 0, .34)";
      context.fillRect(0, 0, width, height);
    }
  } else if (style === "glow") {
    if (isLandscape) {
      const glow1 = context.createRadialGradient(width - 64 * unit, -64 * unit, 0, width - 64 * unit, -64 * unit, 480 * unit);
      glow1.addColorStop(0, `${theme.positive}22`);
      glow1.addColorStop(1, `${theme.positive}00`);
      context.fillStyle = glow1;
      context.fillRect(0, 0, width, height);

      const glow2 = context.createRadialGradient(width - 160 * unit, height, 0, width - 160 * unit, height, 400 * unit);
      glow2.addColorStop(0, `${theme.positive}11`);
      glow2.addColorStop(1, `${theme.positive}00`);
      context.fillStyle = glow2;
      context.fillRect(0, 0, width, height);
    } else {
      const glow1 = context.createRadialGradient(width - 40 * unit, -40 * unit, 0, width - 40 * unit, -40 * unit, 360 * unit);
      glow1.addColorStop(0, `${theme.positive}22`);
      glow1.addColorStop(1, `${theme.positive}00`);
      context.fillStyle = glow1;
      context.fillRect(0, 0, width, height);

      const glow2 = context.createRadialGradient(40 * unit, height - 40 * unit, 0, 40 * unit, height - 40 * unit, 360 * unit);
      glow2.addColorStop(0, `${theme.positive}15`);
      glow2.addColorStop(1, `${theme.positive}00`);
      context.fillStyle = glow2;
      context.fillRect(0, 0, width, height);
    }
  } else if (style === "grid") {
    context.strokeStyle = theme.grid;
    context.lineWidth = 1.5 * unit;
    const spacing = 80 * unit;
    for (let x = 0; x < width; x += spacing) {
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
    }
    for (let y = 0; y < height; y += spacing) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    }
  } else if (style === "particles") {
    context.fillStyle = theme.border;
    for (let i = 0; i < 150; i++) {
      // Deterministic pseudo-random based on index to avoid flicker
      const x = (Math.sin(i * 13) * 0.5 + 0.5) * width;
      const y = (Math.cos(i * 17) * 0.5 + 0.5) * height;
      const r = (Math.sin(i * 19) * 0.5 + 0.5) * 3 * unit + 1 * unit;
      context.beginPath(); context.arc(x, y, r, 0, Math.PI * 2); context.fill();
    }
  }

  context.strokeStyle = theme.border;
  context.lineWidth = Math.max(1, 1.5 * unit);
  const padding = 1.5 * unit;
  roundedRect(context, padding, padding, width - padding * 2, height - padding * 2, isLandscape ? 24 * unit : 40 * unit);
  context.stroke();
}

interface SpeedrunTimeline {
  anchors: number[];
  cumulative: number[];
  weights: number[];
  totalWeight: number;
}

function buildSpeedrunTimeline(startTimestamp: number, endTimestamp: number, trades: number[], interval: number): SpeedrunTimeline | null {
  if (endTimestamp <= startTimestamp) return null;
  const activity = [...new Set(trades.filter((timestamp) => Number.isFinite(timestamp) && timestamp >= startTimestamp && timestamp <= endTimestamp))]
    .sort((left, right) => left - right);
  if (!activity.length) return null;
  const anchors = [...new Set([startTimestamp, ...activity, endTimestamp])].sort((left, right) => left - right);
  if (anchors.length < 2) return null;
  const span = endTimestamp - startTimestamp;
  const activityGap = Math.max(1, interval * 2, span / 1_000);
  const firstTrade = activity[0]!;
  const lastTrade = activity.at(-1)!;
  const weights: number[] = [];
  const cumulative = [0];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const left = anchors[index]!;
    const right = anchors[index + 1]!;
    const gap = Math.max(0.001, right - left);
    const ratio = gap / activityGap;
    let weight = ratio <= 1 ? 1 : Math.min(4, 1 + Math.log2(ratio));
    if (right <= firstTrade || left >= lastTrade) weight = Math.min(0.3, weight);
    weights.push(weight);
    cumulative.push(cumulative.at(-1)! + weight);
  }
  return { anchors, cumulative, weights, totalWeight: cumulative.at(-1)! };
}

/** Converts video progress into market-time progress while expanding dense execution clusters. */
export function calculateSpeedrunReveal(progress: number, startTimestamp: number, endTimestamp: number, trades: number[], interval: number): number {
  const timeline = buildSpeedrunTimeline(startTimestamp, endTimestamp, trades, interval);
  if (!timeline) return replayEase(progress);
  const targetWeight = clamp(progress) * timeline.totalWeight;
  for (let index = 0; index < timeline.weights.length; index += 1) {
    const next = timeline.cumulative[index + 1]!;
    if (targetWeight <= next) {
      const local = (targetWeight - timeline.cumulative[index]!) / timeline.weights[index]!;
      const timestamp = timeline.anchors[index]! + (timeline.anchors[index + 1]! - timeline.anchors[index]!) * local;
      return clamp((timestamp - startTimestamp) / (endTimestamp - startTimestamp));
    }
  }
  return 1;
}

/** Inverse speedrun mapping used to synchronize indicators and audio with the chart. */
export function calculateSpeedrunProgressAtTimestamp(timestamp: number, startTimestamp: number, endTimestamp: number, trades: number[], interval: number): number {
  const timeline = buildSpeedrunTimeline(startTimestamp, endTimestamp, trades, interval);
  if (!timeline) return inverseReplayEase(clamp((timestamp - startTimestamp) / Math.max(1, endTimestamp - startTimestamp)));
  if (timestamp <= startTimestamp) return 0;
  if (timestamp >= endTimestamp) return 1;
  for (let index = 0; index < timeline.weights.length; index += 1) {
    const left = timeline.anchors[index]!;
    const right = timeline.anchors[index + 1]!;
    if (timestamp <= right) {
      const local = clamp((timestamp - left) / Math.max(0.001, right - left));
      return clamp((timeline.cumulative[index]! + timeline.weights[index]! * local) / timeline.totalWeight);
    }
  }
  return 1;
}

function drawLandscapeReplayFrame(
  context: CanvasRenderingContext2D,
  spec: ReplaySpec,
  config: RenderConfig,
  progress: number,
  theme: Theme,
): void {
  const { width, height } = config;
  const unit = height / 1080;
  const margin = 72 * unit;
  const points = spec.points.length
    ? [...spec.points].sort((left, right) => left.timestamp - right.timestamp)
    : [{ timestamp: spec.episode.startTimestamp, priceSol: "0", pnlSol: "0" }];
  const candles = [...(spec.candles ?? [])].sort((left, right) => left.timestamp - right.timestamp);
  const interval = replayCandleInterval(spec);
  const marketCapMultiplier = Number(spec.marketCapMultiplier ?? 0);
  const showMarketCap = config.chartMetric !== "price" && Number.isFinite(marketCapMultiplier) && marketCapMultiplier > 0;
  const chartValueFromPrice = (priceSol: number) => showMarketCap ? priceSol * marketCapMultiplier : priceSol;
  const chartStart = spec.chartStartTimestamp ?? Math.min(spec.episode.startTimestamp, candles[0]?.timestamp ?? points[0]!.timestamp);
  const chartEnd = spec.chartEndTimestamp ?? Math.max(
    spec.episode.endTimestamp,
    candles.length ? candles.at(-1)!.timestamp + interval : points.at(-1)!.timestamp,
  );
  const replayCandles = candles.filter((candle) => candle.timestamp >= chartStart - interval && candle.timestamp <= chartEnd);
  const chartSpan = Math.max(1, chartEnd - chartStart);
  const intro = 1; // Removed fade-in so video doesn't start blank
  const explicitTiming = config.chartLeadSeconds != null || config.chartTrailSeconds != null;
  const replayTiming = replayWindow(config.duration, true);
    let chartReveal = explicitTiming ? progress : replayEase(phase(progress, replayTiming.start, replayTiming.end));
  if (config.speedrunMode && !explicitTiming) {
    const trades = spec.episode.fills.map(f => f.timestamp);
    chartReveal = calculateSpeedrunReveal(phase(progress, replayTiming.start, replayTiming.end), chartStart, chartEnd, trades, interval);
  }
  const activeTimestamp = chartStart + chartSpan * chartReveal;
  const active = interpolateReplayAtTimestamp(points, activeTimestamp);
  const boughtSol = new Decimal(spec.episode.totalBoughtLamports).div(spec.episode.quoteScale ?? 1_000_000_000);
  const boughtDisplay = currencyValue(boughtSol, spec, config.currency);
  const activeValue = currencyValue(active.pnl, spec, config.currency);
  const roi = boughtSol.isZero() ? new Decimal(0) : active.pnl.div(boughtSol).mul(100);
  const isLoss = activeValue.isNegative();
  const outcomeColor = isLoss ? theme.negative : theme.positive;

  context.save();
  context.textAlign = "left";
  context.clearRect(0, 0, width, height);
  drawBackground(context, width, height, theme, config, progress);

  const leftX = margin;
  const leftWidth = 600 * unit;
  const chartX = leftX + leftWidth + 40 * unit;
  const chartY = 120 * unit;
  const chartWidth = width - chartX - margin;
  const chartHeight = height - 240 * unit;
  const slide = (1 - intro) * 30 * unit;

  

  context.fillStyle = theme.text;
  context.font = `900 ${104 * unit}px sans-serif`;
  context.fillText(spec.symbol.toUpperCase(), leftX, 180 * unit + slide);

  const pnlText = formatMoney(activeValue, config.currency, config.exactValues).replace(/^\+/, "");
  const pnlDisplay = `${activeValue.isPositive() ? "+" : activeValue.isNegative() ? "-" : ""}${pnlText.replace(/^-/, "")}`;
  context.font = `900 ${80 * unit}px sans-serif`;
  const textWidth = context.measureText(pnlDisplay).width;
  const boxWidth = textWidth + 140 * unit;
  const boxHeight = 110 * unit;
  const boxY = 220 * unit + slide;

  context.shadowColor = `${outcomeColor}33`;
  context.shadowBlur = 40 * unit;
  roundedRect(context, leftX, boxY, boxWidth, boxHeight, 16 * unit);
  context.fillStyle = outcomeColor;
  context.fill();
  context.shadowBlur = 0;

  if (config.currency === "SOL") {
    drawSolanaGlyph(context, leftX + 28 * unit, boxY + 34 * unit, 56 * unit, 42 * unit, "#000000");
  } else {
    context.fillStyle = theme.background;
    context.font = `900 ${64 * unit}px sans-serif`;
    context.fillText("$", leftX + 32 * unit, boxY + 82 * unit);
  }

  context.fillStyle = theme.background;
  context.font = `900 ${80 * unit}px sans-serif`;
  context.fillText(pnlDisplay, leftX + 104 * unit, boxY + 84 * unit);

  const metricsY = boxY + boxHeight + 90 * unit;
  const lineSpacing = 80 * unit;
  const alignCol2 = leftX + 200 * unit;
  const alignCol3 = leftX + 240 * unit;

  context.fillStyle = theme.muted;
  context.font = `500 ${40 * unit}px sans-serif`;
  context.fillText("PNL", leftX, metricsY);
  
  const roiText = `${roi.isPositive() ? "+" : ""}${roi.toFixed(config.exactValues ? 2 : 0)}%`;
  context.fillStyle = outcomeColor;
  context.font = `900 ${40 * unit}px sans-serif`;
  context.fillText(roiText, alignCol2, metricsY);

  context.fillStyle = theme.muted;
  context.font = `500 ${40 * unit}px sans-serif`;
  context.fillText("Invested", leftX, metricsY + lineSpacing);

  context.fillStyle = theme.positive;
  context.font = `bold ${40 * unit}px sans-serif`;
  context.fillText("≡", alignCol2, metricsY + lineSpacing);
  
  context.fillStyle = theme.text;
  context.font = `bold ${40 * unit}px sans-serif`;
  context.fillText(compactNumber(boughtDisplay.toNumber()), alignCol3, metricsY + lineSpacing);

  context.fillStyle = theme.muted;
  context.font = `500 ${40 * unit}px sans-serif`;
  context.fillText("Position", leftX, metricsY + lineSpacing * 2);

  context.fillStyle = theme.positive;
  context.font = `bold ${40 * unit}px sans-serif`;
  context.fillText("≡", alignCol2, metricsY + lineSpacing * 2);

  const pnlSol = active.pnl;
  const positionSol = boughtSol.plus(pnlSol);
  const positionDisplay = currencyValue(positionSol, spec, config.currency);
  context.fillStyle = theme.text;
  context.font = `bold ${40 * unit}px sans-serif`;
  context.fillText(compactNumber(positionDisplay.toNumber()), alignCol3, metricsY + lineSpacing * 2);

  context.globalAlpha = 1;

  const animatedCandles = replayCandles.flatMap((candle) => {
    if (candle.timestamp > activeTimestamp) return [];
    const local = clamp((activeTimestamp - candle.timestamp) / interval);
    const open = Number(candle.openSol);
    const finalHigh = Number(candle.highSol);
    const finalLow = Number(candle.lowSol);
    const finalClose = Number(candle.closeSol);
    const rising = finalClose >= open;
    const bodyProgress = easeInOut(local);
    const firstWickProgress = easeInOut(phase(local, 0, 0.32));
    const finalWickProgress = easeInOut(phase(local, 0.48, 1));
    const close = open + (finalClose - open) * bodyProgress;
    const highProbe = open + (finalHigh - open) * (rising ? finalWickProgress : firstWickProgress);
    const lowProbe = open + (finalLow - open) * (rising ? firstWickProgress : finalWickProgress);
    const high = Math.max(open, close, highProbe);
    const low = Math.min(open, close, lowProbe);
    if (![open, high, low, close].every(Number.isFinite)) return [];
    return [{ ...candle, open, high, low, close, local }];
  });
  const visiblePoints = points.filter((point) => point.timestamp >= chartStart - interval && point.timestamp <= activeTimestamp);
  const rawPriceValues = animatedCandles.length
    ? animatedCandles.flatMap((candle) => [candle.low, candle.high])
    : visiblePoints.map((point) => Number(point.priceSol));
  const referenceLines = chartReferenceLines(spec, config, activeTimestamp);
  const priceValues = [
    ...rawPriceValues.map(chartValueFromPrice),
    ...referenceLines.filter((line) => line.placement === "line" && line.priceSol != null).map((line) => chartValueFromPrice(line.priceSol!)),
  ];
  let minimum = Math.min(...priceValues.filter(Number.isFinite));
  let maximum = Math.max(...priceValues.filter(Number.isFinite));
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) minimum = maximum = 0;
  // Prices and market caps are never negative, so range padding must not
  // drag the axis below zero.
  const rangeFloor = minimum >= 0 ? 0 : Number.NEGATIVE_INFINITY;
  if (minimum === maximum) {
    const padding = Math.max(0.000001, Math.abs(minimum) * 0.08);
    minimum = Math.max(rangeFloor, minimum - padding);
    maximum += padding;
  } else {
    const padding = (maximum - minimum) * 0.08;
    minimum = Math.max(rangeFloor, minimum - padding);
    maximum += padding;
  }

  const plotX = chartX;
  const plotY = chartY;
  const plotWidth = chartWidth;
  const plotHeight = chartHeight;
  const displayWindow = chartDisplayWindow(config.chartAnimation ?? "progressive", chartStart, chartEnd, activeTimestamp, interval);
  const displayStart = displayWindow.start;
  const displayEnd = displayWindow.end;
  const displaySpan = Math.max(interval, displayEnd - displayStart);
  const xForTime = (timestamp: number) => plotX + clamp((timestamp - displayStart) / displaySpan) * plotWidth;
  const yForPrice = (price: number) => plotY + (1 - clamp((chartValueFromPrice(price) - minimum) / (maximum - minimum))) * plotHeight;

  context.save();
  context.strokeStyle = theme.grid;
  context.lineWidth = Math.max(1, unit);
  for (let index = 0; index <= 6; index += 1) {
    const x = plotX + plotWidth * index / 6;
    context.beginPath(); context.moveTo(x, plotY); context.lineTo(x, plotY + plotHeight); context.stroke();
  }
  const axisTicks = chartAxisTicks(minimum, maximum);
  const yForChartValue = (value: number) => plotY + (1 - clamp((value - minimum) / (maximum - minimum))) * plotHeight;
  for (const tick of axisTicks) {
    const y = yForChartValue(tick);
    context.beginPath(); context.moveTo(plotX, y); context.lineTo(plotX + plotWidth, y); context.stroke();
  }

  let headX = plotX;
  let headY = yForPrice(active.price);
  if (animatedCandles.length) {
    const visibleBarCount = Math.max(3.5, displaySpan / interval);
    const candleSpacing = plotWidth / visibleBarCount;
    const bodyWidth = clamp(candleSpacing * 0.64, 4 * unit, 18 * unit);
    const maximumVolume = Math.max(1, ...animatedCandles.map((candle) => Number(candle.volume) * candle.local).filter(Number.isFinite));
    const volumeHeight = plotHeight * 0.16;
    for (const candle of animatedCandles) {
      const x = xForTime(candle.timestamp);
      const volume = Math.max(0, Number(candle.volume) * candle.local);
      const rising = candle.close >= candle.open;
      context.fillStyle = `${rising ? theme.positive : theme.negative}24`;
      context.fillRect(
        x - bodyWidth / 2,
        plotY + plotHeight - (volume / maximumVolume) * volumeHeight,
        bodyWidth,
        (volume / maximumVolume) * volumeHeight,
      );
    }
    const style = config.chartStyle ?? "candlestick";
    if (style === "candlestick") {
      for (const candle of animatedCandles) {
        const x = xForTime(candle.timestamp);
        const rising = candle.close >= candle.open;
        const color = rising ? theme.positive : theme.negative;
        context.strokeStyle = `${color}cc`;
        context.lineWidth = (2.2 + 1.2 * candle.local) * unit;
        context.shadowColor = color;
        context.shadowBlur = candle.local < 1 ? (1 - candle.local) * 20 * unit : 0;
        context.beginPath();
        context.moveTo(x, yForPrice(candle.high));
        context.lineTo(x, yForPrice(candle.low));
        context.stroke();
        context.shadowBlur = 0;
        const bodyTop = Math.min(yForPrice(candle.open), yForPrice(candle.close));
        const bodyHeight = Math.max(3 * unit, Math.abs(yForPrice(candle.open) - yForPrice(candle.close)));
        context.fillStyle = rising ? `${color}de` : `${color}c8`;
        context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
        headX = x;
        headY = yForPrice(candle.close);
      }
    } else if (style === "bar") {
      for (const candle of animatedCandles) {
        const x = xForTime(candle.timestamp);
        const rising = candle.close >= candle.open;
        const color = rising ? theme.positive : theme.negative;
        context.strokeStyle = `${color}e6`;
        context.lineWidth = Math.max(2 * unit, (2.2 + 1.2 * candle.local) * unit);
        context.lineCap = "round";
        context.lineJoin = "round";
        
        context.beginPath();
        context.moveTo(x, yForPrice(candle.high));
        context.lineTo(x, yForPrice(candle.low));
        context.moveTo(x - bodyWidth / 2, yForPrice(candle.open));
        context.lineTo(x, yForPrice(candle.open));
        context.moveTo(x, yForPrice(candle.close));
        context.lineTo(x + bodyWidth / 2, yForPrice(candle.close));
        context.stroke();
        
        headX = x;
        headY = yForPrice(candle.close);
      }
    } else if (style === "line" || style === "area") {
      context.beginPath();
      context.moveTo(xForTime(animatedCandles[0]!.timestamp), yForPrice(animatedCandles[0]!.close));
      for (let i = 1; i < animatedCandles.length; i++) {
        context.lineTo(xForTime(animatedCandles[i]!.timestamp), yForPrice(animatedCandles[i]!.close));
      }
      
      if (style === "area") {
        const gradient = context.createLinearGradient(0, plotY, 0, plotY + plotHeight);
        gradient.addColorStop(0, `${outcomeColor}66`);
        gradient.addColorStop(1, `${outcomeColor}00`);
        
        context.lineTo(xForTime(animatedCandles[animatedCandles.length - 1]!.timestamp), plotY + plotHeight);
        context.lineTo(xForTime(animatedCandles[0]!.timestamp), plotY + plotHeight);
        context.fillStyle = gradient;
        context.fill();
        
        // Redraw line on top
        context.beginPath();
        context.moveTo(xForTime(animatedCandles[0]!.timestamp), yForPrice(animatedCandles[0]!.close));
        for (let i = 1; i < animatedCandles.length; i++) {
          context.lineTo(xForTime(animatedCandles[i]!.timestamp), yForPrice(animatedCandles[i]!.close));
        }
      }
      
      context.strokeStyle = outcomeColor;
      context.lineWidth = 4 * unit;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.shadowColor = outcomeColor;
      context.shadowBlur = 12 * unit;
      context.stroke();
      context.shadowBlur = 0;
      
      headX = xForTime(animatedCandles[animatedCandles.length - 1]!.timestamp);
      headY = yForPrice(animatedCandles[animatedCandles.length - 1]!.close);
    }
  } else {
    const visible = visiblePoints
      .map((point) => ({ x: xForTime(point.timestamp), y: yForPrice(Number(point.priceSol)), at: 0 }));
    if (visible.length === 1) visible.push({ x: plotX + 1, y: visible[0]!.y, at: 0 });
    if (visible.length) {
      context.beginPath();
      context.moveTo(visible[0]!.x, visible[0]!.y);
      visible.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.strokeStyle = theme.positive;
      context.lineWidth = 4 * unit;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.setLineDash([13 * unit, 10 * unit]);
      context.shadowColor = theme.positive;
      context.shadowBlur = 10 * unit;
      context.stroke();
      context.shadowBlur = 0;
      context.setLineDash([]);
      headX = visible.at(-1)!.x;
      headY = visible.at(-1)!.y;
    }
  }

  drawChartReferenceLines(context, referenceLines, yForPrice, plotX, plotY, plotWidth, plotHeight, unit, theme, config);

  drawExecutionIndicators(context, spec, config.tradeIndicatorStyle ?? "feed", progress, config, activeTimestamp, xForTime, yForPrice, {
    x: plotX, y: plotY, width: plotWidth, height: plotHeight,
  }, unit, theme);

  if (chartReveal > 0) {
    context.setLineDash([10 * unit, 9 * unit]);
    context.strokeStyle = `${outcomeColor}66`;
    context.lineWidth = 2 * unit;
    context.beginPath(); context.moveTo(headX, headY); context.lineTo(plotX + plotWidth, headY); context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(headX, headY, 11 * unit, 0, Math.PI * 2);
    context.fillStyle = outcomeColor;
    context.shadowColor = outcomeColor;
    context.shadowBlur = 22 * unit;
    context.fill();
    context.shadowBlur = 0;
  }
  
  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = `bold ${26 * unit}px ui-monospace, SFMono-Regular, monospace`;
  for (const tick of axisTicks) {
    const y = yForChartValue(tick);
    if (y < plotY + 34 * unit || y > plotY + plotHeight - 10 * unit) continue;
    const label = tick === 0
      ? (showMarketCap ? "$0" : "0")
      : showMarketCap ? formatMarketCap(tick, config.marketCapFormat ?? "auto", config.marketCapThreshold) : formatPrice(tick);
    context.fillText(label, chartX + chartWidth - 10 * unit, y - 8 * unit);
  }
  context.textAlign = "left";
  if (config.affiliateLink) {
    drawPill(context, config.affiliateLink, margin, height - 90 * unit, {
      fill: `${theme.text}1a`, stroke: `${theme.text}55`, color: theme.text,
      fontSize: 26 * unit, paddingX: 25 * unit,
    });
  }
  drawWalletDisclosure(context, spec, config, theme, margin, height - 30 * unit, width - margin * 2, 22 * unit);
  context.restore();
}

function drawPortraitReplayFrame(
  context: CanvasRenderingContext2D,
  spec: ReplaySpec,
  config: RenderConfig,
  progress: number,
  theme: Theme,
): void {
  const { width, height } = config;
  const unit = Math.min(width, height) / 1080;
  const points = spec.points.length
    ? [...spec.points].sort((left, right) => left.timestamp - right.timestamp)
    : [{ timestamp: spec.episode.startTimestamp, priceSol: "0", pnlSol: "0" }];
  const candles = [...(spec.candles ?? [])].sort((left, right) => left.timestamp - right.timestamp);
  const interval = replayCandleInterval(spec);
  const marketCapMultiplier = Number(spec.marketCapMultiplier ?? 0);
  const showMarketCap = config.chartMetric !== "price" && Number.isFinite(marketCapMultiplier) && marketCapMultiplier > 0;
  const chartValueFromPrice = (priceSol: number) => showMarketCap ? priceSol * marketCapMultiplier : priceSol;
  const chartStart = spec.chartStartTimestamp ?? Math.min(spec.episode.startTimestamp, candles[0]?.timestamp ?? points[0]!.timestamp);
  const chartEnd = spec.chartEndTimestamp ?? Math.max(
    spec.episode.endTimestamp,
    candles.length ? candles.at(-1)!.timestamp + interval : points.at(-1)!.timestamp,
  );
  const replayCandles = candles.filter((candle) => candle.timestamp >= chartStart - interval && candle.timestamp <= chartEnd);
  const chartSpan = Math.max(1, chartEnd - chartStart);
  const intro = 1; // Removed fade-in
  const explicitTiming = config.chartLeadSeconds != null || config.chartTrailSeconds != null;
  const replayTiming = replayWindow(config.duration, false);
    let chartReveal = explicitTiming ? progress : replayEase(phase(progress, replayTiming.start, replayTiming.end));
  if (config.speedrunMode && !explicitTiming) {
    const trades = spec.episode.fills.map(f => f.timestamp);
    chartReveal = calculateSpeedrunReveal(phase(progress, replayTiming.start, replayTiming.end), chartStart, chartEnd, trades, interval);
  }
  const activeTimestamp = chartStart + chartSpan * chartReveal;
  const active = interpolateReplayAtTimestamp(points, activeTimestamp);
  const boughtSol = new Decimal(spec.episode.totalBoughtLamports).div(spec.episode.quoteScale ?? 1_000_000_000);
  const boughtDisplay = currencyValue(boughtSol, spec, config.currency);
  const activeValue = currencyValue(active.pnl, spec, config.currency);
  const roi = boughtSol.isZero() ? new Decimal(0) : active.pnl.div(boughtSol).mul(100);
  const isLoss = activeValue.isNegative();
  const outcomeColor = isLoss ? theme.negative : theme.positive;

  context.save();
  context.textAlign = "left";
  context.clearRect(0, 0, width, height);
  drawBackground(context, width, height, theme, config, progress);

  const margin = 64 * unit;
  const slide = (1 - intro) * 26 * unit;

  

  context.fillStyle = theme.text;
  context.font = `900 ${104 * unit}px sans-serif`;
  context.fillText(spec.symbol.toUpperCase(), margin, 140 * unit + slide);

  const pnlText = formatMoney(activeValue, config.currency, config.exactValues).replace(/^\+/, "");
  const pnlDisplay = `${activeValue.isPositive() ? "+" : activeValue.isNegative() ? "-" : ""}${pnlText.replace(/^-/, "")}`;
  context.font = `900 ${80 * unit}px sans-serif`;
  const textWidth = context.measureText(pnlDisplay).width;
  const boxWidth = textWidth + 140 * unit;
  const boxHeight = 110 * unit;
  const boxY = 170 * unit + slide;

  context.shadowColor = `${outcomeColor}33`;
  context.shadowBlur = 40 * unit;
  roundedRect(context, margin, boxY, boxWidth, boxHeight, 16 * unit);
  context.fillStyle = outcomeColor;
  context.fill();
  context.shadowBlur = 0;

  if (config.currency === "SOL") {
    drawSolanaGlyph(context, margin + 28 * unit, boxY + 34 * unit, 56 * unit, 42 * unit, "#000000");
  } else {
    context.fillStyle = theme.background;
    context.font = `900 ${64 * unit}px sans-serif`;
    context.fillText("$", margin + 32 * unit, boxY + 82 * unit);
  }

  context.fillStyle = theme.background;
  context.font = `900 ${80 * unit}px sans-serif`;
  context.fillText(pnlDisplay, margin + 104 * unit, boxY + 84 * unit);

  const metricsStackHeight = 360 * unit;
  const metricsY = height - margin - metricsStackHeight;
  const lineSpacing = 110 * unit;

  const drawMetricRow = (label: string, value: string, yOffset: number, color: string, showEquiv = false) => {
    context.beginPath(); context.moveTo(margin, yOffset - 40 * unit); context.lineTo(width - margin, yOffset - 40 * unit);
    context.strokeStyle = theme.border; context.lineWidth = 2 * unit; context.stroke();

    context.fillStyle = theme.muted;
    context.font = `500 ${48 * unit}px sans-serif`;
    context.fillText(label, margin, yOffset);

    context.textAlign = "right";
    context.fillStyle = color;
    context.font = `bold ${48 * unit}px sans-serif`;
    if (showEquiv) {
      const vWidth = context.measureText(value).width;
      context.fillText(value, width - margin, yOffset);
      context.fillStyle = theme.positive;
      context.fillText("≡ ", width - margin - vWidth, yOffset);
    } else {
      context.fillText(value, width - margin, yOffset);
    }
    context.textAlign = "left";
  };

  const roiText = `${roi.isPositive() ? "+" : ""}${roi.toFixed(config.exactValues ? 2 : 0)}%`;
  drawMetricRow("PNL", roiText, metricsY + lineSpacing, outcomeColor);
  drawMetricRow("Invested", compactNumber(boughtDisplay.toNumber()), metricsY + lineSpacing * 2, "#ffffff", true);
  
  const pnlSol = active.pnl;
  const positionSol = boughtSol.plus(pnlSol);
  const positionDisplay = currencyValue(positionSol, spec, config.currency);
  drawMetricRow("Position", compactNumber(positionDisplay.toNumber()), metricsY + lineSpacing * 3, "#ffffff", true);

  context.globalAlpha = 1;

  const chartX = margin;
  const chartY = boxY + boxHeight + 80 * unit;
  const chartWidth = width - margin * 2;
  const chartHeight = metricsY - 80 * unit - chartY;

  const animatedCandles = replayCandles.flatMap((candle) => {
    if (candle.timestamp > activeTimestamp) return [];
    const local = clamp((activeTimestamp - candle.timestamp) / interval);
    const open = Number(candle.openSol);
    const finalHigh = Number(candle.highSol);
    const finalLow = Number(candle.lowSol);
    const finalClose = Number(candle.closeSol);
    const rising = finalClose >= open;
    const bodyProgress = easeInOut(local);
    const firstWickProgress = easeInOut(phase(local, 0, 0.32));
    const finalWickProgress = easeInOut(phase(local, 0.48, 1));
    const close = open + (finalClose - open) * bodyProgress;
    const highProbe = open + (finalHigh - open) * (rising ? finalWickProgress : firstWickProgress);
    const lowProbe = open + (finalLow - open) * (rising ? firstWickProgress : finalWickProgress);
    const high = Math.max(open, close, highProbe);
    const low = Math.min(open, close, lowProbe);
    if (![open, high, low, close].every(Number.isFinite)) return [];
    return [{ ...candle, open, high, low, close, local }];
  });
  const visiblePoints = points.filter((point) => point.timestamp >= chartStart - interval && point.timestamp <= activeTimestamp);
  const rawPriceValues = animatedCandles.length
    ? animatedCandles.flatMap((candle) => [candle.low, candle.high])
    : visiblePoints.map((point) => Number(point.priceSol));
  const referenceLines = chartReferenceLines(spec, config, activeTimestamp);
  const priceValues = [
    ...rawPriceValues.map(chartValueFromPrice),
    ...referenceLines.filter((line) => line.placement === "line" && line.priceSol != null).map((line) => chartValueFromPrice(line.priceSol!)),
  ];
  let minimum = Math.min(...priceValues.filter(Number.isFinite));
  let maximum = Math.max(...priceValues.filter(Number.isFinite));
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) minimum = maximum = 0;
  // Prices and market caps are never negative, so range padding must not
  // drag the axis below zero.
  const rangeFloor = minimum >= 0 ? 0 : Number.NEGATIVE_INFINITY;
  if (minimum === maximum) {
    const padding = Math.max(0.000001, Math.abs(minimum) * 0.08);
    minimum = Math.max(rangeFloor, minimum - padding);
    maximum += padding;
  } else {
    const padding = (maximum - minimum) * 0.08;
    minimum = Math.max(rangeFloor, minimum - padding);
    maximum += padding;
  }

  const plotX = chartX;
  const plotY = chartY;
  const plotWidth = chartWidth;
  const plotHeight = chartHeight;
  const displayWindow = chartDisplayWindow(config.chartAnimation ?? "progressive", chartStart, chartEnd, activeTimestamp, interval);
  const displayStart = displayWindow.start;
  const displayEnd = displayWindow.end;
  const displaySpan = Math.max(interval, displayEnd - displayStart);
  const xForTime = (timestamp: number) => plotX + clamp((timestamp - displayStart) / displaySpan) * plotWidth;
  const yForPrice = (price: number) => plotY + (1 - clamp((chartValueFromPrice(price) - minimum) / (maximum - minimum))) * plotHeight;

  context.save();
  context.strokeStyle = theme.grid;
  context.lineWidth = Math.max(1, unit);
  for (let index = 0; index <= 6; index += 1) {
    const x = plotX + plotWidth * index / 6;
    context.beginPath(); context.moveTo(x, plotY); context.lineTo(x, plotY + plotHeight); context.stroke();
  }
  const axisTicks = chartAxisTicks(minimum, maximum);
  const yForChartValue = (value: number) => plotY + (1 - clamp((value - minimum) / (maximum - minimum))) * plotHeight;
  for (const tick of axisTicks) {
    const y = yForChartValue(tick);
    context.beginPath(); context.moveTo(plotX, y); context.lineTo(plotX + plotWidth, y); context.stroke();
  }

  let headX = plotX;
  let headY = yForPrice(active.price);
  if (animatedCandles.length) {
    const visibleBarCount = Math.max(3.5, displaySpan / interval);
    const candleSpacing = plotWidth / visibleBarCount;
    const bodyWidth = clamp(candleSpacing * 0.64, 4 * unit, 18 * unit);
    const maximumVolume = Math.max(1, ...animatedCandles.map((candle) => Number(candle.volume) * candle.local).filter(Number.isFinite));
    const volumeHeight = plotHeight * 0.16;
    for (const candle of animatedCandles) {
      const x = xForTime(candle.timestamp);
      const volume = Math.max(0, Number(candle.volume) * candle.local);
      const rising = candle.close >= candle.open;
      context.fillStyle = `${rising ? theme.positive : theme.negative}24`;
      context.fillRect(
        x - bodyWidth / 2,
        plotY + plotHeight - (volume / maximumVolume) * volumeHeight,
        bodyWidth,
        (volume / maximumVolume) * volumeHeight,
      );
    }
    const style = config.chartStyle ?? "candlestick";
    if (style === "candlestick") {
      for (const candle of animatedCandles) {
        const x = xForTime(candle.timestamp);
        const rising = candle.close >= candle.open;
        const color = rising ? theme.positive : theme.negative;
        context.strokeStyle = `${color}cc`;
        context.lineWidth = (2.2 + 1.2 * candle.local) * unit;
        context.shadowColor = color;
        context.shadowBlur = candle.local < 1 ? (1 - candle.local) * 20 * unit : 0;
        context.beginPath();
        context.moveTo(x, yForPrice(candle.high));
        context.lineTo(x, yForPrice(candle.low));
        context.stroke();
        context.shadowBlur = 0;
        const bodyTop = Math.min(yForPrice(candle.open), yForPrice(candle.close));
        const bodyHeight = Math.max(3 * unit, Math.abs(yForPrice(candle.open) - yForPrice(candle.close)));
        context.fillStyle = rising ? `${color}de` : `${color}c8`;
        context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
        headX = x;
        headY = yForPrice(candle.close);
      }
    } else if (style === "bar") {
      for (const candle of animatedCandles) {
        const x = xForTime(candle.timestamp);
        const rising = candle.close >= candle.open;
        const color = rising ? theme.positive : theme.negative;
        context.strokeStyle = `${color}e6`;
        context.lineWidth = Math.max(2 * unit, (2.2 + 1.2 * candle.local) * unit);
        context.lineCap = "round";
        context.lineJoin = "round";
        
        context.beginPath();
        context.moveTo(x, yForPrice(candle.high));
        context.lineTo(x, yForPrice(candle.low));
        context.moveTo(x - bodyWidth / 2, yForPrice(candle.open));
        context.lineTo(x, yForPrice(candle.open));
        context.moveTo(x, yForPrice(candle.close));
        context.lineTo(x + bodyWidth / 2, yForPrice(candle.close));
        context.stroke();
        
        headX = x;
        headY = yForPrice(candle.close);
      }
    } else if (style === "line" || style === "area") {
      context.beginPath();
      context.moveTo(xForTime(animatedCandles[0]!.timestamp), yForPrice(animatedCandles[0]!.close));
      for (let i = 1; i < animatedCandles.length; i++) {
        context.lineTo(xForTime(animatedCandles[i]!.timestamp), yForPrice(animatedCandles[i]!.close));
      }
      
      if (style === "area") {
        const gradient = context.createLinearGradient(0, plotY, 0, plotY + plotHeight);
        gradient.addColorStop(0, `${outcomeColor}66`);
        gradient.addColorStop(1, `${outcomeColor}00`);
        
        context.lineTo(xForTime(animatedCandles[animatedCandles.length - 1]!.timestamp), plotY + plotHeight);
        context.lineTo(xForTime(animatedCandles[0]!.timestamp), plotY + plotHeight);
        context.fillStyle = gradient;
        context.fill();
        
        // Redraw line on top
        context.beginPath();
        context.moveTo(xForTime(animatedCandles[0]!.timestamp), yForPrice(animatedCandles[0]!.close));
        for (let i = 1; i < animatedCandles.length; i++) {
          context.lineTo(xForTime(animatedCandles[i]!.timestamp), yForPrice(animatedCandles[i]!.close));
        }
      }
      
      context.strokeStyle = outcomeColor;
      context.lineWidth = 4 * unit;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.shadowColor = outcomeColor;
      context.shadowBlur = 12 * unit;
      context.stroke();
      context.shadowBlur = 0;
      
      headX = xForTime(animatedCandles[animatedCandles.length - 1]!.timestamp);
      headY = yForPrice(animatedCandles[animatedCandles.length - 1]!.close);
    }
  } else {
    const visible = visiblePoints
      .map((point) => ({ x: xForTime(point.timestamp), y: yForPrice(Number(point.priceSol)), at: 0 }));
    if (visible.length === 1) visible.push({ x: plotX + 1, y: visible[0]!.y, at: 0 });
    if (visible.length) {
      context.beginPath();
      context.moveTo(visible[0]!.x, visible[0]!.y);
      visible.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.strokeStyle = theme.positive;
      context.lineWidth = 4 * unit;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.setLineDash([13 * unit, 10 * unit]);
      context.shadowColor = theme.positive;
      context.shadowBlur = 10 * unit;
      context.stroke();
      context.shadowBlur = 0;
      context.setLineDash([]);
      headX = visible.at(-1)!.x;
      headY = visible.at(-1)!.y;
    }
  }

  drawChartReferenceLines(context, referenceLines, yForPrice, plotX, plotY, plotWidth, plotHeight, unit, theme, config);

  drawExecutionIndicators(context, spec, config.tradeIndicatorStyle ?? "feed", progress, config, activeTimestamp, xForTime, yForPrice, {
    x: plotX, y: plotY, width: plotWidth, height: plotHeight,
  }, unit, theme);

  if (chartReveal > 0) {
    context.setLineDash([10 * unit, 9 * unit]);
    context.strokeStyle = `${outcomeColor}66`;
    context.lineWidth = 2 * unit;
    context.beginPath(); context.moveTo(headX, headY); context.lineTo(plotX + plotWidth, headY); context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(headX, headY, 11 * unit, 0, Math.PI * 2);
    context.fillStyle = outcomeColor;
    context.shadowColor = outcomeColor;
    context.shadowBlur = 22 * unit;
    context.fill();
    context.shadowBlur = 0;
  }

  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = `bold ${26 * unit}px ui-monospace, SFMono-Regular, monospace`;
  for (const tick of axisTicks) {
    const y = yForChartValue(tick);
    if (y < plotY + 34 * unit || y > plotY + plotHeight - 10 * unit) continue;
    const label = tick === 0
      ? (showMarketCap ? "$0" : "0")
      : showMarketCap ? formatMarketCap(tick, config.marketCapFormat ?? "auto", config.marketCapThreshold) : formatPrice(tick);
    context.fillText(label, chartX + chartWidth - 10 * unit, y - 8 * unit);
  }
  context.textAlign = "left";
  if (config.affiliateLink) {
    context.font = `bold ${32 * unit}px ui-monospace, SFMono-Regular, monospace`;
    const affiliateWidth = context.measureText(config.affiliateLink).width + 60 * unit;
    drawPill(context, config.affiliateLink, width / 2 - affiliateWidth / 2, height - 100 * unit, {
      fill: `${theme.text}1a`, stroke: `${theme.text}55`, color: theme.text,
      fontSize: 32 * unit, paddingX: 30 * unit,
    });
  }
  drawWalletDisclosure(context, spec, config, theme, margin, height - 16 * unit, width - margin * 2, 20 * unit);
  context.restore();
}

export function drawReplayFrame(
  context: CanvasRenderingContext2D,
  spec: ReplaySpec,
  config: RenderConfig,
  progressInput: number,
): void {
  const progress = clamp(progressInput);
  const { width, height } = config;
  const theme = THEMES[config.theme];
  if (width / height >= 1.45) {
    drawLandscapeReplayFrame(context, spec, config, progress, theme);
  } else {
    drawPortraitReplayFrame(context, spec, config, progress, theme);
  }
}
