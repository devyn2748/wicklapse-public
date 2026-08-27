# Wicklapse

Wicklapse is a Manifest V3 Chrome extension that turns a selected Axiom spot trade into an animated, locally rendered video.

## Install the test build

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Run `npm run build`, then select `Wicklapse-Unpacked` from this project.
5. Reload any Axiom tabs that were already open when Wicklapse was installed.
6. Open the Axiom Share dialog and choose **Create Trade Replay with Wicklapse**. The toolbar icon can open the same flow from an active Axiom page.

Instant Export automatically reads the signed-in account's public, non-archived Solana trading wallets from Axiom, combines them as one position, and sends them with the current `/meme/{pairAddress}` to Axiom's authenticated transactions feed. It does not open or scrape **My Trades**, inspect credentials, or require an RPC key. Expanded replay controls now open as an attached panel inside Axiom instead of creating a separate tab.

## Test the Axiom-to-video flow

1. Open an Axiom spot token page and its Share dialog.
2. Confirm the Wicklapse entry appears once and does not interfere with Axiom's controls.
3. Confirm Instant Export detects all public Solana trading wallets in the signed-in Axiom account without asking for wallet input.
4. Confirm it opens without changing the active Axiom table/filter and automatically retrieves every matching buy, sell, and partial fill across those wallets.
5. Preview the default 16:9 X landscape replay at several durations, themes, currencies, and Buy/Sell sound dropdown choices.
6. Export the video and verify its duration, 1920×1080 dimensions, audio timing, running mark-to-market P&L, OHLC candles, and buy/sell markers.
7. Expand the attached control panel and test currency, chart animation, custom clip duration, first-buy placement, and post-sell padding.
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
- Automatic Axiom wallet detection with previously saved public wallets as a local fallback
- In-page Instant Export with an expandable control panel attached to its left edge
- Compact right-side Instant panel that leaves the Axiom chart visible and interactive instead of dimming the entire page
- Social-first replay with oversized running P&L/ROI/multiple, initial buy, and large consolidated execution markers
- Axiom `pair-chart-v3` candles with native dynamic intervals, GeckoTerminal fallback, and execution-path fallback
- Low-cap market-cap chart scale with automatic `$K`/`$M`/`$B` labels
- Trading-style candle bodies, sequentially developing wicks, volume, price scale, and grid with no future candles or future scale values revealed
- Expanded-panel chart styles: Candlestick (default), Bar (OHLC), Line, and Area
- Expanded-panel chart motion modes: fixed full-timeline camera (default), progressive auto-fit, and a rolling follow
- "Speedrun" mode for cinematic pacing that dynamically accelerates empty time between trades and slows down into slow-motion for buy/sell events
- Customizable affiliate link input to overlay referral/vanity links directly on the rendered chart
- Optional horizontal Average Buy and Average Sell levels that recalculate on every execution, plus a truthful Axiom ATH overlay that becomes a line only when the clip reaches ATH and otherwise stays as a top-edge value badge
- Custom fractional video duration and lead/tail placement backed by real market history—for example, first buy at 3s and final sell at 7s in a 10s clip; clear either padding field to restore Auto
- Duration-aware replay pacing that uses the full selected clip length with a consistent 0.65-second final hold
- Improved automatic candle density plus Auto, 1s, 5s, and 1m interval controls; 5s bars are aggregated locally from real 1s OHLCV and unsafe overrides are coarsened just enough to preserve the full trade
- Sparse-market OHLC recovery with empty-interval fills and progressively coarser provider-supported retries
- Race-safe candle switching so an older response can never overwrite the newest selection
- Automatic preview restart from 0:00 after duration, candle, theme, currency, audio, aspect, quality, background, or other studio configuration changes
- Timeline-synchronized Buy and Sell audio in both the in-page preview and exported video
- Timeline-synchronized bundled Buy/Sell sounds with partial fills consolidated to the same audible event as their visible marker
- Thirteen bundled Buy/Sell presets—including Hitmarker, Apple Pay, Cash Register, GTA Pickup, Mario Coin, Pop, and Gaming Punch—available by default in both dropdowns
- Mark-to-market P&L throughout the position instead of buy/sell cash-flow jumps
- SOL/USD presentation
- Local canvas preview and video export

## Current first-build limitations

- Exact executions and automatic wallet discovery depend on the signed-in Axiom session and the stability of Axiom's wallet and `transactions-feed-v4` endpoints; provider-specific payloads remain isolated from the replay UI.
- Token symbol, mint, image, and optional P&L summary still come from the active Axiom coin page. Chart DOM data is not read.
- Market candles use Axiom `pair-chart-v3` first and GeckoTerminal second; otherwise the renderer labels and uses the execution-price path rather than inventing candles. Historical market-cap scaling still depends on GeckoTerminal and may fall back to pool FDV.
- USD display uses the current SOL/USD rate rather than the historical rate at each fill.
- Additional expanded-panel controls—including custom media uploads and privacy presentation—will move into the in-page workflow in later builds.
- Export uses MP4/H.264 when the browser exposes that encoder and otherwise downloads WebM/VP9.
- Export is rendered in real time in this build, so a 15-second replay takes about 15 seconds to produce.
