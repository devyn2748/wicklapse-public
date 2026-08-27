import re

with open('src/instant-overlay.tsx', 'r') as f:
    code = f.read()

old_controls = """          <section className="wick-side-section"><div className="wick-section-title"><h3>Chart animation</h3><span>Default: Progressive</span></div><select className="wick-sound-select" value={settings.chartAnimation} onChange={(event) => patch("chartAnimation", event.target.value as ChartAnimation)}><option value="progressive">Progressive zoom</option><option value="follow">Rolling follow</option><option value="fixed">Fixed full timeline</option></select><p>Choose whether the camera expands with the trade, follows the active candle, or keeps the complete timeline fixed.</p><div className="wick-check-list" style={{ marginTop: '12px' }}><label className="wick-check"><input type="checkbox" checked={settings.speedrunMode} onChange={(event) => patch("speedrunMode", event.target.checked)} /><span><b>Cinematic Speedrun</b><small>Accelerates time between trades, slows down during trades.</small></span></label></div></section>"""

new_controls = """          <section className="wick-side-section"><div className="wick-section-title"><h3>Chart style</h3><span>Default: Candlestick</span></div><select className="wick-sound-select" value={settings.chartStyle} onChange={(event) => patch("chartStyle", event.target.value as any)}><option value="candlestick">Candlestick</option><option value="bar">Bar (OHLC)</option><option value="line">Line</option><option value="area">Area</option></select><p>Choose the visual style of the price action data.</p></section>
          <section className="wick-side-section"><div className="wick-section-title"><h3>Chart animation</h3><span>Default: Progressive</span></div><select className="wick-sound-select" value={settings.chartAnimation} onChange={(event) => patch("chartAnimation", event.target.value as ChartAnimation)}><option value="progressive">Progressive zoom</option><option value="follow">Rolling follow</option><option value="fixed">Fixed full timeline</option></select><p>Choose whether the camera expands with the trade, follows the active candle, or keeps the complete timeline fixed.</p><div className="wick-check-list" style={{ marginTop: '12px' }}><label className="wick-check"><input type="checkbox" checked={settings.speedrunMode} onChange={(event) => patch("speedrunMode", event.target.checked)} /><span><b>Cinematic Speedrun</b><small>Accelerates time between trades, slows down during trades.</small></span></label></div></section>"""

code = code.replace(old_controls, new_controls)

old_preview_config = """      theme: settings.theme,
      backgroundStyle: settings.backgroundStyle,
      affiliateLink: settings.affiliateLink,
      speedrunMode: settings.speedrunMode,
      exactValues: settings.exactValues,"""
new_preview_config = """      theme: settings.theme,
      backgroundStyle: settings.backgroundStyle,
      chartStyle: settings.chartStyle,
      affiliateLink: settings.affiliateLink,
      speedrunMode: settings.speedrunMode,
      exactValues: settings.exactValues,"""
code = code.replace(old_preview_config, new_preview_config)

old_export_config = """        theme: settings.theme,
      backgroundStyle: settings.backgroundStyle,
      affiliateLink: settings.affiliateLink,
      speedrunMode: settings.speedrunMode,
        exactValues: settings.exactValues,"""
new_export_config = """        theme: settings.theme,
      backgroundStyle: settings.backgroundStyle,
      chartStyle: settings.chartStyle,
      affiliateLink: settings.affiliateLink,
      speedrunMode: settings.speedrunMode,
        exactValues: settings.exactValues,"""
code = code.replace(old_export_config, new_export_config)

with open('src/instant-overlay.tsx', 'w') as f:
    f.write(code)
