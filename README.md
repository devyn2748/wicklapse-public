# Wicklapse

Wicklapse is a Manifest V3 Chrome extension that turns crypto trades from **Fomo** and **Axiom** into animated, locally rendered P&L replay videos.

## Platform Support

- **Fomo**: Works for **ANY** trade by **ANY** user. You can generate replays for any profile or trade you view on Fomo.
- **Axiom**: Currently limited to your **own** trades using your signed-in Axiom session.

## Current Features

- **Zero User Input Required**: Just open a trade page and open the extension. Wicklapse automatically detects the context, wallets, executions, and price history without you needing to copy, paste, or configure anything.
- **Instant Export Overlay**: An in-page, expandable control panel that attaches directly to the Fomo or Axiom page, allowing you to preview and export videos without leaving the chart.
- **Customizable Composition**: Adjust video duration, resolution, aspect ratio (16:9 Landscape or 9:16 Portrait), and exact first-buy/final-sell placement on the timeline.
- **Cinematic Speedrun Mode**: Accelerates time between sparse trades and slows down during active trading windows for a dynamic viewing experience.
- **Visual Customization**:
  - Chart styles: Candlestick, Bar (OHLC), Line, or Area.
  - Backgrounds: Procedural options (Ambient Glow, Solid, Retro Grid, Particles) and bundled image backdrops (Aurora, Cyberpunk, etc.).
  - Indicator styles: Detailed (default), Feed (animated text), or Hype (neon two-line).
- **Audio & Sound Effects**: Timeline-synchronized Buy and Sell audio with numerous bundled presets (Hitmarker, Cash Register, Mario Coin, etc.) or custom audio uploads.
- **Advanced Indicators**: Optional Average Buy and Average Sell levels that recalculate on every execution, plus a truthful ATH overlay.
- **Accurate Market Data**: Leverages Fomo's active session for precise candle fetching, Axiom's `pair-chart-v3` with dynamic intervals, and GeckoTerminal fallbacks.
- **Mark-to-Market P&L**: Tracks running P&L, ROI, and position multiples accurately throughout the trade timeline, supporting both SOL and USD (where available) currencies.
- **Local Rendering**: Renders canvas animations locally in your browser and exports directly to MP4 (or WebM fallback) in real-time.

## Development & Building

To run the extension in development mode with hot-reloading:
```bash
npm install
npm run dev
```
Then load the generated unpacked extension from `.output/chrome-mv3-dev` in Chrome (`chrome://extensions` > Developer mode > Load unpacked).

### Building for Chrome

To generate the final, unpacked extension for regular use:
```bash
npm run build
```
This command runs tests, builds the extension, and syncs the output to the `Wicklapse-Unpacked` folder. You can then load the `Wicklapse-Unpacked` folder into Chrome via **Load unpacked**.
