import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

# the patch starts at drawLandscapeReplayFrame and ends at the end of the file.
start_marker = "function drawLandscapeReplayFrame("

new_code = """
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
  const chartStart = Math.min(spec.episode.startTimestamp, candles[0]?.timestamp ?? points[0]!.timestamp);
  const chartEnd = Math.max(
    spec.episode.endTimestamp,
    candles.length ? candles.at(-1)!.timestamp + interval : points.at(-1)!.timestamp,
  );
  const chartSpan = Math.max(1, chartEnd - chartStart);
  const intro = easeOut(phase(progress, 0, 0.08));
  const replayTiming = replayWindow(config.duration, true);
  const chartReveal = replayEase(phase(progress, replayTiming.start, replayTiming.end));
  const activeTimestamp = chartStart + chartSpan * chartReveal;
  const active = interpolateReplayAtTimestamp(points, activeTimestamp);
  const boughtSol = new Decimal(spec.episode.totalBoughtLamports).div(1_000_000_000);
  const activeValue = currencyValue(active.pnl, spec, config.currency);
  const roi = boughtSol.isZero() ? new Decimal(0) : active.pnl.div(boughtSol).mul(100);
  const isLoss = activeValue.isNegative();
  const outcomeColor = isLoss ? "#FF4D5A" : "#14F195";

  context.save();
  context.textAlign = "left";
  context.clearRect(0, 0, width, height);
  drawBackground(context, width, height, theme, config.backgroundImage, progress);

  const leftX = margin;
  const leftWidth = 600 * unit;
  const chartX = leftX + leftWidth + 40 * unit;
  const chartY = 120 * unit;
  const chartWidth = width - chartX - margin;
  const chartHeight = height - 240 * unit;
  const slide = (1 - intro) * 30 * unit;

  context.globalAlpha = intro;

  context.fillStyle = "#ffffff";
  context.font = `900 ${82 * unit}px sans-serif`;
  context.fillText(spec.symbol.toUpperCase(), leftX, 160 * unit + slide);

  const pnlText = formatMoney(activeValue, config.currency, config.exactValues).replace(/^\+/, "");
  const pnlDisplay = `${activeValue.isPositive() ? "+" : activeValue.isNegative() ? "-" : ""}${pnlText.replace(/^-/, "")}`;
  context.font = `900 ${64 * unit}px sans-serif`;
  const textWidth = context.measureText(pnlDisplay).width;
  const boxWidth = textWidth + 120 * unit;
  const boxHeight = 90 * unit;
  const boxY = 200 * unit + slide;

  context.shadowColor = isLoss ? "rgba(255, 77, 90, 0.2)" : "rgba(20, 241, 149, 0.2)";
  context.shadowBlur = 40 * unit;
  roundedRect(context, leftX, boxY, boxWidth, boxHeight, 12 * unit);
  context.fillStyle = outcomeColor;
  context.fill();
  context.shadowBlur = 0;

  if (config.currency === "SOL") {
    drawSolanaGlyph(context, leftX + 24 * unit, boxY + 28 * unit, 44 * unit, 33 * unit, "#000000");
  } else {
    context.fillStyle = "#000000";
    context.font = `900 ${50 * unit}px sans-serif`;
    context.fillText("$", leftX + 24 * unit, boxY + 68 * unit);
  }

  context.fillStyle = "#000000";
  context.font = `900 ${64 * unit}px sans-serif`;
  context.fillText(pnlDisplay, leftX + 88 * unit, boxY + 68 * unit);

  const metricsY = boxY + boxHeight + 70 * unit;
  const lineSpacing = 64 * unit;

  context.fillStyle = "#a1a1aa";
  context.font = `500 ${32 * unit}px sans-serif`;
  context.fillText("PNL", leftX, metricsY);
  
  const roiText = `${roi.isPositive() ? "+" : ""}${roi.toFixed(config.exactValues ? 2 : 0)}%`;
  context.fillStyle = outcomeColor;
  context.font = `900 ${32 * unit}px sans-serif`;
  context.fillText(roiText, leftX + 160 * unit, metricsY);

  context.fillStyle = "#a1a1aa";
  context.font = `500 ${32 * unit}px sans-serif`;
  context.fillText("Invested", leftX, metricsY + lineSpacing);

  context.fillStyle = "#00FFA3";
  context.font = `bold ${32 * unit}px sans-serif`;
  context.fillText("≡", leftX + 160 * unit, metricsY + lineSpacing);
  
  context.fillStyle = "#f4f4f5";
  context.font = `bold ${32 * unit}px sans-serif`;
  context.fillText(compactNumber(boughtSol.toNumber()), leftX + 190 * unit, metricsY + lineSpacing);

  context.fillStyle = "#a1a1aa";
  context.font = `500 ${32 * unit}px sans-serif`;
  context.fillText("Position", leftX, metricsY + lineSpacing * 2);

  context.fillStyle = "#00FFA3";
  context.font = `bold ${32 * unit}px sans-serif`;
  context.fillText("≡", leftX + 160 * unit, metricsY + lineSpacing * 2);

  const pnlSol = active.pnl;
  const positionSol = boughtSol.plus(pnlSol);
  context.fillStyle = "#f4f4f5";
  context.font = `bold ${32 * unit}px sans-serif`;
  context.fillText(compactNumber(positionSol.toNumber()), leftX + 190 * unit, metricsY + lineSpacing * 2);

  context.globalAlpha = 1;

  const animatedCandles = candles.flatMap((candle) => {
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

  const plotX = chartX;
  const plotY = chartY;
  const plotWidth = chartWidth;
  const plotHeight = chartHeight;
  const displayStart = chartStart - interval * 0.35;
  const displayEnd = Math.min(
    chartEnd + interval * 0.35,
    Math.max(activeTimestamp + interval * 0.65, chartStart + interval * 3.5),
  );
  const displaySpan = Math.max(interval, displayEnd - displayStart);
  const xForTime = (timestamp: number) => plotX + clamp((timestamp - displayStart) / displaySpan) * plotWidth;
  const yForPrice = (price: number) => plotY + (1 - clamp((chartValueFromPrice(price) - minimum) / (maximum - minimum))) * plotHeight;

  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.03)";
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
      context.fillStyle = `${rising ? "#14F195" : "#FF4D5A"}24`;
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
      const color = rising ? "#14F195" : "#FF4D5A";
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
      context.strokeStyle = "#14F195";
      context.lineWidth = 4 * unit;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.setLineDash([13 * unit, 10 * unit]);
      context.shadowColor = "#14F195";
      context.shadowBlur = 10 * unit;
      context.stroke();
      context.shadowBlur = 0;
      context.setLineDash([]);
      headX = visible.at(-1)!.x;
      headY = visible.at(-1)!.y;
    }
  }

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
  const markerLabels: Array<{ x: number; y: number; width: number; height: number }> = [];
  markers.forEach((marker, index) => {
    if (marker.timestamp > activeTimestamp) return;
    const x = xForTime(marker.timestamp);
    const y = yForPrice(marker.weightedPrice.toNumber());
    const color = marker.side === "buy" ? "#14F195" : "#FF4D5A";
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
    context.fillStyle = "#07090C";
    context.fill();
    const label = `${marker.side.toUpperCase()} ${marker.quote.toDecimalPlaces(3).toString()} SOL`;
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
  
  context.textAlign = "right";
  context.fillStyle = "#a1a1aa";
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
  const chartStart = Math.min(spec.episode.startTimestamp, candles[0]?.timestamp ?? points[0]!.timestamp);
  const chartEnd = Math.max(
    spec.episode.endTimestamp,
    candles.length ? candles.at(-1)!.timestamp + interval : points.at(-1)!.timestamp,
  );
  const chartSpan = Math.max(1, chartEnd - chartStart);
  const intro = easeOut(phase(progress, 0, 0.1));
  const replayTiming = replayWindow(config.duration, false);
  const chartReveal = replayEase(phase(progress, replayTiming.start, replayTiming.end));
  const activeTimestamp = chartStart + chartSpan * chartReveal;
  const active = interpolateReplayAtTimestamp(points, activeTimestamp);
  const boughtSol = new Decimal(spec.episode.totalBoughtLamports).div(1_000_000_000);
  const activeValue = currencyValue(active.pnl, spec, config.currency);
  const roi = boughtSol.isZero() ? new Decimal(0) : active.pnl.div(boughtSol).mul(100);
  const isLoss = activeValue.isNegative();
  const outcomeColor = isLoss ? "#FF4D5A" : "#14F195";

  context.save();
  context.textAlign = "left";
  context.clearRect(0, 0, width, height);
  drawBackground(context, width, height, theme, config.backgroundImage, progress);

  const margin = 64 * unit;
  const slide = (1 - intro) * 26 * unit;

  context.globalAlpha = intro;

  context.fillStyle = "#ffffff";
  context.font = `900 ${84 * unit}px sans-serif`;
  context.fillText(spec.symbol.toUpperCase(), margin, 140 * unit + slide);

  const pnlText = formatMoney(activeValue, config.currency, config.exactValues).replace(/^\+/, "");
  const pnlDisplay = `${activeValue.isPositive() ? "+" : activeValue.isNegative() ? "-" : ""}${pnlText.replace(/^-/, "")}`;
  context.font = `900 ${64 * unit}px sans-serif`;
  const textWidth = context.measureText(pnlDisplay).width;
  const boxWidth = textWidth + 120 * unit;
  const boxHeight = 90 * unit;
  const boxY = 170 * unit + slide;

  context.shadowColor = isLoss ? "rgba(255, 77, 90, 0.2)" : "rgba(20, 241, 149, 0.2)";
  context.shadowBlur = 40 * unit;
  roundedRect(context, margin, boxY, boxWidth, boxHeight, 10 * unit);
  context.fillStyle = outcomeColor;
  context.fill();
  context.shadowBlur = 0;

  if (config.currency === "SOL") {
    drawSolanaGlyph(context, margin + 24 * unit, boxY + 28 * unit, 44 * unit, 33 * unit, "#000000");
  } else {
    context.fillStyle = "#000000";
    context.font = `900 ${50 * unit}px sans-serif`;
    context.fillText("$", margin + 24 * unit, boxY + 68 * unit);
  }

  context.fillStyle = "#000000";
  context.font = `900 ${64 * unit}px sans-serif`;
  context.fillText(pnlDisplay, margin + 88 * unit, boxY + 68 * unit);

  const metricsStackHeight = 300 * unit;
  const metricsY = height - margin - metricsStackHeight;
  const lineSpacing = 100 * unit;

  const drawMetricRow = (label: string, value: string, yOffset: number, color: string, showEquiv = false) => {
    context.beginPath(); context.moveTo(margin, yOffset - 40 * unit); context.lineTo(width - margin, yOffset - 40 * unit);
    context.strokeStyle = "rgba(39, 39, 42, 0.6)"; context.lineWidth = 2 * unit; context.stroke();

    context.fillStyle = "#a1a1aa";
    context.font = `500 ${38 * unit}px sans-serif`;
    context.fillText(label, margin, yOffset);

    context.textAlign = "right";
    context.fillStyle = color;
    context.font = `bold ${38 * unit}px sans-serif`;
    if (showEquiv) {
      const vWidth = context.measureText(value).width;
      context.fillText(value, width - margin, yOffset);
      context.fillStyle = "#00FFA3";
      context.fillText("≡ ", width - margin - vWidth, yOffset);
    } else {
      context.fillText(value, width - margin, yOffset);
    }
    context.textAlign = "left";
  };

  const roiText = `${roi.isPositive() ? "+" : ""}${roi.toFixed(config.exactValues ? 2 : 0)}%`;
  drawMetricRow("PNL", roiText, metricsY + lineSpacing, outcomeColor);
  drawMetricRow("Invested", compactNumber(boughtSol.toNumber()), metricsY + lineSpacing * 2, "#ffffff", true);
  
  const pnlSol = active.pnl;
  const positionSol = boughtSol.plus(pnlSol);
  drawMetricRow("Position", compactNumber(positionSol.toNumber()), metricsY + lineSpacing * 3, "#ffffff", true);

  context.globalAlpha = 1;

  const chartX = margin;
  const chartY = boxY + boxHeight + 80 * unit;
  const chartWidth = width - margin * 2;
  const chartHeight = metricsY - 80 * unit - chartY;

  const animatedCandles = candles.flatMap((candle) => {
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

  const plotX = chartX;
  const plotY = chartY;
  const plotWidth = chartWidth;
  const plotHeight = chartHeight;
  const displayStart = chartStart - interval * 0.35;
  const displayEnd = Math.min(
    chartEnd + interval * 0.35,
    Math.max(activeTimestamp + interval * 0.65, chartStart + interval * 3.5),
  );
  const displaySpan = Math.max(interval, displayEnd - displayStart);
  const xForTime = (timestamp: number) => plotX + clamp((timestamp - displayStart) / displaySpan) * plotWidth;
  const yForPrice = (price: number) => plotY + (1 - clamp((chartValueFromPrice(price) - minimum) / (maximum - minimum))) * plotHeight;

  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.03)";
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
      context.fillStyle = `${rising ? "#14F195" : "#FF4D5A"}24`;
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
      const color = rising ? "#14F195" : "#FF4D5A";
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
      context.strokeStyle = "#14F195";
      context.lineWidth = 4 * unit;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.setLineDash([13 * unit, 10 * unit]);
      context.shadowColor = "#14F195";
      context.shadowBlur = 10 * unit;
      context.stroke();
      context.shadowBlur = 0;
      context.setLineDash([]);
      headX = visible.at(-1)!.x;
      headY = visible.at(-1)!.y;
    }
  }

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
  const markerLabels: Array<{ x: number; y: number; width: number; height: number }> = [];
  markers.forEach((marker, index) => {
    if (marker.timestamp > activeTimestamp) return;
    const x = xForTime(marker.timestamp);
    const y = yForPrice(marker.weightedPrice.toNumber());
    const color = marker.side === "buy" ? "#14F195" : "#FF4D5A";
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
    context.fillStyle = "#07090C";
    context.fill();
    const label = `${marker.side.toUpperCase()} ${marker.quote.toDecimalPlaces(3).toString()} SOL`;
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

  context.textAlign = "right";
  context.fillStyle = "#a1a1aa";
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
"""

start_pos = code.find(start_marker)
code = code[:start_pos] + new_code

with open('src/renderer.ts', 'w') as f:
    f.write(code)

