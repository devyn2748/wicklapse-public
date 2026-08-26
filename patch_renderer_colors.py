import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

# Fix drawBackground calls
code = code.replace(
    'drawBackground(context, width, height, theme, config.backgroundImage, progress);',
    'drawBackground(context, width, height, theme, config, progress);'
)

# Fix drawLandscapeReplayFrame
code = code.replace('const outcomeColor = isLoss ? "#FF4D5A" : "#14F195";', 'const outcomeColor = isLoss ? theme.negative : theme.positive;')
code = code.replace('context.fillStyle = "#ffffff";', 'context.fillStyle = theme.text;')
code = code.replace('context.fillStyle = "#a1a1aa";', 'context.fillStyle = theme.muted;')
code = code.replace('context.fillStyle = "#f4f4f5";', 'context.fillStyle = theme.text;')
code = code.replace('context.fillStyle = "#000000";', 'context.fillStyle = theme.background;')
code = code.replace('context.fillStyle = "#00FFA3";', 'context.fillStyle = theme.positive;')
code = code.replace('context.strokeStyle = "rgba(255, 255, 255, 0.03)";', 'context.strokeStyle = theme.grid;')
code = code.replace('context.strokeStyle = "rgba(39, 39, 42, 0.6)";', 'context.strokeStyle = theme.border;')
code = code.replace('context.fillStyle = "#07090C";', 'context.fillStyle = theme.background;')
code = code.replace('context.shadowColor = isLoss ? "rgba(255, 77, 90, 0.2)" : "rgba(20, 241, 149, 0.2)";', 'context.shadowColor = `${outcomeColor}33`;')

# We also need to fix the colors in animatedCandles
code = code.replace('context.fillStyle = `${rising ? "#14F195" : "#FF4D5A"}24`;', 'context.fillStyle = `${rising ? theme.positive : theme.negative}24`;')
code = code.replace('const color = rising ? "#14F195" : "#FF4D5A";', 'const color = rising ? theme.positive : theme.negative;')
code = code.replace('context.strokeStyle = "#14F195";', 'context.strokeStyle = theme.positive;')
code = code.replace('context.shadowColor = "#14F195";', 'context.shadowColor = theme.positive;')
code = code.replace('const color = marker.side === "buy" ? "#14F195" : "#FF4D5A";', 'const color = marker.side === "buy" ? theme.positive : theme.negative;')
code = code.replace('fill: "rgba(1, 7, 4, .96)"', 'fill: theme.panelStrong')

with open('src/renderer.ts', 'w') as f:
    f.write(code)
