# Releasing Wicklapse

## 1. Verify source and history

```bash
npm ci
npm run release:check
npm run public:history-check
```

The history check accepts GitHub no-reply commit addresses and rejects other author email addresses. For an initial privacy-preserving publication, import the reviewed source as a fresh repository or a new root commit instead of pushing unaudited development history. Configure a GitHub no-reply address before making the public commit.

Confirm that every bundled asset has a redistribution basis recorded in [ASSET_NOTICES.md](ASSET_NOTICES.md). Also review the requested browser permissions and the privacy policy whenever data handling or network hosts change.

## 2. Build the extension

```bash
npm run build
npm run zip
```

The unpacked production extension is written to `Wicklapse-Unpacked`. WXT writes the store-ready archive to `.output`.

## 3. Inspect the package

- Confirm the manifest name, version, description, permissions, and allowed hosts.
- Search the unpacked extension for emails, local home paths, source maps, credentials, and private URLs.
- Install the unpacked package in a clean Chrome profile and exercise the Axiom, preview, audio, and export flows.
- Verify that clearing extension data removes saved wallets, settings, RPC configuration, and projects.

## 4. Publish

Tag the exact reviewed commit and attach the WXT archive to the release. Include user-visible changes, privacy or permission changes, known limitations, and the SHA-256 checksum of the uploaded archive.
