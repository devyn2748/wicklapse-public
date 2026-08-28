# Security Policy

## Supported versions

Security fixes are applied to the latest published version. Users should update before reporting an issue that has already been fixed in a newer release.

## Reporting a vulnerability

Use the repository's private vulnerability reporting feature. Do not post vulnerabilities, wallet addresses, API keys, session data, or exploit details in a public issue.

Include the affected version, expected and observed behavior, reproduction steps, and the security impact. Use synthetic accounts and redacted request data whenever possible.

## Security model

Wicklapse renders locally and has no project-operated backend. It handles only public wallet and blockchain data during its standard Axiom flow. RPC API keys can be stored locally only when the user selects the remember option; Wicklapse never needs a wallet private key or seed phrase.
