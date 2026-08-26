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
  const sign = value.isPositive() ? "+" : value.isNegative() ? "−" : "";
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
  if (points.length === 1) return { price: Number(points[0]!.priceSol), pnl: new Decimal(points[0]!.pnlSol) };
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const next = points[index]!;
    const previousAt = pointProgress(previous, spec);
    const nextAt = pointProgress(next, spec);
    if (timeline <= nextAt) {
      const local = clamp((timeline - previousAt) / Math.max(0.0001, nextAt - previousAt));
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
