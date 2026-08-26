import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

# For Landscape
code = code.replace(
    '  const intro = easeOut(phase(progress, 0, 0.08));',
    '  const intro = 1; // Removed fade-in so video doesn\'t start blank'
)

# For Portrait
code = code.replace(
    '  const intro = easeOut(phase(progress, 0, 0.1));',
    '  const intro = 1; // Removed fade-in'
)

code = code.replace('context.globalAlpha = intro;', '')

with open('src/renderer.ts', 'w') as f:
    f.write(code)
