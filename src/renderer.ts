import Decimal from "decimal.js";
import type { Currency, ReplayPoint, ReplaySpec, TradeFill } from "./domain";

export type ThemeName = "obsidian" | "neon" | "minimal" | "cyberpunk" | "sunset" | "matrix" | "hacker";
export type BackgroundStyle = "glow" | "solid" | "grid" | "particles";
export type WalletVisibility = "hidden" | "short" | "full";
export type ChartAnimation = "progressive" | "follow" | "fixed";

export interface RenderConfig {
  duration: number;
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
): number {
  const landscape = width / height >= 1.45;
  if ((leadSeconds != null || trailSeconds != null) && spec.chartStartTimestamp != null && spec.chartEndTimestamp != null) {
    const reveal = clamp((fill.timestamp - spec.chartStartTimestamp) / Math.max(1, spec.chartEndTimestamp - spec.chartStartTimestamp));
    return reveal;
  }
  const window = replayWindow(duration, landscape);
  if (!landscape) {
    return window.start + inverseReplayEase(eventProgress(fill, spec)) * (window.end - window.start);
  }
  const points = [...spec.points].sort((left, right) => left.timestamp - right.timestamp);
  const candles = [...(spec.candles ?? [])].sort((left, right) => left.timestamp - right.timestamp);
  const interval = replayCandleInterval(spec);
  const chartStart = spec.chartStartTimestamp ?? Math.min(spec.episode.startTimestamp, candles[0]?.timestamp ?? points[0]?.timestamp ?? spec.episode.startTimestamp);
  const chartEnd = spec.chartEndTimestamp ?? Math.max(
    spec.episode.endTimestamp,
    candles.length ? candles.at(-1)!.timestamp + interval : points.at(-1)?.timestamp ?? spec.episode.endTimestamp,
  );
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

  if (style === "glow") {
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

function calculateSpeedrunReveal(progress: number, startTimestamp: number, endTimestamp: number, trades: number[], interval: number): number {
  if (trades.length === 0 || endTimestamp <= startTimestamp) return replayEase(progress);
  
  const span = endTimestamp - startTimestamp;
  const segments = 200;
  const step = span / segments;
  const hotZoneRadius = Math.max(interval * 2, span * 0.05); // +/- 5% of timeline or 2 candles

  const weights = new Float64Array(segments);
  let totalWeight = 0;

  for (let i = 0; i < segments; i++) {
    const t = startTimestamp + i * step;
    let inHotZone = false;
    for (const trade of trades) {
      if (Math.abs(t - trade) <= hotZoneRadius) {
        inHotZone = true;
        break;
      }
    }
    const weight = inHotZone ? 6.0 : 1.0; // 6x slower in hot zones
    weights[i] = weight;
    totalWeight += weight;
  }

  const targetWeight = progress * totalWeight;
  let accumulated = 0;

  for (let i = 0; i < segments; i++) {
    const nextAccumulated = accumulated + weights[i]!;
    if (nextAccumulated >= targetWeight) {
      const fraction = (targetWeight - accumulated) / weights[i]!;
      return (i + fraction) / segments;
    }
    accumulated = nextAccumulated;
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
  if (minimum === maximum) {
    const padding = Math.max(0.000001, Math.abs(minimum) * 0.08);
    minimum -= padding;
    maximum += padding;
  } else {
    const padding = (maximum - minimum) * 0.08;
    minimum -= padding;
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
  for (let index = 0; index <= 4; index += 1) {
    const y = plotY + plotHeight * index / 4;
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

  const markerWindow = Math.max(2, interval);
  const markers: Array<{ timestamp: number; side: "buy" | "sell"; quote: Decimal; weightedPrice: Decimal }> = [];
  for (const fill of [...spec.episode.fills].sort((left, right) => left.timestamp - right.timestamp || left.slot - right.slot)) {
    const quote = new Decimal(fill.quoteLamports).div(fill.quoteScale ?? spec.episode.quoteScale ?? 1_000_000_000);
    const price = new Decimal(fill.estimatedPriceSol || 0);
    const previous = markers.at(-1);
    if (previous && previous.side === fill.side && fill.timestamp - previous.timestamp <= markerWindow) {
      previous.weightedPrice = previous.weightedPrice.mul(previous.quote).plus(price.mul(quote)).div(previous.quote.plus(quote));
      previous.quote = previous.quote.plus(quote);
    } else markers.push({ timestamp: fill.timestamp, side: fill.side, quote, weightedPrice: price });
  }
  const markerLabels: Array<{ x: number; y: number; width: number; height: number }> = [];
  // Pass 1: Draw all lines and dots first so they stay in the background
  markers.forEach((marker) => {
    if (marker.timestamp > activeTimestamp) return;
    const x = xForTime(marker.timestamp);
    const y = yForPrice(marker.weightedPrice.toNumber());
    const color = marker.side === "buy" ? theme.positive : theme.negative;
    context.setLineDash([8 * unit, 8 * unit]);
    context.strokeStyle = `${color}55`;
    context.lineWidth = 2 * unit;
    context.beginPath(); context.moveTo(x, plotY); context.lineTo(x, plotY + plotHeight); context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(x, y, 15 * unit, 0, Math.PI * 2);
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 28 * unit;
    context.fill();
    context.shadowBlur = 0;
    context.beginPath();
    context.arc(x, y, 6 * unit, 0, Math.PI * 2);
    context.fillStyle = theme.background;
    context.fill();
  });
  
  // Pass 2: Draw all labels on top
  markers.forEach((marker, index) => {
    if (marker.timestamp > activeTimestamp) return;
    const x = xForTime(marker.timestamp);
    const y = yForPrice(marker.weightedPrice.toNumber());
    const color = marker.side === "buy" ? theme.positive : theme.negative;
    const label = `${marker.side.toUpperCase()} ${formatMoney(marker.quote, spec.accountingCurrency ?? "SOL", true).replace(/^\+/, "")}`;
    context.font = `bold ${25 * unit}px ui-monospace, SFMono-Regular, monospace`;
    const labelWidth = context.measureText(label).width + 40 * unit;
    const labelX = clamp(x - labelWidth / 2, chartX + 18 * unit, chartX + chartWidth - labelWidth - 18 * unit);
    const above = marker.side === "buy" ? index % 2 === 0 : index % 2 !== 0;
    const baseLabelY = y + (above ? -72 : 35) * unit;
    const labelHeight = 48 * unit;
    const candidateOffsets = [0, -58, 58, -116, 116].map((offset) => offset * unit);
    const labelY = candidateOffsets
      .map((offset) => clamp(baseLabelY + offset, chartY, chartY + chartHeight - 48 * unit))
      .find((candidateY) => !markerLabels.some((placed) => (
        labelX < placed.x + placed.width + 8 * unit
        && labelX + labelWidth + 8 * unit > placed.x
        && candidateY < placed.y + placed.height + 6 * unit
        && candidateY + labelHeight + 6 * unit > placed.y
      ))) ?? clamp(baseLabelY, chartY, chartY + chartHeight - 48 * unit);
    markerLabels.push({ x: labelX, y: labelY, width: labelWidth, height: labelHeight });
    drawPill(context, label, labelX, labelY, {
      fill: theme.panelStrong, stroke: `${color}dd`, color,
      fontSize: 25 * unit, paddingX: 20 * unit,
    });
  });

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
  for (let index = 0; index < 3; index += 1) {
    const ratio = index / 2;
    const value = maximum - (maximum - minimum) * ratio;
    context.fillText(
      showMarketCap ? formatMarketCap(value, config.marketCapFormat ?? "auto", config.marketCapThreshold) : formatPrice(value),
      chartX + chartWidth - 10 * unit,
      plotY + ratio * (plotHeight - 8 * unit),
    );
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
  if (minimum === maximum) {
    const padding = Math.max(0.000001, Math.abs(minimum) * 0.08);
    minimum -= padding;
    maximum += padding;
  } else {
    const padding = (maximum - minimum) * 0.08;
    minimum -= padding;
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
  for (let index = 0; index <= 4; index += 1) {
    const y = plotY + plotHeight * index / 4;
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

  const markerWindow = Math.max(2, interval);
  const markers: Array<{ timestamp: number; side: "buy" | "sell"; quote: Decimal; weightedPrice: Decimal }> = [];
  for (const fill of [...spec.episode.fills].sort((left, right) => left.timestamp - right.timestamp || left.slot - right.slot)) {
    const quote = new Decimal(fill.quoteLamports).div(fill.quoteScale ?? spec.episode.quoteScale ?? 1_000_000_000);
    const price = new Decimal(fill.estimatedPriceSol || 0);
    const previous = markers.at(-1);
    if (previous && previous.side === fill.side && fill.timestamp - previous.timestamp <= markerWindow) {
      previous.weightedPrice = previous.weightedPrice.mul(previous.quote).plus(price.mul(quote)).div(previous.quote.plus(quote));
      previous.quote = previous.quote.plus(quote);
    } else markers.push({ timestamp: fill.timestamp, side: fill.side, quote, weightedPrice: price });
  }
  const markerLabels: Array<{ x: number; y: number; width: number; height: number }> = [];
  // Pass 1: Draw all lines and dots first so they stay in the background
  markers.forEach((marker) => {
    if (marker.timestamp > activeTimestamp) return;
    const x = xForTime(marker.timestamp);
    const y = yForPrice(marker.weightedPrice.toNumber());
    const color = marker.side === "buy" ? theme.positive : theme.negative;
    context.setLineDash([8 * unit, 8 * unit]);
    context.strokeStyle = `${color}55`;
    context.lineWidth = 2 * unit;
    context.beginPath(); context.moveTo(x, plotY); context.lineTo(x, plotY + plotHeight); context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(x, y, 15 * unit, 0, Math.PI * 2);
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 28 * unit;
    context.fill();
    context.shadowBlur = 0;
    context.beginPath();
    context.arc(x, y, 6 * unit, 0, Math.PI * 2);
    context.fillStyle = theme.background;
    context.fill();
  });
  
  // Pass 2: Draw all labels on top
  markers.forEach((marker, index) => {
    if (marker.timestamp > activeTimestamp) return;
    const x = xForTime(marker.timestamp);
    const y = yForPrice(marker.weightedPrice.toNumber());
    const color = marker.side === "buy" ? theme.positive : theme.negative;
    const label = `${marker.side.toUpperCase()} ${formatMoney(marker.quote, spec.accountingCurrency ?? "SOL", true).replace(/^\+/, "")}`;
    context.font = `bold ${25 * unit}px ui-monospace, SFMono-Regular, monospace`;
    const labelWidth = context.measureText(label).width + 40 * unit;
    const labelX = clamp(x - labelWidth / 2, chartX + 18 * unit, chartX + chartWidth - labelWidth - 18 * unit);
    const above = marker.side === "buy" ? index % 2 === 0 : index % 2 !== 0;
    const baseLabelY = y + (above ? -72 : 35) * unit;
    const labelHeight = 48 * unit;
    const candidateOffsets = [0, -58, 58, -116, 116].map((offset) => offset * unit);
    const labelY = candidateOffsets
      .map((offset) => clamp(baseLabelY + offset, chartY, chartY + chartHeight - 48 * unit))
      .find((candidateY) => !markerLabels.some((placed) => (
        labelX < placed.x + placed.width + 8 * unit
        && labelX + labelWidth + 8 * unit > placed.x
        && candidateY < placed.y + placed.height + 6 * unit
        && candidateY + labelHeight + 6 * unit > placed.y
      ))) ?? clamp(baseLabelY, chartY, chartY + chartHeight - 48 * unit);
    markerLabels.push({ x: labelX, y: labelY, width: labelWidth, height: labelHeight });
    drawPill(context, label, labelX, labelY, {
      fill: theme.panelStrong, stroke: `${color}dd`, color,
      fontSize: 25 * unit, paddingX: 20 * unit,
    });
  });

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
  for (let index = 0; index < 3; index += 1) {
    const ratio = index / 2;
    const value = maximum - (maximum - minimum) * ratio;
    context.fillText(
      showMarketCap ? formatMarketCap(value, config.marketCapFormat ?? "auto", config.marketCapThreshold) : formatPrice(value),
      chartX + chartWidth - 10 * unit,
      plotY + ratio * (plotHeight - 8 * unit),
    );
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
