# Incident & Complaint Log

> Log issues, set response targets, and see what is overdue.

Part of [Admin Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

A simple log for incidents and complaints. Each one gets a reference, a severity and a due date from your response targets. Change the status, owner and notes as work moves forward, and see at a glance what is overdue and how quickly things are being closed.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/incident-log/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- incident-log ../incident-log-repo`.

## Features

- Severity targets you control (default Critical 1, High 3, Medium 7, Low 14 days).
- Status flow Open, In progress, Waiting, Resolved, Closed, with notes and owner changes.
- Overdue and aging view, filters, and a summary by severity, category and owner with average time to resolve.
- CSV export; save and reopen as `.json`.

## How it works

`js/core.js` exports `IncidentCore`: `SEVERITIES`, `STATUSES`, `DEFAULT_SLA`, `create`, `setSla`, `add`, `setStatus`, `assign`, `setSeverity`, `addNote`, `list`, `summary`, `toCsv`, `serialize`, `parse` and `sample`.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- The tool has no third-party dependencies at all.
- Keep the files you save (`.json`, `.csv`, `.pdf`) in a folder only the right people can open. They are not password-protected.
- Do not record sensitive personal details of people involved unless your policy allows it.

## Limitations

- It does not replace a formal safety, HR or legal reporting process; serious incidents have mandatory reporting duties.
- No attachments or notifications.
- Up to 5,000 incidents per file. Treat results as working aids and check anything important before acting on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/incident-log/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
