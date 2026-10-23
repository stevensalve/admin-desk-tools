# Visitor Log & Passes

> Check visitors in and out, see who is on site, and print a visitor pass.

Part of [Admin Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

A front-desk register that runs in the browser. Record each visitor on arrival, print a pass, mark the check-out, and see at any moment who is still inside. At the end of the day, download the day sheet.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/visitor-log/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- visitor-log ../visitor-log-repo`.

## Features

- Check-in with name, company, phone, whom they are meeting, purpose and ID type; only the last four characters of an ID number are kept.
- Live "on site" list with time spent, and a warning for visitors who stay beyond the limit you set.
- One-page A4 visitor pass as PDF.
- Day summary by host and purpose with average stay; CSV export; save and reopen as `.json`.

## How it works

`js/core.js` exports `VisitorCore`: `PURPOSES`, `ID_TYPES`, `toMinutes`, `minutesBetween`, `create`, `cleanPhone`, `fmtPhone`, `last4`, `checkIn`, `checkOut`, `onSite`, `overstays`, `duration`, `daySummary`, `toCsv`, `sanitize`, `buildPassPdf`, `serialize` and `parse`. The current time is always passed in.

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
- Visitor details are personal data. The tool keeps only the last four characters of an ID number and never stores anything in the browser, but the files you save contain names and phone numbers: protect and delete them as your policy requires.

## Limitations

- It is a register, not an access-control system: it cannot open gates or verify an ID.
- PDF fonts are Latin only; other scripts print as `?`.
- Visitors are stored only in the file you save: close the page without saving and the log is gone. Treat results as working aids and check anything important before acting on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/visitor-log/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). pdf-lib (MIT).
