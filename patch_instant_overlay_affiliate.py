import re

with open('src/instant-overlay.tsx', 'r') as f:
    code = f.read()

# Add affiliateLink to preview config
old_preview_config = """      theme: settings.theme,
      backgroundStyle: settings.backgroundStyle,
      exactValues: settings.exactValues,"""
new_preview_config = """      theme: settings.theme,
      backgroundStyle: settings.backgroundStyle,
      affiliateLink: settings.affiliateLink,
      exactValues: settings.exactValues,"""
code = code.replace(old_preview_config, new_preview_config)

# Add affiliateLink to export config
old_export_config = """        theme: settings.theme,
      backgroundStyle: settings.backgroundStyle,
        exactValues: settings.exactValues,"""
new_export_config = """        theme: settings.theme,
      backgroundStyle: settings.backgroundStyle,
      affiliateLink: settings.affiliateLink,
        exactValues: settings.exactValues,"""
code = code.replace(old_export_config, new_export_config)

# Add Affiliate Link text input in expanded controls
old_controls = """          <section className="wick-side-section"><div className="wick-section-title"><h3>Custom clip length</h3><span>1–60 seconds</span></div><label>Video duration<input key={`instant-duration-${settings.duration}`} type="number" min={1} max={60} step={0.25} defaultValue={settings.duration} onBlur={(event) => { const input = event.currentTarget; const value = Number(input.value); if (Number.isFinite(value) && value >= 1 && value <= 60 && value !== settings.duration) void changeDuration(value).then((changed) => { if (!changed) input.value = String(settings.duration); }); else input.value = String(settings.duration); }} /></label></section>"""

new_controls = """          <section className="wick-side-section"><div className="wick-section-title"><h3>Affiliate / Referral</h3><span>Optional</span></div><label>Link text<input type="text" value={settings.affiliateLink} onChange={(event) => patch("affiliateLink", event.target.value)} placeholder="e.g. t.me/cryptojak" maxLength={40} /></label></section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Custom clip length</h3><span>1–60 seconds</span></div><label>Video duration<input key={`instant-duration-${settings.duration}`} type="number" min={1} max={60} step={0.25} defaultValue={settings.duration} onBlur={(event) => { const input = event.currentTarget; const value = Number(input.value); if (Number.isFinite(value) && value >= 1 && value <= 60 && value !== settings.duration) void changeDuration(value).then((changed) => { if (!changed) input.value = String(settings.duration); }); else input.value = String(settings.duration); }} /></label></section>"""

code = code.replace(old_controls, new_controls)

with open('src/instant-overlay.tsx', 'w') as f:
    f.write(code)
