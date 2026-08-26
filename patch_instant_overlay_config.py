import re

with open('src/instant-overlay.tsx', 'r') as f:
    code = f.read()

code = code.replace(
    'theme: settings.theme,',
    'theme: settings.theme,\n      backgroundStyle: settings.backgroundStyle,'
)

with open('src/instant-overlay.tsx', 'w') as f:
    f.write(code)
