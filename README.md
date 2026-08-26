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
5. Preview the default 16:9 X landscape replay at several durations, themes, currencies, and Buy/Sell sound dropdown choices.
6. Export the video and verify its duration, 1920×1080 dimensions, audio timing, running mark-to-market P&L, OHLC candles, and buy/sell markers.
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
- Social-first replay with oversized running P&L/ROI/multiple, initial buy, and large consolidated execution markers
- Adaptive GeckoTerminal OHLCV history using 1-second candles for trades up to five minutes, then 1-minute and progressively larger intervals for longer positions
- Low-cap market-cap chart scale with automatic `$K`/`$M`/`$B` labels, plus an Advanced threshold and overrides for forced K, forced M, or raw token price
- Trading-style candle bodies, sequentially developing wicks, volume, price scale, and grid with no future candles or future scale values revealed
- Animated chart auto-fit that progressively zooms out while the active candle body and wick grow from the open
- Timeline-synchronized Buy and Sell audio in both the in-page preview and exported video
- Advanced custom Buy/Sell sound uploads (up to 8 MB each) with partial fills consolidated to the same audible event as their visible marker
- Mark-to-market P&L throughout the position instead of buy/sell cash-flow jumps
- SOL/USD presentation
- Local canvas preview and video export

## Current first-build limitations

- Exact executions depend on the signed-in Axiom session and the stability of `transactions-feed-v4`; the replay UI is isolated from its compact array indexes.
- Token symbol, mint, image, and optional P&L summary still come from the active Axiom coin page. Chart DOM data is not read.
- Market candles and estimated historical market cap use GeckoTerminal when the captured Axiom pool resolves; otherwise the renderer uses a plainly styled angular execution path rather than synthetic candles. Market cap falls back to the pool FDV when a circulating-cap figure is unavailable.
- USD display uses the current SOL/USD rate rather than the historical rate at each fill.
- Custom Advanced backgrounds currently accept images; custom video backgrounds are planned next.
- Export uses MP4/H.264 when the browser exposes that encoder and otherwise downloads WebM/VP9.
- Export is rendered in real time in this build, so a 15-second replay takes about 15 seconds to produce.
