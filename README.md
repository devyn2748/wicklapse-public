# Wicklapse

Wicklapse is a Manifest V3 Chrome extension that turns a selected Axiom spot trade into an animated, locally rendered video.

## Install the test build

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `.output/chrome-mv3` from this project.
5. Reload any Axiom tabs that were already open when Wicklapse was installed.
6. Open the Axiom Share dialog and choose **Create Trade Replay with Wicklapse**. The toolbar icon can open the same flow from an active Axiom page.

Instant Export sends the current `/meme/{pairAddress}` and the saved public trading wallet(s) directly to Axiom's authenticated transactions feed. It does not open or scrape **My Trades**, and it does not require an RPC key. Only **Open Advanced Workstation** creates a full studio tab; RPC remains available there as an optional fallback.

## Test the Axiom-to-video flow

1. Open an Axiom spot token page and its Share dialog.
2. Confirm the Wicklapse entry appears once and does not interfere with Axiom's controls.
3. Save one or more public Axiom trading wallets in Advanced, separated by commas, then return to the coin page.
4. Confirm Instant Export opens without changing the active Axiom table/filter and automatically retrieves every matching buy, sell, and partial fill.
5. Preview the default 16:9 X landscape replay at several durations, themes, currencies, and buy/sell sounds.
6. Export the video and verify its duration, 1920×1080 dimensions, audio timing, chart playhead, ATH badge, and buy/sell markers.
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
- Direct authenticated Axiom transaction-feed lookup by current pair and one or more public trading wallets
- Compact-row validation, malformed-row isolation, signature deduplication, and chronological normalization
- Optional Solana wallet/RPC fallback in Advanced
- In-page Instant Export and full-tab Advanced Workstation
- Social-first cinematic replay with oversized live P&L, full-frame neon price action, animated impact bursts, exact buy/sell labels, honest peak/ATH treatment, and dense final stats
- GeckoTerminal OHLCV enrichment when the captured pool and history are available
- SOL/USD presentation
- Local canvas preview and video export

## Current first-build limitations

- Exact executions depend on the signed-in Axiom session and the stability of `transactions-feed-v4`; the replay UI is isolated from its compact array indexes.
- Token symbol, mint, image, and optional P&L summary still come from the active Axiom coin page. Chart DOM data is not read.
- Market candles use GeckoTerminal when the captured Axiom pool resolves; otherwise the renderer uses the captured trade points and labels them accordingly.
- Until the dedicated historical OHLC phase lands, sparse replays are explicitly labelled **Execution Price Path** rather than presenting interpolated fills as full market history.
- USD display uses the current SOL/USD rate rather than the historical rate at each fill.
- Custom Advanced backgrounds currently accept images; custom video backgrounds are planned next.
- Export uses MP4/H.264 when the browser exposes that encoder and otherwise downloads WebM/VP9.
- Export is rendered in real time in this build, so a 15-second replay takes about 15 seconds to produce.
