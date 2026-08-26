import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

old_block = """  const markerLabels: Array<{ x: number; y: number; width: number; height: number }> = [];
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
  });"""

new_block = """  const markerLabels: Array<{ x: number; y: number; width: number; height: number }> = [];
  // Pass 1: Draw all lines and dots first so they stay in the background
  markers.forEach((marker) => {
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
  });
  
  // Pass 2: Draw all labels on top
  markers.forEach((marker, index) => {
    if (marker.timestamp > activeTimestamp) return;
    const x = xForTime(marker.timestamp);
    const y = yForPrice(marker.weightedPrice.toNumber());
    const color = marker.side === "buy" ? "#14F195" : "#FF4D5A";
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
  });"""

code = code.replace(old_block, new_block)

with open('src/renderer.ts', 'w') as f:
    f.write(code)
