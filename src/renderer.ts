import Decimal from "decimal.js";
import type { Currency, ReplayPoint, ReplaySpec, TradeFill } from "./domain";

export type ThemeName = "obsidian" | "neon" | "minimal";
export type WalletVisibility = "hidden" | "short" | "full";

export interface RenderConfig {
  duration: number;
  currency: Currency;
  theme: ThemeName;
  exactValues: boolean;
  walletVisibility: WalletVisibility;
  width: number;
  height: number;
  fps?: 30 | 60;
  chartMetric?: "marketCap" | "price";
  marketCapFormat?: "auto" | "thousands" | "millions";
  marketCapThreshold?: number;
  backgroundImage?: CanvasImageSource | null;
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
} as const;

type Theme = (typeof THEMES)[ThemeName];
type Coordinate = { x: number; y: number; at: number };

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function easeOut(value: number): number {
  const x = clamp(value);
  return 1 - (1 - x) ** 3;
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

function currencyValue(sol: Decimal, spec: ReplaySpec, currency: Currency): Decimal {
  if (currency === "SOL") return sol;
  return spec.usdPerSol ? sol.mul(spec.usdPerSol) : new Decimal(0);
}

function walletLabel(address: string, visibility: WalletVisibility): string {
  if (visibility === "hidden" || !address) return "TRADER PRIVATE";
  if (visibility === "short") return `${address.slice(0, 5)}…${address.slice(-5)}`;
  return address;
}

function pointProgress(point: ReplayPoint, spec: ReplaySpec): number {
  const start = spec.episode.startTimestamp;
  const span = Math.max(1, spec.episode.endTimestamp - start);
  return clamp((point.timestamp - start) / span);
}

function eventProgress(fill: TradeFill, spec: ReplaySpec): number {
  const start = spec.episode.startTimestamp;
  const span = Math.max(1, spec.episode.endTimestamp - start);
  return clamp((fill.timestamp - start) / span);
}

function interpolateReplay(points: ReplayPoint[], spec: ReplaySpec, timeline: number): { price: number; pnl: Decimal } {
  const timestamp = spec.episode.startTimestamp + timeline * Math.max(1, spec.episode.endTimestamp - spec.episode.startTimestamp);
  return interpolateReplayAtTimestamp(points, timestamp);
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

function traceSmoothPath(context: CanvasRenderingContext2D, points: Coordinate[]): void {
  if (!points.length) return;
  context.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    const midpointX = (previous.x + point.x) / 2;
    context.bezierCurveTo(midpointX, previous.y, midpointX, point.y, point.x, point.y);
  }
}

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: Theme,
  image: CanvasImageSource | null | undefined,
  progress: number,
): void {
  if (image) {
    const source = image as CanvasImageSource & { width?: number; height?: number };
    const sourceWidth = Number(source.width ?? width);
    const sourceHeight = Number(source.height ?? height);
    const cover = Math.max(width / sourceWidth, height / sourceHeight);
    const targetWidth = sourceWidth * cover;
    const targetHeight = sourceHeight * cover;
    context.drawImage(image, (width - targetWidth) / 2, (height - targetHeight) / 2, targetWidth, targetHeight);
    context.fillStyle = "rgba(1, 5, 3, .78)";
    context.fillRect(0, 0, width, height);
  } else {
    const gradient = context.createRadialGradient(width * 0.34, height * 0.26, 0, width * 0.34, height * 0.26, width * 0.95);
    gradient.addColorStop(0, theme.backgroundLift);
    gradient.addColorStop(0.48, theme.background);
    gradient.addColorStop(1, "#000201");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  const bloom = context.createRadialGradient(width * 0.48, height * 0.61, 0, width * 0.48, height * 0.61, width * 0.6);
  bloom.addColorStop(0, `${theme.positive}17`);
  bloom.addColorStop(0.55, `${theme.positive}08`);
  bloom.addColorStop(1, `${theme.positive}00`);
  context.fillStyle = bloom;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalCompositeOperation = "screen";
  context.translate((progress * width * 0.08) - width * 0.08, 0);
  const beam = context.createLinearGradient(0, 0, width, height);
  beam.addColorStop(0.25, `${theme.positive}00`);
  beam.addColorStop(0.48, `${theme.positive}09`);
  beam.addColorStop(0.58, `${theme.positive}00`);
  context.fillStyle = beam;
  context.fillRect(0, 0, width, height);
  context.restore();

  for (let index = 0; index < 20; index += 1) {
    const x = ((index * 83.17 + progress * 31) % 1000) / 1000 * width;
    const y = ((index * 157.31 + progress * 57) % 1000) / 1000 * height;
    const radius = (index % 3 + 1) * Math.min(width, height) / 1800;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = `${theme.positive}${index % 4 === 0 ? "22" : "0d"}`;
    context.fill();
  }

  const vignette = context.createRadialGradient(width / 2, height / 2, width * 0.2, width / 2, height / 2, width * 0.78);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.52)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawBrand(context: CanvasRenderingContext2D, theme: Theme, margin: number, width: number, unit: number, intro: number): void {
  context.save();
  context.globalAlpha = intro;
  roundedRect(context, margin, 32 * unit, 36 * unit, 36 * unit, 10 * unit);
  context.fillStyle = `${theme.positive}16`;
  context.fill();
  context.strokeStyle = `${theme.positive}88`;
  context.stroke();
  context.fillStyle = theme.positive;
  context.font = `bold ${21 * unit}px sans-serif`;
  context.fillText("W", margin + 8 * unit, 58 * unit);
  context.fillStyle = theme.text;
  context.font = `bold ${16 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText("WICKLAPSE", margin + 50 * unit, 56 * unit);
  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = `bold ${11 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText("TRADE REPLAY • SOCIAL CUT", width - margin, 55 * unit);
  context.restore();
}

function drawMetric(
  context: CanvasRenderingContext2D,
  theme: Theme,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  unit: number,
  emphasis = false,
): void {
  roundedRect(context, x, y, width, height, 15 * unit);
  context.fillStyle = emphasis ? `${theme.positive}12` : theme.panel;
  context.fill();
  context.strokeStyle = emphasis ? `${theme.positive}55` : theme.border;
  context.stroke();
  context.fillStyle = theme.muted;
  context.font = `bold ${9.5 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText(label, x + 16 * unit, y + 23 * unit);
  context.fillStyle = emphasis ? theme.positive : theme.text;
  context.font = `bold ${16 * unit}px sans-serif`;
  context.fillText(value, x + 16 * unit, y + 51 * unit);
}

function drawLegacyLandscapeReplayFrame(
  context: CanvasRenderingContext2D,
  spec: ReplaySpec,
  config: RenderConfig,
  progress: number,
  theme: Theme,
): void {
  const { width, height } = config;
  const unit = height / 1080;
  const margin = 58 * unit;
  const points = spec.points.length
    ? [...spec.points].sort((left, right) => left.timestamp - right.timestamp)
    : [{ timestamp: spec.episode.startTimestamp, priceSol: "0", pnlSol: "0" }];
  const intro = easeOut(phase(progress, 0, 0.1));
  const chartReveal = easeInOut(phase(progress, 0.07, 0.8));
  const active = interpolateReplay(points, spec, chartReveal);
  const boughtSol = new Decimal(spec.episode.totalBoughtLamports).div(1_000_000_000);
  const soldSol = new Decimal(spec.episode.totalSoldLamports).div(1_000_000_000);
  const finalPnlSol = new Decimal(spec.episode.approximatePnlLamports).div(1_000_000_000);
  const activeValue = currencyValue(active.pnl, spec, config.currency);
  const roi = boughtSol.isZero() ? new Decimal(0) : active.pnl.div(boughtSol).mul(100);
  const returnMultiple = boughtSol.isZero() ? new Decimal(0) : active.pnl.plus(boughtSol).div(boughtSol);
  const outcomeColor = activeValue.gte(0) ? theme.positive : theme.negative;

  context.save();
  context.textAlign = "left";
  context.clearRect(0, 0, width, height);
  drawBackground(context, width, height, theme, config.backgroundImage, progress);
  drawBrand(context, theme, margin, width, unit, intro);

  const leftX = margin;
  const leftWidth = 590 * unit;
  const chartX = leftX + leftWidth + 48 * unit;
  const chartY = 118 * unit;
  const chartWidth = width - chartX - margin;
  const chartHeight = 820 * unit;
  const heroSlide = (1 - intro) * 35 * unit;

  context.globalAlpha = intro;
  context.fillStyle = theme.muted;
  context.font = `bold ${21 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText(spec.episode.status === "closed" ? "NET REALIZED P&L" : "LIVE POSITION P&L", leftX, 154 * unit + heroSlide);
  const resultText = formatMoney(activeValue, config.currency, config.exactValues);
  let resultFont = resultText.length > 15 ? 116 : resultText.length > 11 ? 134 : 154;
  context.font = `bold ${resultFont * unit}px sans-serif`;
  while (resultFont > 92 && context.measureText(resultText).width > leftWidth) {
    resultFont -= 2;
    context.font = `bold ${resultFont * unit}px sans-serif`;
  }
  context.fillStyle = outcomeColor;
  context.shadowColor = outcomeColor;
  context.shadowBlur = 46 * unit;
  context.fillText(resultText, leftX, 300 * unit + heroSlide);
  context.shadowBlur = 0;

  const roiText = `${roi.isPositive() ? "+" : ""}${roi.toFixed(config.exactValues ? 2 : 0)}%`;
  const roiWidth = drawPill(context, roiText, leftX, 332 * unit + heroSlide, {
    fill: `${outcomeColor}1d`, stroke: `${outcomeColor}aa`, color: outcomeColor,
    fontSize: 25 * unit, paddingX: 21 * unit,
  });
  context.fillStyle = theme.text;
  context.font = `bold ${29 * unit}px sans-serif`;
  context.fillText(`${returnMultiple.toFixed(1)}× RETURN`, leftX + roiWidth + 20 * unit, 370 * unit + heroSlide);
  context.globalAlpha = 1;

  // Entry/exit values are intentionally large enough to survive X's mobile downscale.
  const splitWidth = (leftWidth - 18 * unit) / 2;
  const valueY = 408 * unit;
  [["FROM", boughtSol, false], ["TO", soldSol, true]].forEach(([label, value, emphasis], index) => {
    const x = leftX + index * (splitWidth + 18 * unit);
    roundedRect(context, x, valueY, splitWidth, 94 * unit, 16 * unit);
    context.fillStyle = emphasis ? `${theme.positive}10` : theme.panel;
    context.fill();
    context.strokeStyle = emphasis ? `${theme.positive}55` : theme.border;
    context.stroke();
    context.fillStyle = theme.muted;
    context.font = `bold ${15 * unit}px ui-monospace, SFMono-Regular, monospace`;
    context.fillText(String(label), x + 18 * unit, valueY + 29 * unit);
    context.fillStyle = emphasis ? theme.positive : theme.text;
    context.font = `bold ${29 * unit}px sans-serif`;
    context.fillText(formatMoney(currencyValue(value as Decimal, spec, config.currency), config.currency, false).replace(/^\+/, ""), x + 18 * unit, valueY + 70 * unit);
  });

  const identityY = 524 * unit;
  roundedRect(context, leftX, identityY, leftWidth, 108 * unit, 20 * unit);
  context.fillStyle = theme.panelStrong;
  context.fill();
  context.strokeStyle = theme.border;
  context.stroke();
  context.beginPath();
  context.arc(leftX + 53 * unit, identityY + 54 * unit, 31 * unit, 0, Math.PI * 2);
  const tokenGradient = context.createLinearGradient(leftX + 20 * unit, identityY + 20 * unit, leftX + 84 * unit, identityY + 84 * unit);
  tokenGradient.addColorStop(0, theme.positiveSoft);
  tokenGradient.addColorStop(0.52, theme.positive);
  tokenGradient.addColorStop(1, theme.negative);
  context.fillStyle = tokenGradient;
  context.fill();
  context.fillStyle = theme.background;
  context.font = `bold ${19 * unit}px sans-serif`;
  context.textAlign = "center";
  context.fillText(spec.symbol.slice(0, 2), leftX + 53 * unit, identityY + 61 * unit);
  context.textAlign = "left";
  context.fillStyle = theme.text;
  context.font = `bold ${41 * unit}px sans-serif`;
  context.fillText(`$${spec.symbol}`, leftX + 103 * unit, identityY + 53 * unit);
  context.fillStyle = theme.positive;
  context.font = `bold ${16 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText(spec.tradeDataSource === "axiom" ? "AXIOM EXACT FILLS" : "ON-CHAIN FILLS", leftX + 105 * unit, identityY + 82 * unit);

  const statsY = 654 * unit;
  const statGap = 16 * unit;
  const statWidth = (leftWidth - statGap) / 2;
  ([
    ["EXECUTIONS", `${spec.episode.fills.length}`],
    ["POSITION", spec.episode.status.toUpperCase()],
  ] as Array<[string, string]>).forEach(([label, value], index) => {
    const x = leftX + index * (statWidth + statGap);
    roundedRect(context, x, statsY, statWidth, 94 * unit, 16 * unit);
    context.fillStyle = theme.panel;
    context.fill();
    context.strokeStyle = theme.border;
    context.stroke();
    context.fillStyle = theme.muted;
    context.font = `bold ${14 * unit}px ui-monospace, SFMono-Regular, monospace`;
    context.fillText(label, x + 18 * unit, statsY + 29 * unit);
    context.fillStyle = theme.text;
    context.font = `bold ${28 * unit}px sans-serif`;
    context.fillText(value, x + 18 * unit, statsY + 68 * unit);
  });

  const summaryIntro = easeOut(phase(progress, 0.76, 0.9));
  context.globalAlpha = 0.25 + summaryIntro * 0.75;
  const netY = 770 * unit + (1 - summaryIntro) * 20 * unit;
  roundedRect(context, leftX, netY, leftWidth, 126 * unit, 20 * unit);
  context.fillStyle = `${theme.positive}10`;
  context.fill();
  context.strokeStyle = `${theme.positive}66`;
  context.lineWidth = 1.5 * unit;
  context.stroke();
  context.fillStyle = theme.muted;
  context.font = `bold ${16 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText("FINAL NET RESULT", leftX + 22 * unit, netY + 37 * unit);
  context.fillStyle = theme.positive;
  context.font = `bold ${40 * unit}px sans-serif`;
  context.fillText(formatMoney(currencyValue(finalPnlSol, spec, config.currency), config.currency, config.exactValues), leftX + 22 * unit, netY + 91 * unit);
  context.globalAlpha = 1;

  // Right-side chart owns most of the frame and remains readable at feed size.
  roundedRect(context, chartX, chartY, chartWidth, chartHeight, 28 * unit);
  context.fillStyle = "rgba(2, 8, 5, .72)";
  context.fill();
  context.strokeStyle = theme.border;
  context.stroke();
  context.fillStyle = theme.muted;
  context.font = `bold ${16 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText(spec.marketDataSource === "ohlcv" ? "PRICE ACTION" : "EXECUTION PRICE PATH", chartX + 28 * unit, chartY + 38 * unit);
  context.textAlign = "right";
  context.fillStyle = theme.positive;
  context.font = `bold ${17 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText(`LIVE  ${formatPrice(active.price)}`, chartX + chartWidth - 28 * unit, chartY + 38 * unit);
  context.textAlign = "left";

  const prices = points.map((point) => Number(point.priceSol)).filter(Number.isFinite);
  let minimum = Math.min(...prices);
  let maximum = Math.max(...prices);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) minimum = maximum = 0;
  if (minimum === maximum) {
    minimum -= Math.max(0.000001, Math.abs(minimum) * 0.08);
    maximum += Math.max(0.000001, Math.abs(maximum) * 0.08);
  }
  const pricePadding = (maximum - minimum) * 0.12;
  minimum -= pricePadding;
  maximum += pricePadding;

  const plotX = chartX + 28 * unit;
  const plotY = chartY + 70 * unit;
  const plotWidth = chartWidth - 102 * unit;
  const plotHeight = chartHeight - 112 * unit;
  context.save();
  roundedRect(context, chartX, chartY, chartWidth, chartHeight, 28 * unit);
  context.clip();
  context.strokeStyle = theme.grid;
  context.lineWidth = Math.max(1, unit);
  for (let index = 0; index <= 6; index += 1) {
    const x = plotX + plotWidth * index / 6;
    context.beginPath(); context.moveTo(x, plotY); context.lineTo(x, plotY + plotHeight); context.stroke();
  }
  for (let index = 0; index <= 5; index += 1) {
    const y = plotY + plotHeight * index / 5;
    context.beginPath(); context.moveTo(plotX, y); context.lineTo(plotX + plotWidth, y); context.stroke();
  }

  let coordinates = points.map((point) => ({
    x: plotX + pointProgress(point, spec) * plotWidth,
    y: plotY + (1 - (Number(point.priceSol) - minimum) / (maximum - minimum)) * plotHeight,
    at: pointProgress(point, spec),
  }));
  if (coordinates.length === 1) {
    const only = coordinates[0]!;
    coordinates = [{ x: plotX, y: only.y, at: 0 }, { x: plotX + plotWidth, y: only.y, at: 1 }];
  }
  const visible = coordinates.filter((point) => point.at <= chartReveal);
  let head = visible.at(-1) ?? coordinates[0]!;
  const next = coordinates.find((point) => point.at > chartReveal);
  if (next && next.at > head.at) {
    const local = clamp((chartReveal - head.at) / (next.at - head.at));
    head = { x: head.x + (next.x - head.x) * local, y: head.y + (next.y - head.y) * local, at: chartReveal };
  }
  const pathPoints = [...visible];
  if (!pathPoints.length || pathPoints.at(-1)?.x !== head.x || pathPoints.at(-1)?.y !== head.y) pathPoints.push(head);
  const area = context.createLinearGradient(0, plotY, 0, plotY + plotHeight);
  area.addColorStop(0, `${theme.positive}62`);
  area.addColorStop(0.64, `${theme.positive}18`);
  area.addColorStop(1, `${theme.positive}00`);
  context.beginPath();
  context.moveTo(pathPoints[0]!.x, plotY + plotHeight);
  traceSmoothPath(context, pathPoints);
  context.lineTo(head.x, plotY + plotHeight);
  context.closePath();
  context.fillStyle = area;
  context.fill();
  for (const [lineWidth, alpha, blur] of [[22, "20", 40], [11, "72", 25], [6, "ff", 12]] as const) {
    context.beginPath();
    traceSmoothPath(context, pathPoints);
    context.strokeStyle = `${theme.positive}${alpha}`;
    context.lineWidth = lineWidth * unit;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.shadowColor = theme.positive;
    context.shadowBlur = blur * unit;
    context.stroke();
  }
  context.shadowBlur = 0;

  spec.episode.fills.forEach((fill, index) => {
    const at = eventProgress(fill, spec);
    if (at > chartReveal) return;
    const landing = phase(chartReveal, at, Math.min(1, at + 0.075));
    const point = coordinates.reduce((best, candidate) => Math.abs(candidate.at - at) < Math.abs(best.at - at) ? candidate : best, coordinates[0]!);
    const color = fill.side === "buy" ? theme.positive : theme.negative;
    const impact = 1 - landing;
    context.beginPath();
    context.arc(point.x, point.y, (11 + impact * 34) * unit, 0, Math.PI * 2);
    context.strokeStyle = `${color}${impact > 0.4 ? "dd" : "55"}`;
    context.lineWidth = 3 * unit;
    context.stroke();
    context.beginPath();
    context.arc(point.x, point.y, 9 * unit, 0, Math.PI * 2);
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 24 * unit;
    context.fill();
    context.shadowBlur = 0;
    const quote = new Decimal(fill.quoteLamports).div(1_000_000_000);
    const label = `${fill.side.toUpperCase()} ${quote.toDecimalPlaces(3).toString()} SOL`;
    context.font = `bold ${16 * unit}px ui-monospace, SFMono-Regular, monospace`;
    const labelWidth = context.measureText(label).width + 30 * unit;
    const labelX = clamp(point.x - labelWidth / 2, chartX + 12 * unit, chartX + chartWidth - labelWidth - 12 * unit);
    const labelY = clamp(point.y + (index % 2 === 0 ? -58 : 24) * unit, chartY + 50 * unit, chartY + chartHeight - 50 * unit);
    drawPill(context, label, labelX, labelY, {
      fill: "rgba(1, 7, 4, .95)", stroke: `${color}aa`, color,
      fontSize: 16 * unit, paddingX: 15 * unit,
    });
  });

  if (chartReveal > 0) {
    const pulse = 1 + Math.sin(progress * Math.PI * 24) * 0.12;
    context.beginPath();
    context.arc(head.x, head.y, 45 * unit * pulse, 0, Math.PI * 2);
    context.fillStyle = `${theme.positive}16`;
    context.fill();
    context.beginPath();
    context.arc(head.x, head.y, 15 * unit, 0, Math.PI * 2);
    context.fillStyle = theme.positiveSoft;
    context.shadowColor = theme.positive;
    context.shadowBlur = 40 * unit;
    context.fill();
    context.shadowBlur = 0;
    context.setLineDash([10 * unit, 10 * unit]);
    context.strokeStyle = `${theme.positive}66`;
    context.beginPath(); context.moveTo(head.x, head.y); context.lineTo(plotX + plotWidth, head.y); context.stroke();
    context.setLineDash([]);
  }
  context.restore();

  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = `bold ${14 * unit}px ui-monospace, SFMono-Regular, monospace`;
  for (let index = 0; index < 4; index += 1) {
    const ratio = index / 3;
    context.fillText(formatPrice(maximum - (maximum - minimum) * ratio), chartX + chartWidth - 18 * unit, plotY + 10 * unit + ratio * (plotHeight - 12 * unit));
  }
  context.textAlign = "left";

  const peakIndex = prices.indexOf(Math.max(...prices));
  const peakPoint = coordinates[Math.max(0, peakIndex)];
  if (peakPoint && chartReveal >= peakPoint.at) {
    const peakIntro = easeOut(peakPoint.at >= 0.999 ? phase(progress, 0.76, 0.9) : phase(chartReveal, peakPoint.at, Math.min(1, peakPoint.at + 0.1)));
    context.globalAlpha = peakIntro;
    const peakLabel = `${spec.marketDataSource === "ohlcv" ? "◆ ATH" : "◆ PEAK EXECUTION"} ${formatPrice(prices[peakIndex] ?? 0)}`;
    context.font = `bold ${16 * unit}px ui-monospace, SFMono-Regular, monospace`;
    const peakWidth = context.measureText(peakLabel).width + 34 * unit;
    drawPill(context, peakLabel, clamp(peakPoint.x - peakWidth / 2, chartX + 18 * unit, chartX + chartWidth - peakWidth - 18 * unit), Math.max(chartY + 55 * unit, peakPoint.y - 72 * unit), {
      fill: "rgba(30, 21, 2, .95)", stroke: `${theme.accent}cc`, color: theme.accent,
      fontSize: 16 * unit, paddingX: 17 * unit,
    });
    context.globalAlpha = 1;
  }

  const footerY = height - 31 * unit;
  context.fillStyle = theme.muted;
  context.font = `bold ${14 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText(walletLabel(spec.walletAddress, config.walletVisibility), margin, footerY);
  context.textAlign = "right";
  context.fillStyle = theme.positive;
  context.fillText("FLEX THE TRADE • MADE WITH WICKLAPSE", width - margin, footerY);
  context.textAlign = "left";

  for (const fill of spec.episode.fills) {
    const distance = Math.abs(chartReveal - eventProgress(fill, spec));
    if (distance >= 0.018) continue;
    const strength = (1 - distance / 0.018) * 0.06;
    context.fillStyle = fill.side === "buy" ? `rgba(15, 242, 139, ${strength})` : `rgba(255, 62, 120, ${strength})`;
    context.fillRect(0, 0, width, height);
  }
  context.restore();
}

function candleIntervalLabel(seconds: number): string {
  if (seconds >= 86_400) return `${Math.max(1, Math.round(seconds / 86_400))}D`;
  if (seconds >= 3_600) return `${Math.max(1, Math.round(seconds / 3_600))}H`;
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}S`;
  return `${Math.max(1, Math.round(seconds / 60))}M`;
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
  const margin = 62 * unit;
  const points = spec.points.length
    ? [...spec.points].sort((left, right) => left.timestamp - right.timestamp)
    : [{ timestamp: spec.episode.startTimestamp, priceSol: "0", pnlSol: "0" }];
  const candles = [...(spec.candles ?? [])].sort((left, right) => left.timestamp - right.timestamp);
  const interval = candles.length > 1
    ? Math.max(1, candles[Math.floor(candles.length / 2)]!.timestamp - candles[Math.floor(candles.length / 2) - 1]!.timestamp)
    : Math.max(1, Math.round(Math.max(1, spec.episode.endTimestamp - spec.episode.startTimestamp) / 60));
  const marketCapMultiplier = Number(spec.marketCapMultiplier ?? 0);
  const showMarketCap = config.chartMetric !== "price" && Number.isFinite(marketCapMultiplier) && marketCapMultiplier > 0;
  const chartValueFromPrice = (priceSol: number) => showMarketCap ? priceSol * marketCapMultiplier : priceSol;
  const chartStart = Math.min(spec.episode.startTimestamp, candles[0]?.timestamp ?? points[0]!.timestamp);
  const chartEnd = Math.max(
    spec.episode.endTimestamp,
    candles.length ? candles.at(-1)!.timestamp + interval : points.at(-1)!.timestamp,
  );
  const chartSpan = Math.max(1, chartEnd - chartStart);
  const intro = easeOut(phase(progress, 0, 0.08));
  // Move quickly enough to feel active in a short social clip, then hold the completed trade.
  const chartReveal = easeOut(phase(progress, 0.015, 0.8));
  const activeTimestamp = chartStart + chartSpan * chartReveal;
  const active = interpolateReplayAtTimestamp(points, activeTimestamp);
  const boughtSol = new Decimal(spec.episode.totalBoughtLamports).div(1_000_000_000);
  const activeValue = currencyValue(active.pnl, spec, config.currency);
  const roi = boughtSol.isZero() ? new Decimal(0) : active.pnl.div(boughtSol).mul(100);
  const returnMultiple = boughtSol.isZero() ? new Decimal(1) : active.pnl.plus(boughtSol).div(boughtSol);
  const outcomeColor = activeValue.gte(0) ? theme.positive : theme.negative;

  context.save();
  context.textAlign = "left";
  context.clearRect(0, 0, width, height);
  drawBackground(context, width, height, theme, config.backgroundImage, progress);

  // Large, quiet branding—no tiny edge metadata in the social export.
  context.globalAlpha = intro;
  roundedRect(context, margin, 42 * unit, 48 * unit, 48 * unit, 13 * unit);
  context.fillStyle = `${theme.positive}18`;
  context.fill();
  context.strokeStyle = `${theme.positive}99`;
  context.lineWidth = 1.5 * unit;
  context.stroke();
  context.fillStyle = theme.positive;
  context.font = `bold ${28 * unit}px sans-serif`;
  context.fillText("W", margin + 11 * unit, 76 * unit);
  context.fillStyle = theme.text;
  context.font = `bold ${23 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText("WICKLAPSE", margin + 66 * unit, 74 * unit);

  const leftX = margin;
  const leftWidth = 500 * unit;
  const chartX = leftX + leftWidth + 46 * unit;
  const chartY = 72 * unit;
  const chartWidth = width - chartX - margin;
  const chartHeight = 924 * unit;
  const slide = (1 - intro) * 30 * unit;

  context.fillStyle = theme.text;
  context.font = `bold ${64 * unit}px sans-serif`;
  const ticker = `$${spec.symbol}`;
  let tickerFont = 64;
  while (tickerFont > 42 && context.measureText(ticker).width > leftWidth) {
    tickerFont -= 2;
    context.font = `bold ${tickerFont * unit}px sans-serif`;
  }
  context.fillText(ticker, leftX, 185 * unit + slide);

  context.fillStyle = theme.muted;
  context.font = `bold ${24 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText("RUNNING P&L", leftX, 270 * unit + slide);
  const resultText = formatMoney(activeValue, config.currency, config.exactValues);
  let resultFont = resultText.length > 15 ? 104 : resultText.length > 11 ? 120 : 140;
  context.font = `bold ${resultFont * unit}px sans-serif`;
  while (resultFont > 86 && context.measureText(resultText).width > leftWidth) {
    resultFont -= 2;
    context.font = `bold ${resultFont * unit}px sans-serif`;
  }
  context.fillStyle = outcomeColor;
  context.shadowColor = outcomeColor;
  context.shadowBlur = 42 * unit;
  context.fillText(resultText, leftX, 407 * unit + slide);
  context.shadowBlur = 0;

  const roiText = `${roi.isPositive() ? "+" : ""}${roi.toFixed(config.exactValues ? 2 : 0)}%`;
  const roiWidth = drawPill(context, roiText, leftX, 448 * unit + slide, {
    fill: `${outcomeColor}1c`, stroke: `${outcomeColor}bb`, color: outcomeColor,
    fontSize: 31 * unit, paddingX: 25 * unit,
  });
  context.fillStyle = theme.text;
  context.font = `bold ${35 * unit}px sans-serif`;
  context.fillText(`${returnMultiple.toFixed(1)}×`, leftX + roiWidth + 25 * unit, 494 * unit + slide);

  const buyY = 570 * unit;
  roundedRect(context, leftX, buyY, leftWidth, 166 * unit, 24 * unit);
  context.fillStyle = theme.panelStrong;
  context.fill();
  context.strokeStyle = `${theme.positive}55`;
  context.lineWidth = 2 * unit;
  context.stroke();
  context.fillStyle = theme.muted;
  context.font = `bold ${23 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText("INITIAL BUY", leftX + 28 * unit, buyY + 48 * unit);
  context.fillStyle = theme.text;
  context.font = `bold ${54 * unit}px sans-serif`;
  const initialBuyText = formatMoney(currencyValue(boughtSol, spec, config.currency), config.currency, false).replace(/^\+/, "");
  context.fillText(initialBuyText, leftX + 28 * unit, buyY + 119 * unit);
  context.globalAlpha = 1;

  // Real trading-chart treatment: OHLC candles where available, angular execution path otherwise.
  roundedRect(context, chartX, chartY, chartWidth, chartHeight, 28 * unit);
  context.fillStyle = "rgba(2, 8, 5, .78)";
  context.fill();
  context.strokeStyle = theme.border;
  context.lineWidth = 1.5 * unit;
  context.stroke();

  context.fillStyle = theme.text;
  context.font = `bold ${27 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText(`${showMarketCap ? "MARKET CAP" : "PRICE / SOL"}  ·  ${candleIntervalLabel(interval)} CANDLES`, chartX + 34 * unit, chartY + 52 * unit);

  const animatedCandles = candles.flatMap((candle, index) => {
    if (candle.timestamp > activeTimestamp) return [];
    const nextTimestamp = candles[index + 1]?.timestamp ?? chartEnd;
    const local = clamp((activeTimestamp - candle.timestamp) / Math.max(1, nextTimestamp - candle.timestamp));
    const open = Number(candle.openSol);
    const finalHigh = Number(candle.highSol);
    const finalLow = Number(candle.lowSol);
    const finalClose = Number(candle.closeSol);
    const rising = finalClose >= open;
    // A deterministic intra-candle path avoids instantly revealing the final wick.
    // Green bars probe the low, develop the body, then extend the high; red bars do the inverse.
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
  const visiblePoints = points.filter((point) => point.timestamp <= activeTimestamp);
  const rawPriceValues = animatedCandles.length
    ? animatedCandles.flatMap((candle) => [candle.low, candle.high])
    : visiblePoints.map((point) => Number(point.priceSol));
  const priceValues = rawPriceValues.map(chartValueFromPrice);
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

  const plotX = chartX + 34 * unit;
  const plotY = chartY + 82 * unit;
  const plotWidth = chartWidth - 118 * unit;
  const plotHeight = chartHeight - 132 * unit;
  const displayStart = chartStart - interval * 0.35;
  const displayEnd = Math.min(
    chartEnd + interval * 0.35,
    Math.max(activeTimestamp + interval * 0.65, chartStart + interval * 3.5),
  );
  const displaySpan = Math.max(interval, displayEnd - displayStart);
  const xForTime = (timestamp: number) => plotX + clamp((timestamp - displayStart) / displaySpan) * plotWidth;
  const yForPrice = (price: number) => plotY + (1 - clamp((chartValueFromPrice(price) - minimum) / (maximum - minimum))) * plotHeight;

  context.save();
  roundedRect(context, chartX, chartY, chartWidth, chartHeight, 28 * unit);
  context.clip();
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
  } else {
    const visible = visiblePoints
      .map((point) => ({ x: xForTime(point.timestamp), y: yForPrice(Number(point.priceSol)), at: 0 }));
    if (visible.length === 1) visible.push({ x: plotX + 1, y: visible[0]!.y, at: 0 });
    if (visible.length) {
      context.beginPath();
      context.moveTo(visible[0]!.x, visible[0]!.y);
      visible.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.strokeStyle = theme.positive;
      context.lineWidth = 6 * unit;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.shadowColor = theme.positive;
      context.shadowBlur = 18 * unit;
      context.stroke();
      context.shadowBlur = 0;
      headX = visible.at(-1)!.x;
      headY = visible.at(-1)!.y;
    }
  }

  // Merge executions landing in the same candle so markers stay large and readable.
  const markerWindow = Math.max(2, interval);
  const markers: Array<{ timestamp: number; side: "buy" | "sell"; quote: Decimal; weightedPrice: Decimal }> = [];
  for (const fill of spec.episode.fills) {
    const quote = new Decimal(fill.quoteLamports).div(1_000_000_000);
    const price = new Decimal(fill.estimatedPriceSol || 0);
    const previous = markers.at(-1);
    if (previous && previous.side === fill.side && fill.timestamp - previous.timestamp <= markerWindow) {
      previous.weightedPrice = previous.weightedPrice.mul(previous.quote).plus(price.mul(quote)).div(previous.quote.plus(quote));
      previous.quote = previous.quote.plus(quote);
    } else markers.push({ timestamp: fill.timestamp, side: fill.side, quote, weightedPrice: price });
  }
  markers.forEach((marker, index) => {
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
    const label = `${marker.side.toUpperCase()} ${marker.quote.toDecimalPlaces(3).toString()} SOL`;
    context.font = `bold ${25 * unit}px ui-monospace, SFMono-Regular, monospace`;
    const labelWidth = context.measureText(label).width + 40 * unit;
    const labelX = clamp(x - labelWidth / 2, chartX + 18 * unit, chartX + chartWidth - labelWidth - 18 * unit);
    const above = marker.side === "buy" ? index % 2 === 0 : index % 2 !== 0;
    const labelY = clamp(y + (above ? -72 : 35) * unit, chartY + 62 * unit, chartY + chartHeight - 66 * unit);
    drawPill(context, label, labelX, labelY, {
      fill: "rgba(1, 7, 4, .96)", stroke: `${color}dd`, color,
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
  context.restore();

  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = `bold ${26 * unit}px ui-monospace, SFMono-Regular, monospace`;
  for (let index = 0; index < 3; index += 1) {
    const ratio = index / 2;
    const value = maximum - (maximum - minimum) * ratio;
    context.fillText(
      showMarketCap ? formatMarketCap(value, config.marketCapFormat ?? "auto", config.marketCapThreshold) : formatPrice(value),
      chartX + chartWidth - 20 * unit,
      plotY + 8 * unit + ratio * (plotHeight - 8 * unit),
    );
  }
  context.textAlign = "left";
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
  const unit = Math.min(width, height) / 1080;
  const theme = THEMES[config.theme];
  if (width / height >= 1.45) {
    drawLandscapeReplayFrame(context, spec, config, progress, theme);
    return;
  }
  const margin = Math.max(34 * unit, Math.min(width, height) * 0.044);
  const points = spec.points.length
    ? [...spec.points].sort((left, right) => left.timestamp - right.timestamp)
    : [{ timestamp: spec.episode.startTimestamp, priceSol: "0", pnlSol: "0" }];
  const intro = easeOut(phase(progress, 0, 0.1));
  const chartReveal = easeInOut(phase(progress, 0.08, 0.79));
  const active = interpolateReplay(points, spec, chartReveal);
  const boughtSol = new Decimal(spec.episode.totalBoughtLamports).div(1_000_000_000);
  const soldSol = new Decimal(spec.episode.totalSoldLamports).div(1_000_000_000);
  const activeValue = currencyValue(active.pnl, spec, config.currency);
  const roi = boughtSol.isZero() ? new Decimal(0) : active.pnl.div(boughtSol).mul(100);
  const returnMultiple = boughtSol.isZero() ? new Decimal(0) : active.pnl.plus(boughtSol).div(boughtSol);
  const positive = activeValue.gte(0);
  const outcomeColor = positive ? theme.positive : theme.negative;

  context.save();
  context.textAlign = "left";
  context.clearRect(0, 0, width, height);
  drawBackground(context, width, height, theme, config.backgroundImage, progress);
  drawBrand(context, theme, margin, width, unit, intro);

  // Hero result: deliberately oversized for a social-media first read.
  const heroSlide = (1 - intro) * 26 * unit;
  context.globalAlpha = intro;
  context.fillStyle = theme.muted;
  context.font = `bold ${12 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText(spec.episode.status === "closed" ? "NET REALIZED P&L" : "LIVE POSITION P&L", margin, 108 * unit + heroSlide);
  context.fillStyle = outcomeColor;
  context.shadowColor = outcomeColor;
  context.shadowBlur = 34 * unit;
  const resultText = formatMoney(activeValue, config.currency, config.exactValues);
  const resultFont = resultText.length > 15 ? 62 : resultText.length > 11 ? 72 : 84;
  context.font = `bold ${resultFont * unit}px sans-serif`;
  context.fillText(resultText, margin, 184 * unit + heroSlide);
  context.shadowBlur = 0;

  const roiText = `${roi.isPositive() ? "+" : ""}${roi.toFixed(config.exactValues ? 2 : 0)}%`;
  const roiWidth = drawPill(context, roiText, margin, 205 * unit + heroSlide, {
    fill: `${outcomeColor}18`,
    stroke: `${outcomeColor}88`,
    color: outcomeColor,
    fontSize: 14 * unit,
    paddingX: 14 * unit,
  });
  context.fillStyle = theme.text;
  context.font = `bold ${17 * unit}px sans-serif`;
  context.fillText(`${returnMultiple.toFixed(1)}× RETURN`, margin + roiWidth + 14 * unit, 230 * unit + heroSlide);

  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = `bold ${10 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText("FROM", width - margin, 127 * unit + heroSlide);
  context.fillStyle = theme.text;
  context.font = `bold ${19 * unit}px sans-serif`;
  context.fillText(formatMoney(currencyValue(boughtSol, spec, config.currency), config.currency, false).replace(/^\+/, ""), width - margin, 153 * unit + heroSlide);
  context.fillStyle = theme.muted;
  context.font = `bold ${10 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText("TO", width - margin, 184 * unit + heroSlide);
  context.fillStyle = outcomeColor;
  context.font = `bold ${19 * unit}px sans-serif`;
  context.fillText(formatMoney(currencyValue(soldSol, spec, config.currency), config.currency, false).replace(/^\+/, ""), width - margin, 210 * unit + heroSlide);
  context.textAlign = "left";
  context.globalAlpha = 1;

  // Token identity bar bridges the headline and chart.
  const identityY = 258 * unit;
  const identityHeight = 64 * unit;
  roundedRect(context, margin, identityY, width - margin * 2, identityHeight, 18 * unit);
  context.fillStyle = theme.panelStrong;
  context.fill();
  context.strokeStyle = theme.border;
  context.stroke();
  context.beginPath();
  context.arc(margin + 32 * unit, identityY + identityHeight / 2, 19 * unit, 0, Math.PI * 2);
  const tokenGradient = context.createLinearGradient(margin + 12 * unit, identityY + 12 * unit, margin + 52 * unit, identityY + 52 * unit);
  tokenGradient.addColorStop(0, theme.positiveSoft);
  tokenGradient.addColorStop(0.5, theme.positive);
  tokenGradient.addColorStop(1, theme.negative);
  context.fillStyle = tokenGradient;
  context.fill();
  context.fillStyle = theme.background;
  context.font = `bold ${13 * unit}px sans-serif`;
  context.textAlign = "center";
  context.fillText(spec.symbol.slice(0, 2), margin + 32 * unit, identityY + 37 * unit);
  context.textAlign = "left";
  context.fillStyle = theme.text;
  context.font = `bold ${25 * unit}px sans-serif`;
  context.fillText(`$${spec.symbol}`, margin + 65 * unit, identityY + 40 * unit);
  const statusText = spec.episode.status === "closed" ? "CLOSED TRADE" : "OPEN POSITION";
  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = `bold ${10 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText(`${spec.episode.fills.length} EXECUTIONS  •  ${statusText}`, width - margin - 18 * unit, identityY + 26 * unit);
  context.fillStyle = theme.positive;
  context.fillText(spec.tradeDataSource === "axiom" ? "AXIOM EXACT FILLS" : "ON-CHAIN FILLS", width - margin - 18 * unit, identityY + 45 * unit);
  context.textAlign = "left";

  const prices = points.map((point) => Number(point.priceSol)).filter(Number.isFinite);
  let minimum = Math.min(...prices);
  let maximum = Math.max(...prices);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) minimum = maximum = 0;
  if (minimum === maximum) {
    minimum -= Math.max(0.000001, Math.abs(minimum) * 0.08);
    maximum += Math.max(0.000001, Math.abs(maximum) * 0.08);
  }
  const pricePadding = (maximum - minimum) * 0.12;
  minimum -= pricePadding;
  maximum += pricePadding;

  const summaryHeight = 92 * unit;
  const footerHeight = 42 * unit;
  const summaryY = height - footerHeight - summaryHeight - 21 * unit;
  const chartX = margin;
  const chartY = identityY + identityHeight + 18 * unit;
  const chartWidth = width - margin * 2;
  const chartHeight = Math.max(175 * unit, summaryY - chartY - 20 * unit);

  // Chart stage: fills nearly all remaining space and reads as the visual hero.
  roundedRect(context, chartX, chartY, chartWidth, chartHeight, 24 * unit);
  context.fillStyle = "rgba(2, 8, 5, .64)";
  context.fill();
  context.strokeStyle = theme.border;
  context.lineWidth = Math.max(1, unit);
  context.stroke();

  context.save();
  roundedRect(context, chartX, chartY, chartWidth, chartHeight, 24 * unit);
  context.clip();
  context.strokeStyle = theme.grid;
  context.lineWidth = Math.max(1, unit);
  for (let index = 1; index < 6; index += 1) {
    const x = chartX + chartWidth * index / 6;
    context.beginPath();
    context.moveTo(x, chartY);
    context.lineTo(x, chartY + chartHeight);
    context.stroke();
  }
  for (let index = 1; index < 5; index += 1) {
    const y = chartY + chartHeight * index / 5;
    context.beginPath();
    context.moveTo(chartX, y);
    context.lineTo(chartX + chartWidth, y);
    context.stroke();
  }

  const plotInsetX = 18 * unit;
  const plotInsetY = 30 * unit;
  const plotWidth = chartWidth - 80 * unit;
  const plotHeight = chartHeight - plotInsetY * 2;
  let coordinates = points.map((point) => ({
    x: chartX + plotInsetX + pointProgress(point, spec) * plotWidth,
    y: chartY + plotInsetY + (1 - (Number(point.priceSol) - minimum) / (maximum - minimum)) * plotHeight,
    at: pointProgress(point, spec),
  }));
  if (coordinates.length === 1) {
    const only = coordinates[0]!;
    coordinates = [
      { x: chartX + plotInsetX, y: only.y, at: 0 },
      { x: chartX + plotInsetX + plotWidth, y: only.y, at: 1 },
    ];
  }
  const visible = coordinates.filter((point) => point.at <= chartReveal);
  let head = visible.at(-1) ?? coordinates[0]!;
  const next = coordinates.find((point) => point.at > chartReveal);
  if (next && next.at > head.at) {
    const local = clamp((chartReveal - head.at) / (next.at - head.at));
    head = { x: head.x + (next.x - head.x) * local, y: head.y + (next.y - head.y) * local, at: chartReveal };
  }
  const pathPoints = [...visible];
  if (!pathPoints.length || pathPoints.at(-1)?.x !== head.x || pathPoints.at(-1)?.y !== head.y) pathPoints.push(head);

  const area = context.createLinearGradient(0, chartY, 0, chartY + chartHeight);
  area.addColorStop(0, `${theme.positive}58`);
  area.addColorStop(0.58, `${theme.positive}18`);
  area.addColorStop(1, `${theme.positive}00`);
  context.beginPath();
  context.moveTo(pathPoints[0]!.x, chartY + chartHeight);
  traceSmoothPath(context, pathPoints);
  context.lineTo(head.x, chartY + chartHeight);
  context.closePath();
  context.fillStyle = area;
  context.fill();

  // Multi-pass neon stroke creates the high-energy social aesthetic.
  for (const [lineWidth, alpha, blur] of [[14, "24", 30], [7, "82", 18], [3.5, "ff", 8]] as const) {
    context.beginPath();
    traceSmoothPath(context, pathPoints);
    context.strokeStyle = `${theme.positive}${alpha}`;
    context.lineWidth = lineWidth * unit;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.shadowColor = theme.positive;
    context.shadowBlur = blur * unit;
    context.stroke();
  }
  context.shadowBlur = 0;

  // Trade events land directly on the price path with labelled impact bursts.
  spec.episode.fills.forEach((fill, index) => {
    const at = eventProgress(fill, spec);
    if (at > chartReveal) return;
    const landing = phase(chartReveal, at, Math.min(1, at + 0.075));
    const point = coordinates.reduce((best, candidate) => Math.abs(candidate.at - at) < Math.abs(best.at - at) ? candidate : best, coordinates[0]!);
    const color = fill.side === "buy" ? theme.positive : theme.negative;
    const impact = 1 - landing;
    if (impact > 0) {
      const burst = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, (72 + impact * 80) * unit);
      burst.addColorStop(0, `${color}50`);
      burst.addColorStop(1, `${color}00`);
      context.fillStyle = burst;
      context.fillRect(point.x - 160 * unit, point.y - 160 * unit, 320 * unit, 320 * unit);
    }
    context.beginPath();
    context.arc(point.x, point.y, (8 + impact * 25) * unit, 0, Math.PI * 2);
    context.strokeStyle = `${color}${impact > 0.4 ? "dd" : "55"}`;
    context.lineWidth = 2 * unit;
    context.stroke();
    context.beginPath();
    context.arc(point.x, point.y, 5.5 * unit, 0, Math.PI * 2);
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 18 * unit;
    context.fill();
    context.shadowBlur = 0;
    const quote = new Decimal(fill.quoteLamports).div(1_000_000_000);
    const label = `${fill.side.toUpperCase()} ${quote.toDecimalPlaces(3).toString()} SOL`;
    context.font = `bold ${10 * unit}px ui-monospace, SFMono-Regular, monospace`;
    const estimatedWidth = context.measureText(label).width + 18 * unit;
    const labelX = clamp(point.x - estimatedWidth / 2, chartX + 8 * unit, chartX + chartWidth - estimatedWidth - 8 * unit);
    const alternateAbove = index % 2 === 0;
    const labelY = clamp(point.y + (alternateAbove ? -42 : 17) * unit, chartY + 8 * unit, chartY + chartHeight - 34 * unit);
    drawPill(context, label, labelX, labelY, {
      fill: "rgba(1, 7, 4, .94)",
      stroke: `${color}99`,
      color,
      fontSize: 10 * unit,
      paddingX: 9 * unit,
    });
  });

  if (chartReveal > 0) {
    const pulse = 1 + Math.sin(progress * Math.PI * 24) * 0.12;
    context.beginPath();
    context.arc(head.x, head.y, 30 * unit * pulse, 0, Math.PI * 2);
    context.fillStyle = `${theme.positive}16`;
    context.fill();
    context.beginPath();
    context.arc(head.x, head.y, 10 * unit, 0, Math.PI * 2);
    context.fillStyle = theme.positiveSoft;
    context.shadowColor = theme.positive;
    context.shadowBlur = 30 * unit;
    context.fill();
    context.shadowBlur = 0;
    context.setLineDash([6 * unit, 7 * unit]);
    context.strokeStyle = `${theme.positive}55`;
    context.beginPath();
    context.moveTo(head.x, head.y);
    context.lineTo(chartX + chartWidth, head.y);
    context.stroke();
    context.setLineDash([]);
  }

  context.restore();

  // Chart labels sit outside the clip and remain readable on every theme.
  context.fillStyle = theme.muted;
  context.font = `bold ${9.5 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText(spec.marketDataSource === "ohlcv" ? "PRICE ACTION" : "EXECUTION PRICE PATH", chartX + 18 * unit, chartY + 22 * unit);
  context.textAlign = "right";
  context.fillStyle = theme.positive;
  context.fillText(`LIVE  ${formatPrice(active.price)}`, chartX + chartWidth - 18 * unit, chartY + 22 * unit);
  context.fillStyle = theme.muted;
  for (let index = 0; index < 4; index += 1) {
    const ratio = index / 3;
    const value = maximum - (maximum - minimum) * ratio;
    context.fillText(formatPrice(value), chartX + chartWidth - 12 * unit, chartY + 48 * unit + ratio * Math.max(20 * unit, chartHeight - 75 * unit));
  }
  context.textAlign = "left";

  // Peak badge is honest about the available data source.
  const peakIndex = prices.indexOf(Math.max(...prices));
  const peakPoint = coordinates[Math.max(0, peakIndex)];
  if (peakPoint && chartReveal >= peakPoint.at) {
    const peakIntro = easeOut(peakPoint.at >= 0.999
      ? phase(progress, 0.76, 0.9)
      : phase(chartReveal, peakPoint.at, Math.min(1, peakPoint.at + 0.1)));
    context.globalAlpha = peakIntro;
    const peakLabel = `${spec.marketDataSource === "ohlcv" ? "◆ ATH" : "◆ PEAK EXECUTION"} ${formatPrice(prices[peakIndex] ?? 0)}`;
    context.font = `bold ${11 * unit}px ui-monospace, SFMono-Regular, monospace`;
    const peakWidth = context.measureText(peakLabel).width + 24 * unit;
    drawPill(context, peakLabel, clamp(peakPoint.x - peakWidth / 2, chartX + 10 * unit, chartX + chartWidth - peakWidth - 10 * unit), Math.max(chartY + 36 * unit, peakPoint.y - 54 * unit), {
      fill: "rgba(30, 21, 2, .94)",
      stroke: `${theme.accent}bb`,
      color: theme.accent,
      fontSize: 11 * unit,
      paddingX: 12 * unit,
    });
    context.globalAlpha = 1;
  }

  // Dense bottom stats eliminate dead space and make the post screenshot-worthy.
  const summaryIntro = easeOut(phase(progress, 0.76, 0.9));
  const summarySlide = (1 - summaryIntro) * 22 * unit;
  context.save();
  context.globalAlpha = 0.25 + summaryIntro * 0.75;
  const gap = 10 * unit;
  const metricWidth = (chartWidth - gap * 2) / 3;
  drawMetric(context, theme, "BOUGHT", formatMoney(currencyValue(boughtSol, spec, config.currency), config.currency, config.exactValues).replace(/^\+/, ""), chartX, summaryY + summarySlide, metricWidth, summaryHeight, unit);
  drawMetric(context, theme, "SOLD", formatMoney(currencyValue(soldSol, spec, config.currency), config.currency, config.exactValues).replace(/^\+/, ""), chartX + metricWidth + gap, summaryY + summarySlide, metricWidth, summaryHeight, unit);
  drawMetric(context, theme, "NET RESULT", formatMoney(currencyValue(new Decimal(spec.episode.approximatePnlLamports).div(1_000_000_000), spec, config.currency), config.currency, config.exactValues), chartX + (metricWidth + gap) * 2, summaryY + summarySlide, metricWidth, summaryHeight, unit, true);

  if (summaryIntro > 0.55) {
    const shimmerProgress = phase(summaryIntro, 0.55, 1);
    const shimmerX = chartX - metricWidth + shimmerProgress * (chartWidth + metricWidth * 2);
    const shimmer = context.createLinearGradient(shimmerX - 90 * unit, 0, shimmerX + 90 * unit, 0);
    shimmer.addColorStop(0, "rgba(255,255,255,0)");
    shimmer.addColorStop(0.5, "rgba(255,255,255,.08)");
    shimmer.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = shimmer;
    context.fillRect(chartX, summaryY + summarySlide, chartWidth, summaryHeight);
  }
  context.restore();

  const footerY = height - 28 * unit;
  const configuredWallets = spec.walletAddresses?.length ?? 0;
  const trader = config.walletVisibility !== "hidden" && configuredWallets > 1
    ? `${configuredWallets} TRADING WALLETS`
    : walletLabel(spec.walletAddress, config.walletVisibility);
  context.fillStyle = theme.muted;
  context.font = `bold ${10 * unit}px ui-monospace, SFMono-Regular, monospace`;
  context.fillText(trader, margin, footerY);
  context.textAlign = "right";
  context.fillStyle = theme.positive;
  context.fillText("FLEX THE TRADE • MADE WITH WICKLAPSE", width - margin, footerY);
  context.textAlign = "left";

  // Brief full-frame impacts make buy/sell moments feel edited, not merely plotted.
  for (const fill of spec.episode.fills) {
    const at = eventProgress(fill, spec);
    const distance = Math.abs(chartReveal - at);
    if (distance >= 0.018) continue;
    const strength = (1 - distance / 0.018) * 0.055;
    context.fillStyle = fill.side === "buy"
      ? `rgba(15, 242, 139, ${strength})`
      : `rgba(255, 62, 120, ${strength})`;
    context.fillRect(0, 0, width, height);
  }

  context.restore();
}
