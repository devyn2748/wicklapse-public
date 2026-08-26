import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

new_background = """
function drawCandleArcLogo(context: CanvasRenderingContext2D, x: number, y: number, size: number, glow: boolean) {
  const scale = size / 400;
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);

  if (glow) {
    context.shadowColor = "#00FFA3";
    context.shadowBlur = 24;
  }

  const greenLine = (x1: number, y1: number, x2: number, y2: number) => {
    context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2);
    context.strokeStyle = "#00FFA3"; context.lineWidth = 2.5; context.lineCap = "round"; context.stroke();
  };
  const greenRect = (rx: number, ry: number, rw: number, rh: number, radius: number) => {
    roundedRect(context, rx, ry, rw, rh, radius);
    context.fillStyle = "#00FFA3"; context.fill();
  };
  const whiteLine = (x1: number, y1: number, x2: number, y2: number, opacity: number) => {
    context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2);
    context.strokeStyle = `rgba(255, 255, 255, ${opacity})`; context.lineWidth = 1.8; context.lineCap = "round"; context.stroke();
  };
  const whiteRect = (rx: number, ry: number, rw: number, rh: number, radius: number, fillOp: number, strokeOp: number) => {
    roundedRect(context, rx, ry, rw, rh, radius);
    context.fillStyle = `rgba(255, 255, 255, ${fillOp})`; context.fill();
    context.strokeStyle = `rgba(255, 255, 255, ${strokeOp})`; context.lineWidth = 1; context.stroke();
  };

  greenLine(38, 160, 38, 215); greenRect(31, 174, 14, 24, 2);
  whiteLine(60, 178, 60, 232, 0.4); whiteRect(53, 190, 14, 22, 2, 0.18, 0.5);
  whiteLine(84, 202, 84, 265, 0.3); whiteRect(77, 218, 14, 28, 2, 0.12, 0.4);
  greenLine(108, 216, 108, 292); greenRect(101, 232, 14, 42, 2.5);
  whiteLine(130, 234, 130, 308, 0.35); whiteRect(123, 248, 14, 36, 2, 0.15, 0.4);
  whiteLine(152, 256, 152, 318, 0.3); whiteRect(145, 278, 14, 26, 2, 0.12, 0.35);
  greenLine(174, 264, 174, 310); greenRect(167, 275, 14, 20, 2);

  greenLine(194, 226, 194, 295); greenRect(187, 240, 14, 40, 2.5);
  greenLine(216, 202, 216, 252); greenRect(209, 214, 14, 24, 2);
  whiteLine(238, 212, 238, 260, 0.35); whiteRect(231, 222, 14, 22, 2, 0.15, 0.4);
  whiteLine(256, 234, 256, 290, 0.3); whiteRect(249, 245, 14, 26, 2, 0.12, 0.35);

  whiteLine(274, 248, 274, 330, 0.3); whiteRect(267, 270, 14, 42, 2, 0.12, 0.35);
  greenLine(294, 256, 294, 320); greenRect(287, 268, 14, 38, 2);
  greenLine(314, 215, 314, 294); greenRect(307, 234, 14, 44, 2.5);
  greenLine(334, 192, 334, 264); greenRect(327, 206, 14, 46, 2.5);
  whiteLine(354, 152, 354, 218, 0.35); whiteRect(347, 166, 14, 34, 2, 0.15, 0.4);
  greenLine(374, 114, 374, 192); greenRect(367, 128, 14, 50, 3);
  greenLine(394, 78, 394, 160); greenRect(387, 98, 15, 45, 3);

  context.save();
  context.translate(204, 288);
  context.beginPath(); context.moveTo(-18, -20); context.bezierCurveTo(-18, -24, -14, -26, -10, -24); context.lineTo(18, -8); context.bezierCurveTo(22, -6, 22, -2, 18, 0); context.lineTo(-10, 16); context.bezierCurveTo(-14, 18, -18, 16, -18, 12); context.closePath();
  context.fillStyle = "rgba(255, 255, 255, 0.06)"; context.fill();
  context.strokeStyle = "rgba(255, 255, 255, 0.4)"; context.lineWidth = 1.5; context.stroke();

  context.beginPath(); context.moveTo(-9, -10); context.bezierCurveTo(-9, -12, -7, -13, -5, -12); context.lineTo(9, -4); context.bezierCurveTo(11, -3, 11, -1, 9, 0); context.lineTo(-5, 8); context.bezierCurveTo(-7, 9, -9, 8, -9, 6); context.closePath();
  context.fillStyle = "#00FFA3"; context.fill();
  context.restore();

  context.restore();
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
  image: CanvasImageSource | null | undefined,
  progress: number,
): void {
  const unit = Math.min(width, height) / 1080;
  const isLandscape = width / height >= 1.45;

  context.fillStyle = "#07090C";
  context.fillRect(0, 0, width, height);

  if (isLandscape) {
    const glow1 = context.createRadialGradient(width - 64 * unit, -64 * unit, 0, width - 64 * unit, -64 * unit, 480 * unit);
    glow1.addColorStop(0, "rgba(16, 185, 129, 0.1)");
    glow1.addColorStop(1, "rgba(16, 185, 129, 0)");
    context.fillStyle = glow1;
    context.fillRect(0, 0, width, height);

    const glow2 = context.createRadialGradient(width - 160 * unit, height, 0, width - 160 * unit, height, 400 * unit);
    glow2.addColorStop(0, "rgba(5, 150, 105, 0.05)");
    glow2.addColorStop(1, "rgba(5, 150, 105, 0)");
    context.fillStyle = glow2;
    context.fillRect(0, 0, width, height);

    context.globalAlpha = 0.3;
    drawCandleArcLogo(context, width - 400 * unit, -30 * unit, 420 * unit, true);
    context.globalAlpha = 1;
  } else {
    const glow1 = context.createRadialGradient(width, 0, 0, width, 0, 360 * unit);
    glow1.addColorStop(0, "rgba(16, 185, 129, 0.15)");
    glow1.addColorStop(1, "rgba(16, 185, 129, 0)");
    context.fillStyle = glow1;
    context.fillRect(0, 0, width, height);

    const glow2 = context.createRadialGradient(0, height, 0, 0, height, 360 * unit);
    glow2.addColorStop(0, "rgba(5, 150, 105, 0.1)");
    glow2.addColorStop(1, "rgba(5, 150, 105, 0)");
    context.fillStyle = glow2;
    context.fillRect(0, 0, width, height);

    context.globalAlpha = 0.3;
    drawCandleArcLogo(context, width - 240 * unit, -30 * unit, 280 * unit, true);
    context.globalAlpha = 1;
  }

  context.strokeStyle = "#232938";
  context.lineWidth = Math.max(1, 1.5 * unit);
  const padding = 1.5 * unit;
  roundedRect(context, padding, padding, width - padding * 2, height - padding * 2, isLandscape ? 24 * unit : 40 * unit);
  context.stroke();
}
"""

start_bg = code.find('function drawBackground(')
end_bg = code.find('function candleIntervalLabel(')

code = code[:start_bg] + new_background + code[end_bg:]

with open('src/renderer.ts', 'w') as f:
    f.write(code)
