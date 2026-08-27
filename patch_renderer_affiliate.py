import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

# Landscape
old_landscape = """  context.textAlign = "left";
  drawWalletDisclosure(context, spec, config, theme, margin, height - 30 * unit, width - margin * 2, 22 * unit);
  context.restore();"""

new_landscape = """  context.textAlign = "left";
  if (config.affiliateLink) {
    drawPill(context, config.affiliateLink, margin, height - 90 * unit, {
      fill: `${theme.primary}1a`, stroke: `${theme.primary}55`, color: theme.primary,
      fontSize: 26 * unit, paddingX: 25 * unit,
    });
  }
  drawWalletDisclosure(context, spec, config, theme, margin, height - 30 * unit, width - margin * 2, 22 * unit);
  context.restore();"""

code = code.replace(old_landscape, new_landscape)

# Portrait
old_portrait = """  context.textAlign = "left";
  drawWalletDisclosure(context, spec, config, theme, margin, height - 16 * unit, width - margin * 2, 20 * unit);
  context.restore();"""

new_portrait = """  context.textAlign = "left";
  if (config.affiliateLink) {
    const affiliateWidth = context.measureText(config.affiliateLink).width + 60 * unit;
    drawPill(context, config.affiliateLink, width / 2 - affiliateWidth / 2, height - 100 * unit, {
      fill: `${theme.primary}1a`, stroke: `${theme.primary}55`, color: theme.primary,
      fontSize: 32 * unit, paddingX: 30 * unit,
    });
  }
  drawWalletDisclosure(context, spec, config, theme, margin, height - 16 * unit, width - margin * 2, 20 * unit);
  context.restore();"""

code = code.replace(old_portrait, new_portrait)

with open('src/renderer.ts', 'w') as f:
    f.write(code)
