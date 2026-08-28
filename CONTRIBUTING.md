# Contributing

Contributions are welcome through the public repository.

## Set up

```bash
npm ci
npm run check
npm run build
```

Use Node.js 20 or newer. Keep changes focused, add tests for behavior changes, and verify both the in-page overlay and studio flow when changing shared rendering or audio code.

## Privacy and test fixtures

Never commit real wallet addresses, transaction signatures, API keys, session data, personal email addresses, user names, local filesystem paths, screenshots of signed-in accounts, or exported user projects. Use obviously synthetic fixtures such as repeated base58-safe characters.

Run `npm run public:audit` before opening a pull request.

## Assets

Only add assets that permit redistribution. Record the creator, source URL, license or permission, and any required attribution in [ASSET_NOTICES.md](ASSET_NOTICES.md). Remove metadata that contains personal information before committing the asset.

## Pull requests

Describe the user-visible behavior, testing performed, permission or privacy impact, and any new network hosts or stored fields. Changes that broaden browser permissions or data handling must update both the README and privacy policy.
