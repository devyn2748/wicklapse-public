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
    background: "#040807",
    backgroundLift: "#0b1511",
    panel: "rgba(8, 16, 13, .86)",
    grid: "rgba(118, 160, 140, .13)",
    text: "#f3fff8",
    muted: "#7f988c",
    positive: "#16ed95",
    positiveSoft: "#65ffc1",
    negative: "#ff477e",
    accent: "#f4bd42",
  },
  neon: {
    background: "#03070b",
    backgroundLift: "#07141a",
    panel: "rgba(6, 14, 19, .88)",
    grid: "rgba(75, 216, 241, .14)",
    text: "#effdff",
    muted: "#7896a1",
    positive: "#27f2d2",
    positiveSoft: "#7fffee",
    negative: "#ff4f9a",
    accent: "#67a6ff",
  },
  minimal: {
    background: "#0c0e0f",
    backgroundLift: "#171a1c",
    panel: "rgba(18, 21, 22, .9)",
    grid: "rgba(255, 255, 255, .08)",
    text: "#f5f6f6",
    muted: "#969da0",
    positive: "#79dda6",
    positiveSoft: "#b1f3cf",
    negative: "#ed6e88",
    accent: "#c8d0d4",
  },
} as const;

type Theme = (typeof THEMES)[ThemeName];

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
  return `${sign}${absolute.toDecimalPlaces(exact ? 4 : 2).toString()} SOL`;
}

function compactNumber(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (absolute >= 1) return value.toFixed(2);
  return value.toPrecision(3);
}

function currencyValue(sol: Decimal, spec: ReplaySpec, currency: Currency): Decimal {
  if (currency === "SOL") return sol;
  return spec.usdPerSol ? sol.mul(spec.usdPerSol) : new Decimal(0);
}

