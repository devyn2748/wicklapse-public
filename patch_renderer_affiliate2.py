import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

old_portrait = """  if (config.affiliateLink) {
    const affiliateWidth = context.measureText(config.affiliateLink).width + 60 * unit;
    drawPill(context, config.affiliateLink, width / 2 - affiliateWidth / 2, height - 100 * unit, {"""

new_portrait = """  if (config.affiliateLink) {
    context.font = `bold ${32 * unit}px ui-monospace, SFMono-Regular, monospace`;
    const affiliateWidth = context.measureText(config.affiliateLink).width + 60 * unit;
    drawPill(context, config.affiliateLink, width / 2 - affiliateWidth / 2, height - 100 * unit, {"""

code = code.replace(old_portrait, new_portrait)

with open('src/renderer.ts', 'w') as f:
    f.write(code)
