import re

with open('src/instant-overlay.tsx', 'r') as f:
    code = f.read()

# Replace the button-based themes div with two dropdowns
old_themes = """<div className="wick-control-section"><div className="wick-section-title"><h3>Visual theme</h3><span>Wicklapse</span></div><div className="wick-themes">{(["obsidian", "neon", "minimal"] as ThemeName[]).map((theme) => <button type="button" className={settings.theme === theme ? "is-selected" : ""} key={theme} onClick={() => patch("theme", theme)}><i className={theme} />{theme}</button>)}</div></div>"""

new_themes = """<div className="wick-control-section">
  <div className="wick-section-title">
    <h3>Visual Theme</h3>
    <span>Wicklapse</span>
  </div>
  <select className="wick-sound-select" value={settings.theme} onChange={(e) => patch("theme", e.target.value as ThemeName)}>
    <option value="obsidian">Obsidian</option>
    <option value="neon">Neon</option>
    <option value="minimal">Minimal</option>
    <option value="cyberpunk">Cyberpunk</option>
    <option value="sunset">Sunset</option>
    <option value="matrix">Matrix</option>
    <option value="hacker">Hacker</option>
  </select>
</div>
<div className="wick-control-section">
  <div className="wick-section-title">
    <h3>Background Design</h3>
    <span>Wicklapse</span>
  </div>
  <select className="wick-sound-select" value={settings.backgroundStyle} onChange={(e) => patch("backgroundStyle", e.target.value as any)}>
    <option value="glow">Ambient Glow</option>
    <option value="solid">Solid Color</option>
    <option value="grid">Retro Grid</option>
    <option value="particles">Particles</option>
  </select>
</div>"""

code = code.replace(old_themes, new_themes)

with open('src/instant-overlay.tsx', 'w') as f:
    f.write(code)
