import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

# 1. Remove the watermark
code = code.replace(
    """    context.globalAlpha = 0.3;
    drawCandleArcLogo(context, width - 400 * unit, -30 * unit, 420 * unit, true);
    context.globalAlpha = 1;""",
    """    // context.globalAlpha = 0.3;
    // drawCandleArcLogo(context, width - 400 * unit, -30 * unit, 420 * unit, true);
    // context.globalAlpha = 1;"""
)

code = code.replace(
    """    context.globalAlpha = 0.3;
    drawCandleArcLogo(context, width - 260 * unit, -20 * unit, 280 * unit, true);
    context.globalAlpha = 1;""",
    """    // context.globalAlpha = 0.3;
    // drawCandleArcLogo(context, width - 260 * unit, -20 * unit, 280 * unit, true);
    // context.globalAlpha = 1;"""
)

# 2. Make text in 16:9 bigger
# Let's replace the whole block for text sizing in drawLandscapeReplayFrame.
# I'll just write a regex to replace that specific block.

old_block = """  context.fillStyle = "#ffffff";
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
  context.fillText(compactNumber(positionSol.toNumber()), leftX + 190 * unit, metricsY + lineSpacing * 2);"""

new_block = """  context.fillStyle = "#ffffff";
  context.font = `900 ${104 * unit}px sans-serif`;
  context.fillText(spec.symbol.toUpperCase(), leftX, 180 * unit + slide);

  const pnlText = formatMoney(activeValue, config.currency, config.exactValues).replace(/^\+/, "");
  const pnlDisplay = `${activeValue.isPositive() ? "+" : activeValue.isNegative() ? "-" : ""}${pnlText.replace(/^-/, "")}`;
  context.font = `900 ${80 * unit}px sans-serif`;
  const textWidth = context.measureText(pnlDisplay).width;
  const boxWidth = textWidth + 140 * unit;
  const boxHeight = 110 * unit;
  const boxY = 220 * unit + slide;

  context.shadowColor = isLoss ? "rgba(255, 77, 90, 0.2)" : "rgba(20, 241, 149, 0.2)";
  context.shadowBlur = 40 * unit;
  roundedRect(context, leftX, boxY, boxWidth, boxHeight, 16 * unit);
  context.fillStyle = outcomeColor;
  context.fill();
  context.shadowBlur = 0;

  if (config.currency === "SOL") {
    drawSolanaGlyph(context, leftX + 28 * unit, boxY + 34 * unit, 56 * unit, 42 * unit, "#000000");
  } else {
    context.fillStyle = "#000000";
    context.font = `900 ${64 * unit}px sans-serif`;
    context.fillText("$", leftX + 32 * unit, boxY + 82 * unit);
  }

  context.fillStyle = "#000000";
  context.font = `900 ${80 * unit}px sans-serif`;
  context.fillText(pnlDisplay, leftX + 104 * unit, boxY + 84 * unit);

  const metricsY = boxY + boxHeight + 90 * unit;
  const lineSpacing = 80 * unit;
  const alignCol2 = leftX + 200 * unit;
  const alignCol3 = leftX + 240 * unit;

  context.fillStyle = "#a1a1aa";
  context.font = `500 ${40 * unit}px sans-serif`;
  context.fillText("PNL", leftX, metricsY);
  
  const roiText = `${roi.isPositive() ? "+" : ""}${roi.toFixed(config.exactValues ? 2 : 0)}%`;
  context.fillStyle = outcomeColor;
  context.font = `900 ${40 * unit}px sans-serif`;
  context.fillText(roiText, alignCol2, metricsY);

  context.fillStyle = "#a1a1aa";
  context.font = `500 ${40 * unit}px sans-serif`;
  context.fillText("Invested", leftX, metricsY + lineSpacing);

  context.fillStyle = "#00FFA3";
  context.font = `bold ${40 * unit}px sans-serif`;
  context.fillText("≡", alignCol2, metricsY + lineSpacing);
  
  context.fillStyle = "#f4f4f5";
  context.font = `bold ${40 * unit}px sans-serif`;
  context.fillText(compactNumber(boughtSol.toNumber()), alignCol3, metricsY + lineSpacing);

  context.fillStyle = "#a1a1aa";
  context.font = `500 ${40 * unit}px sans-serif`;
  context.fillText("Position", leftX, metricsY + lineSpacing * 2);

  context.fillStyle = "#00FFA3";
  context.font = `bold ${40 * unit}px sans-serif`;
  context.fillText("≡", alignCol2, metricsY + lineSpacing * 2);

  const pnlSol = active.pnl;
  const positionSol = boughtSol.plus(pnlSol);
  context.fillStyle = "#f4f4f5";
  context.font = `bold ${40 * unit}px sans-serif`;
  context.fillText(compactNumber(positionSol.toNumber()), alignCol3, metricsY + lineSpacing * 2);"""

code = code.replace(old_block, new_block)

with open('src/renderer.ts', 'w') as f:
    f.write(code)
