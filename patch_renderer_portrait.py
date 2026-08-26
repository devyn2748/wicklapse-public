import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

old_block = """  context.fillStyle = "#ffffff";
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
    context.font = `bold ${38 * unit}px sans-serif`;"""

new_block = """  context.fillStyle = "#ffffff";
  context.font = `900 ${104 * unit}px sans-serif`;
  context.fillText(spec.symbol.toUpperCase(), margin, 140 * unit + slide);

  const pnlText = formatMoney(activeValue, config.currency, config.exactValues).replace(/^\+/, "");
  const pnlDisplay = `${activeValue.isPositive() ? "+" : activeValue.isNegative() ? "-" : ""}${pnlText.replace(/^-/, "")}`;
  context.font = `900 ${80 * unit}px sans-serif`;
  const textWidth = context.measureText(pnlDisplay).width;
  const boxWidth = textWidth + 140 * unit;
  const boxHeight = 110 * unit;
  const boxY = 170 * unit + slide;

  context.shadowColor = isLoss ? "rgba(255, 77, 90, 0.2)" : "rgba(20, 241, 149, 0.2)";
  context.shadowBlur = 40 * unit;
  roundedRect(context, margin, boxY, boxWidth, boxHeight, 16 * unit);
  context.fillStyle = outcomeColor;
  context.fill();
  context.shadowBlur = 0;

  if (config.currency === "SOL") {
    drawSolanaGlyph(context, margin + 28 * unit, boxY + 34 * unit, 56 * unit, 42 * unit, "#000000");
  } else {
    context.fillStyle = "#000000";
    context.font = `900 ${64 * unit}px sans-serif`;
    context.fillText("$", margin + 32 * unit, boxY + 82 * unit);
  }

  context.fillStyle = "#000000";
  context.font = `900 ${80 * unit}px sans-serif`;
  context.fillText(pnlDisplay, margin + 104 * unit, boxY + 84 * unit);

  const metricsStackHeight = 360 * unit;
  const metricsY = height - margin - metricsStackHeight;
  const lineSpacing = 110 * unit;

  const drawMetricRow = (label: string, value: string, yOffset: number, color: string, showEquiv = false) => {
    context.beginPath(); context.moveTo(margin, yOffset - 40 * unit); context.lineTo(width - margin, yOffset - 40 * unit);
    context.strokeStyle = "rgba(39, 39, 42, 0.6)"; context.lineWidth = 2 * unit; context.stroke();

    context.fillStyle = "#a1a1aa";
    context.font = `500 ${48 * unit}px sans-serif`;
    context.fillText(label, margin, yOffset);

    context.textAlign = "right";
    context.fillStyle = color;
    context.font = `bold ${48 * unit}px sans-serif`;"""

code = code.replace(old_block, new_block)

with open('src/renderer.ts', 'w') as f:
    f.write(code)
