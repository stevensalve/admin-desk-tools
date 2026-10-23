# Travel Request Form

> Estimate trip cost, check it against limits, and print a form for approval.

Part of [Admin Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Fill in the traveller, trip and expected costs. The tool totals the estimate, works out the advance, warns when something exceeds your limits (such as a hotel cap per night), and prints a one-page A4 request with approval lines.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/travel-request/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- travel-request ../travel-request-repo`.

## Features

- Fare lines, hotel (rate and nights), daily allowance, local travel and other costs; days and nights worked out from the dates.
- Advance as a percentage of the estimate; amount in Indian words.
- Limit warnings shown on the form for the approver (hotel cap per night, daily-allowance cap).
- PDF and CSV; save and reopen as `.json`.

## How it works

`js/core.js` exports `TravelCore`: `MODES`, `create`, `tripDays`, `compute`, `validate`, `toCsv`, `sanitize`, `buildPdf`, `serialize` and `parse`.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `vendor/`            | Bundled third-party code: pdf-lib 1.17.1 (MIT)                                                      |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (exact versions and licenses in `vendor/README.md`) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.
- Keep the files you save (`.json`, `.csv`, `.pdf`) in a folder only the right people can open. They are not password-protected.

## Limitations

- It does not book travel or approve anything.
- The caps are the ones you enter; it knows nothing about your travel policy.
- Single currency (INR). Treat results as working aids and check anything important before acting on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/travel-request/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). pdf-lib (MIT).
