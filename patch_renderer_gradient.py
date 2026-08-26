import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

old_block = """function drawSolanaGlyph(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string) {
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
}"""

new_block = """function drawSolanaGlyph(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string) {
  context.save();
  context.translate(x, y);
  context.scale(width / 24, height / 18);
  context.beginPath();
  context.moveTo(4, 3.5); context.lineTo(20, 3.5); context.lineTo(16.5, 7); context.lineTo(0.5, 7); context.closePath();
  context.moveTo(7.5, 7.5); context.lineTo(23.5, 7.5); context.lineTo(20, 11); context.lineTo(4, 11); context.closePath();
  context.moveTo(4, 11.5); context.lineTo(20, 11.5); context.lineTo(16.5, 15); context.lineTo(0.5, 15); context.closePath();

  // Create the official Solana gradient: Cyan (#00FFA3) -> Blue (#03E1FF) -> Purple (#DC1FFF)
  const gradient = context.createLinearGradient(0, 0, 24, 18);
  gradient.addColorStop(0, "#00FFA3");
  gradient.addColorStop(0.5, "#03E1FF");
  gradient.addColorStop(1, "#DC1FFF");
  
  context.fillStyle = gradient;
  context.fill();
  context.restore();
}"""

code = code.replace(old_block, new_block)

with open('src/renderer.ts', 'w') as f:
    f.write(code)
