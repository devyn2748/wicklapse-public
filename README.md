# Wicklapse

Wicklapse is a Manifest V3 Chrome extension that turns a selected Axiom spot trade into an animated, locally rendered video.

## Install the test build

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `.output/chrome-mv3` from this project.
5. Reload any Axiom tabs that were already open when Wicklapse was installed.
6. Open the Axiom Share dialog and choose **Create Trade Replay with Wicklapse**. The toolbar icon can open the same flow from an active Axiom page.

Instant Export reads the current token's Axiom **YOU** transaction rows directly and does not require a wallet or RPC key. Only **Open Advanced Workstation** creates a full studio tab; RPC remains available there as an optional fallback and future verification source.

## Test the Axiom-to-video flow

1. Open an Axiom spot token page and its Share dialog.
2. Confirm the Wicklapse entry appears once and does not interfere with Axiom's controls.
3. Confirm Wicklapse selects or detects Axiom's **YOU** filter and captures the displayed personal trades.
4. Confirm Instant Export opens over Axiom without a wallet/RPC setup screen and labels the replay **Captured from Axiom**.
5. Preview the default 1:1 replay at several durations, themes, currencies, and buy/sell sounds.
6. Export the video and verify its duration, square dimensions, audio timing, chart playhead, ATH badge, and buy/sell markers.
7. Open Advanced and test 1:1, 9:16, 4:5, 16:9, custom dimensions, wallet visibility, value precision, a background image, and uploaded music.
8. Close and reopen Wicklapse to confirm the Axiom-first Instant flow remains available.

## Development

```bash
npm install
npm run dev
```

Load the generated Chromium extension from `.output/chrome-mv3-dev` when using a regular Chrome profile.

## Test build scope

- Axiom Share dialog integration
- Semantic capture of Axiom `YOU` rows, displayed values, and Solscan transaction signatures
- Optional Solana wallet/RPC fallback in Advanced
- In-page Instant Export and full-tab Advanced Workstation
- Square-first cinematic replay with event impacts, live P&L, playhead, ATH treatment, and final summary
- GeckoTerminal OHLCV enrichment when the captured pool and history are available
- SOL/USD presentation
- Local canvas preview and video export

## Current first-build limitations

- Active-token capture depends on Axiom's visible token header, semantic trade-table headers, `YOU` filter, Solscan links, and PnL summary markup.
- Market candles use GeckoTerminal when the captured Axiom pool resolves; otherwise the renderer uses the captured trade points and labels them accordingly.
- USD display uses the current SOL/USD rate rather than the historical rate at each fill.
- Custom Advanced backgrounds currently accept images; custom video backgrounds are planned next.
- Export uses MP4/H.264 when the browser exposes that encoder and otherwise downloads WebM/VP9.
- Export is rendered in real time in this build, so a 15-second replay takes about 15 seconds to produce.