function walletLabel(address: string, visibility: WalletVisibility): string {
  if (visibility === "hidden") return "TRADER PRIVATE";
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
  if (points.length === 1) {
    return { price: Number(points[0]!.priceSol), pnl: new Decimal(points[0]!.pnlSol) };
  }
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
  context.font = `bold ${options.fontSize}px monospace`;
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

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: Theme,
  image: CanvasImageSource | null | undefined,
): void {
  if (image) {
    const source = image as CanvasImageSource & { width?: number; height?: number };
    const sourceWidth = Number(source.width ?? width);
    const sourceHeight = Number(source.height ?? height);
    const cover = Math.max(width / sourceWidth, height / sourceHeight);
    const targetWidth = sourceWidth * cover;
    const targetHeight = sourceHeight * cover;
    context.drawImage(image, (width - targetWidth) / 2, (height - targetHeight) / 2, targetWidth, targetHeight);
    context.fillStyle = "rgba(2, 7, 5, .82)";
    context.fillRect(0, 0, width, height);
  } else {
    const gradient = context.createRadialGradient(width * 0.42, height * 0.43, 0, width * 0.42, height * 0.43, width * 0.9);
    gradient.addColorStop(0, theme.backgroundLift);
    gradient.addColorStop(0.58, theme.background);
    gradient.addColorStop(1, "#010302");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  const glow = context.createRadialGradient(width * 0.5, height * 0.68, 0, width * 0.5, height * 0.68, width * 0.55);
  glow.addColorStop(0, `${theme.positive}13`);
  glow.addColorStop(1, `${theme.positive}00`);
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
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
  const margin = 54 * unit;
  const points = spec.points.length
    ? [...spec.points].sort((a, b) => a.timestamp - b.timestamp)
    : [{ timestamp: spec.episode.startTimestamp, priceSol: "0", pnlSol: "0" }];
  const chartReveal = easeInOut(phase(progress, 0.1, 0.8));
  const active = interpolateReplay(points, spec, chartReveal);
  const boughtSol = new Decimal(spec.episode.totalBoughtLamports).div(1_000_000_000);
  const activeValue = currencyValue(active.pnl, spec, config.currency);
  const roi = boughtSol.isZero() ? new Decimal(0) : active.pnl.div(boughtSol).mul(100);
  const positive = activeValue.gte(0);

  context.save();
  context.textAlign = "left";
  context.clearRect(0, 0, width, height);
  drawBackground(context, width, height, theme, config.backgroundImage);

  // Technical grid gives the chart depth without competing with the data.
  context.strokeStyle = theme.grid;
  context.lineWidth = Math.max(1, unit);
  for (let x = margin; x < width - margin; x += 116 * unit) {
    context.beginPath();
    context.moveTo(x, height * 0.3);
    context.lineTo(x, height * 0.8);
    context.stroke();
  }
  for (let y = height * 0.33; y < height * 0.8; y += height * 0.105) {
    context.beginPath();
    context.moveTo(margin, y);
    context.lineTo(width - margin, y);
    context.stroke();
  }

  const intro = easeOut(phase(progress, 0, 0.12));
  context.globalAlpha = intro;
  context.fillStyle = theme.positive;
  context.font = `bold ${27 * unit}px sans-serif`;
  context.fillText("W", margin, 56 * unit);
  context.fillStyle = theme.text;
  context.font = `bold ${19 * unit}px sans-serif`;
  context.fillText("WICKLAPSE", margin + 38 * unit, 55 * unit);
  context.save();
  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = `${13 * unit}px monospace`;
  const sourceLabel = spec.tradeDataSource === "axiom"
    ? "CAPTURED FROM AXIOM"
    : spec.marketDataSource === "ohlcv"
      ? `${spec.verified ? "TRADE VERIFIED • " : ""}ON-CHAIN MARKET REPLAY`
      : `${spec.verified ? "TRADE VERIFIED • " : ""}RECONSTRUCTED FROM FILLS`;
  context.fillText(
    sourceLabel,
    width - margin,
    53 * unit,
  );
  context.restore();

  context.fillStyle = theme.muted;
  context.font = `bold ${17 * unit}px monospace`;
  context.fillText(`${formatMoney(currencyValue(boughtSol, spec, config.currency), config.currency, false).replace(/^\+/, "")} ENTRY`, margin, height * 0.115);

  context.fillStyle = positive ? theme.positive : theme.negative;
  context.shadowColor = positive ? theme.positive : theme.negative;
  context.shadowBlur = 28 * unit;
  context.font = `bold ${Math.min(86, width < height ? 80 : 86) * unit}px sans-serif`;
  context.fillText(formatMoney(activeValue, config.currency, config.exactValues), margin, height * 0.205);
  context.shadowBlur = 0;
  context.font = `bold ${25 * unit}px monospace`;
  context.fillText(`${roi.isPositive() ? "+" : ""}${roi.toFixed(config.exactValues ? 2 : 0)}% SINCE ENTRY`, margin, height * 0.247);

  // Token identity row.
  const tokenY = height * 0.282;
  context.beginPath();
  context.arc(margin + 24 * unit, tokenY, 22 * unit, 0, Math.PI * 2);
  const tokenGradient = context.createLinearGradient(margin, tokenY - 22 * unit, margin + 45 * unit, tokenY + 22 * unit);
  tokenGradient.addColorStop(0, theme.positiveSoft);
  tokenGradient.addColorStop(0.48, theme.positive);
  tokenGradient.addColorStop(1, theme.negative);
  context.fillStyle = tokenGradient;
  context.fill();
  context.fillStyle = theme.text;
  context.font = `bold ${30 * unit}px sans-serif`;
  context.fillText(`$${spec.symbol}`, margin + 62 * unit, tokenY + 10 * unit);

  const prices = points.map((point) => Number(point.priceSol)).filter(Number.isFinite);
  let minimum = Math.min(...prices);
  let maximum = Math.max(...prices);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) minimum = maximum = 0;
  if (minimum === maximum) {
    minimum -= Math.max(0.000001, Math.abs(minimum) * 0.05);
    maximum += Math.max(0.000001, Math.abs(maximum) * 0.05);
  }
  const padding = (maximum - minimum) * 0.09;
  minimum -= padding;
  maximum += padding;

  const chartX = margin;
  const chartY = height * 0.33;
  const chartWidth = width - margin * 2;
  const chartHeight = height * 0.455;
  const coordinates = points.map((point) => ({
    x: chartX + pointProgress(point, spec) * chartWidth,
    y: chartY + (1 - (Number(point.priceSol) - minimum) / (maximum - minimum)) * chartHeight,
    at: pointProgress(point, spec),
  }));
  const visible = coordinates.filter((point) => point.at <= chartReveal);
  let head = visible.at(-1) ?? coordinates[0]!;
  const next = coordinates.find((point) => point.at > chartReveal);
  if (next && head && next.at > head.at) {
    const local = clamp((chartReveal - head.at) / (next.at - head.at));
    head = { x: head.x + (next.x - head.x) * local, y: head.y + (next.y - head.y) * local, at: chartReveal };
  }
  const pathPoints = [...visible];
  if (!pathPoints.length || pathPoints.at(-1)?.x !== head.x) pathPoints.push(head);

  context.save();
  roundedRect(context, chartX - 12 * unit, chartY - 18 * unit, chartWidth + 24 * unit, chartHeight + 50 * unit, 24 * unit);
  context.clip();
  const area = context.createLinearGradient(0, chartY, 0, chartY + chartHeight);
  area.addColorStop(0, `${theme.positive}55`);
  area.addColorStop(0.7, `${theme.positive}14`);
  area.addColorStop(1, `${theme.positive}00`);
  context.beginPath();
  context.moveTo(pathPoints[0]!.x, chartY + chartHeight);
  for (const point of pathPoints) context.lineTo(point.x, point.y);
  context.lineTo(head.x, chartY + chartHeight);
  context.closePath();
  context.fillStyle = area;
  context.fill();

  context.beginPath();
  pathPoints.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
  context.strokeStyle = theme.positive;
  context.lineWidth = 6 * unit;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.shadowColor = theme.positive;
  context.shadowBlur = 18 * unit;
  context.stroke();
  context.shadowBlur = 0;
  context.restore();

  // Price scale and the travelling playhead.
  context.save();
  context.fillStyle = theme.muted;
  context.font = `${12 * unit}px monospace`;
  context.textAlign = "right";
  for (let index = 0; index < 4; index += 1) {
    const ratio = index / 3;
    const value = maximum - (maximum - minimum) * ratio;
    context.fillText(compactNumber(value), width - margin, chartY + ratio * chartHeight - 8 * unit);
  }
  context.restore();

  if (chartReveal > 0) {
    const pulse = 1 + Math.sin(progress * Math.PI * 20) * 0.16;
    context.beginPath();
    context.arc(head.x, head.y, 23 * unit * pulse, 0, Math.PI * 2);
    context.fillStyle = `${theme.positive}18`;
    context.fill();
    context.beginPath();
    context.arc(head.x, head.y, 9 * unit, 0, Math.PI * 2);
    context.fillStyle = theme.positiveSoft;
    context.shadowColor = theme.positive;
    context.shadowBlur = 26 * unit;
    context.fill();
    context.shadowBlur = 0;
  }

  // Trade events land on the path with an impact animation.
  for (const fill of spec.episode.fills) {
    const at = eventProgress(fill, spec);
    if (at > chartReveal) continue;
    const landed = phase(chartReveal, at, Math.min(1, at + 0.08));
    const nearest = coordinates.reduce((best, point) => Math.abs(point.at - at) < Math.abs(best.at - at) ? point : best, coordinates[0]!);
    const color = fill.side === "buy" ? theme.positive : theme.negative;
    const radius = (6 + (1 - landed) * 15) * unit;
    context.beginPath();
    context.arc(nearest.x, nearest.y, radius, 0, Math.PI * 2);
    context.strokeStyle = `${color}${landed < 0.6 ? "cc" : "55"}`;
    context.lineWidth = 2 * unit;
    context.stroke();
    context.beginPath();
    context.arc(nearest.x, nearest.y, 5 * unit, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    drawPill(context, fill.side === "buy" ? "BUY" : "SELL", nearest.x - 28 * unit, nearest.y + (fill.side === "buy" ? 17 : -44) * unit, {
      fill: "rgba(2, 7, 5, .92)",
      stroke: `${color}88`,
      color,
      fontSize: 11 * unit,
      paddingX: 9 * unit,
    });
  }

  // ATH badge enters exactly when the maximum point has been reached.
  const athIndex = prices.indexOf(Math.max(...prices));
  const athPoint = coordinates[Math.max(0, athIndex)];
  if (athPoint && chartReveal >= athPoint.at) {
    const athIntro = easeOut(athPoint.at >= 0.999
      ? phase(progress, 0.76, 0.9)
      : phase(chartReveal, athPoint.at, Math.min(1, athPoint.at + 0.12)));
    context.globalAlpha = athIntro;
    drawPill(context, `◆ ATH ${compactNumber(prices[athIndex] ?? 0)}`, clamp(athPoint.x - 55 * unit, margin, width - margin - 190 * unit), Math.max(chartY - 8 * unit, athPoint.y - 58 * unit), {
      fill: "rgba(31, 23, 3, .94)",
      stroke: `${theme.accent}bb`,
      color: theme.accent,
      fontSize: 13 * unit,
      paddingX: 13 * unit,
    });
    context.globalAlpha = 1;
  }

  const summaryIntro = easeOut(phase(progress, 0.78, 0.92));
  const summaryY = height * 0.83;
  const summaryHeight = height * 0.105;
  context.globalAlpha = 0.35 + summaryIntro * 0.65;
  roundedRect(context, margin, summaryY, width - margin * 2, summaryHeight, 22 * unit);
  context.fillStyle = theme.panel;
  context.fill();
  context.strokeStyle = theme.grid;
  context.stroke();
  const summaries = [
    ["BOUGHT", new Decimal(spec.episode.totalBoughtLamports).div(1_000_000_000)],
    ["SOLD", new Decimal(spec.episode.totalSoldLamports).div(1_000_000_000)],
    ["NET RESULT", new Decimal(spec.episode.approximatePnlLamports).div(1_000_000_000)],
  ] as const;
  summaries.forEach(([label, value], index) => {
    const columnX = margin + (width - margin * 2) * (index / 3) + 26 * unit;
    context.fillStyle = theme.muted;
    context.font = `bold ${11 * unit}px monospace`;
    context.fillText(label, columnX, summaryY + 29 * unit);
    context.fillStyle = label === "NET RESULT" ? theme.positive : theme.text;
    context.font = `bold ${18 * unit}px sans-serif`;
    context.fillText(formatMoney(currencyValue(value, spec, config.currency), config.currency, config.exactValues), columnX, summaryY + 62 * unit);
  });
  context.globalAlpha = 1;

  const footerY = height - 33 * unit;
  context.fillStyle = theme.muted;
  context.font = `${11 * unit}px monospace`;
  context.fillText(walletLabel(spec.walletAddress, config.walletVisibility), margin, footerY);
  context.save();
  context.textAlign = "right";
  context.fillText(`${spec.episode.fills.length} FILLS  •  ${spec.episode.status.toUpperCase()}  •  ${spec.tradeDataSource === "axiom" ? "AXIOM CAPTURE" : "LOCAL RENDER"}`, width - margin, footerY);
  context.restore();
  context.restore();
}
