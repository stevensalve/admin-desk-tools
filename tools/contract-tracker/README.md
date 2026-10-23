# Contract & Renewal Tracker

> See which contracts expire soon, what notice you must give, and export reminders.

Part of [Admin Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Load a list of contracts (vendor, start, end, value, notice period, auto-renew) and see what is active, expiring, in its notice window or lapsed. Download reminders for your calendar and a ready-to-send reminder text.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/contract-tracker/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- contract-tracker ../contract-tracker-repo`.

## Features

- Reads Excel and CSV with flexible column names and dates in DD/MM/YYYY or ISO.
- Status for each contract: active, ending soon, act now (inside the notice window), locked in (notice date passed on an auto-renewing contract) or expired.
- Summary of value expiring in the next 30, 60 and 90 days.
- Calendar file (`.ics`) with the key dates, CSV, and reminder text per contract.

## How it works

`js/core.js` exports `ContractCore`: `ORDER`, `rowsToContracts`, `analyse`, `summary`, `reminder`, `toCsv`, `toIcs` and `sampleRows`. The as-of date is always passed in.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `vendor/`            | Bundled third-party code: SheetJS Community Edition 0.20.3 (Apache-2.0)                             |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (exact versions and licenses in `vendor/README.md`) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.
- Keep the files you save (`.json`, `.csv`, `.pdf`) in a folder only the right people can open. They are not password-protected.

## Limitations

- It reads what you entered. Notice clauses can be complicated: confirm the real terms in the contract.
- It does not send reminders: import the calendar file into your calendar.
- Not legal advice. Treat results as working aids and check anything important before acting on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/contract-tracker/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS Community Edition 0.20.3 (Apache-2.0).
