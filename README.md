# Wicklapse

Wicklapse is a Manifest V3 Chrome extension that turns a selected Axiom spot trade into an animated, locally rendered video.

## Install the test build

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Run `npm run build`, then select `Wicklapse-Unpacked` from this project.
5. Reload any Axiom tabs that were already open when Wicklapse was installed.
6. Open the Axiom Share dialog and choose **Create Trade Replay with Wicklapse**. The toolbar icon can open the same flow from an active Axiom page.

Instant Export automatically reads the signed-in account's public, non-archived Solana trading wallets from Axiom, combines them as one position, and sends them with the current `/meme/{pairAddress}` to Axiom's authenticated transactions feed. It does not open or scrape **My Trades**, inspect credentials, or require an RPC key. Only **Open Advanced Workstation** creates a full studio tab; manually entered public wallets and RPC remain optional fallbacks.

## Test the Axiom-to-video flow

1. Open an Axiom spot token page and its Share dialog.
2. Confirm the Wicklapse entry appears once and does not interfere with Axiom's controls.
3. Confirm Instant Export detects all public Solana trading wallets in the signed-in Axiom account without asking for wallet input.
4. Confirm it opens without changing the active Axiom table/filter and automatically retrieves every matching buy, sell, and partial fill across those wallets.
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
- Automatic Axiom public-wallet discovery and batched transaction-feed lookup by current pair across multiple wallets
- Compact-row validation, malformed-row isolation, signature deduplication, and chronological normalization
- Optional Solana wallet/RPC fallback in Advanced
- In-page Instant Export and full-tab Advanced Workstation
- Compact right-side Instant panel that leaves the Axiom chart visible and interactive instead of dimming the entire page
- Social-first replay with oversized running P&L/ROI/multiple, initial buy, and large consolidated execution markers
- Axiom `pair-chart-v3` candles with native dynamic intervals, GeckoTerminal fallback, and execution-path fallback
- Low-cap market-cap chart scale with automatic `$K`/`$M`/`$B` labels, plus an Advanced threshold and overrides for forced K, forced M, or raw token price
- Trading-style candle bodies, sequentially developing wicks, volume, price scale, and grid with no future candles or future scale values revealed
- Animated chart auto-fit that progressively zooms out while the active candle body and wick grow from the open
- Duration-aware replay pacing that uses the full selected clip length with a consistent 0.65-second final hold
- Improved automatic candle density plus Auto, 1s, 5s, and 1m interval controls; 5s bars are aggregated locally from real 1s OHLCV and unsafe overrides are coarsened just enough to preserve the full trade
- Sparse-market OHLC recovery with empty-interval fills and progressively coarser provider-supported retries
- Race-safe candle switching so an older response can never overwrite the newest selection
- Automatic preview restart from 0:00 after duration, candle, theme, currency, audio, aspect, quality, background, or other studio configuration changes
- Timeline-synchronized Buy and Sell audio in both the in-page preview and exported video
- Advanced custom Buy/Sell sound uploads (up to 8 MB each) with partial fills consolidated to the same audible event as their visible marker
- Thirteen bundled Buy/Sell presets—including Hitmarker, Apple Pay, Cash Register, GTA Pickup, Mario Coin, Pop, and Gaming Punch—available by default in both dropdowns
- Mark-to-market P&L throughout the position instead of buy/sell cash-flow jumps
- SOL/USD presentation
- Local canvas preview and video export

## Current first-build limitations

- Exact executions and automatic wallet discovery depend on the signed-in Axiom session and the stability of Axiom's wallet and `transactions-feed-v4` endpoints; provider-specific payloads remain isolated from the replay UI.
- Token symbol, mint, image, and optional P&L summary still come from the active Axiom coin page. Chart DOM data is not read.
- Market candles use Axiom `pair-chart-v3` first and GeckoTerminal second; otherwise the renderer labels and uses the execution-price path rather than inventing candles. Historical market-cap scaling still depends on GeckoTerminal and may fall back to pool FDV.
- USD display uses the current SOL/USD rate rather than the historical rate at each fill.
- Custom Advanced backgrounds currently accept images; custom video backgrounds are planned next.
- Export uses MP4/H.264 when the browser exposes that encoder and otherwise downloads WebM/VP9.
- Export is rendered in real time in this build, so a 15-second replay takes about 15 seconds to produce.
