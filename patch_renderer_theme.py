import re

with open('src/renderer.ts', 'r') as f:
    code = f.read()

code = code.replace("theme.primary", "theme.text")

with open('src/renderer.ts', 'w') as f:
    f.write(code)
