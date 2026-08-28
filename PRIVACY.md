# Privacy Policy

Effective date: August 27, 2026

Wicklapse is a local-first browser extension for creating trade replay videos. The project does not operate a backend service and does not sell personal information.

## Data Wicklapse processes

Depending on the feature used, Wicklapse processes:

- Public Solana wallet addresses associated with the signed-in Axiom account.
- Public blockchain and trade information, including token and pair addresses, transaction signatures, trade amounts, timestamps, and prices.
- Axiom page context such as the active token symbol, token image, pair address, and displayed position summary.
- Replay preferences, optional affiliate text, and locally saved project data.
- A custom RPC URL or API key only when RPC fallback is configured by the user.
- Images, music, or event sounds selected by the user for a replay.

## How data is used

This data is used only to identify the requested trade, retrieve relevant market information, render a preview, export a video, and remember user-selected settings.

## Storage and retention

Settings, public wallet addresses, captured context, and projects are stored in Chrome extension storage on the user's device. RPC settings are kept in session storage unless the user explicitly enables remembering them. User-selected media is decoded locally for the current studio session and is not uploaded by Wicklapse.

Users can delete stored data by clearing Wicklapse's extension data or uninstalling the extension.

## Network disclosures

Wicklapse may send requests to:

- Axiom endpoints for wallet discovery, trades, and candles. The browser may include the user's existing Axiom session credentials directly with these requests.
- GeckoTerminal and CoinGecko for public market and currency data. Requests contain token or pair identifiers and time ranges, not Axiom credentials.
- Solana RPC, Helius, or a custom HTTPS RPC provider selected by the user. RPC requests can contain wallet addresses, token addresses, and transaction signatures. A provider-specific API key may be included in the provider URL.

Each third-party service processes requests under its own privacy terms. Wicklapse does not control those services.

## What Wicklapse does not do

Wicklapse does not include analytics, advertising trackers, telemetry, or a project-operated cloud database. It does not read or store Axiom passwords, private keys, seed phrases, or session cookies.

## Changes

Material changes to this policy will be recorded in the repository and included with the applicable release.

## Questions

Privacy questions can be opened as an issue in the public project repository. Do not include wallet addresses, API keys, or other sensitive data in a public issue.
