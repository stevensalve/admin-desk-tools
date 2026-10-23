# Maintenance Scheduler

> Plan recurring maintenance, see what is due, and log completions.

Part of [Admin Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

List your assets and tasks with how often they repeat (every 3 months, every 90 days, weekly) and the tool shows what is overdue, due soon and coming up. Mark a task done and the next date is worked out from the completion date.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/maintenance-scheduler/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- maintenance-scheduler ../maintenance-scheduler-repo`.

## Features

- Plain-text task list: `AC filter clean, every 3 months, last 05/07/2026`.
- Status per task: overdue, due soon, upcoming; a forecast of the next months and a workload view.
- Completion history; month-end safe date maths.
- Status and history CSV, calendar file (`.ics`); save and reopen as `.json`.

## How it works

`js/core.js` exports `MaintCore`: `UNITS`, `addMonths`, `addInterval`, `parseEvery`, `create`, `addTask`, `removeTask`, `markDone`, `nextDue`, `status`, `forecast`, `workload`, `parseLines`, `statusCsv`, `historyCsv`, `toIcs`, `serialize`, `parse` and `sampleText`.

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

## Limitations

- Safety-critical or statutory inspections (lifts, fire systems, boilers) must follow the schedule your regulator and vendor require: use this only as a reminder.
- Intervals are fixed; usage-based maintenance (every 5,000 km) is not modelled.
- It does not send reminders. Treat results as working aids and check anything important before acting on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/maintenance-scheduler/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
