# Shift Roster Planner

> Generate a fair weekly or monthly roster from staff and shifts, with rule checks.

Part of [Admin Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

List your staff and shifts and how many people each shift needs, and the tool builds a roster that spreads work evenly, respects weekly offs and leave, and keeps rest gaps between shifts. You can then edit any cell by hand and re-check the rules.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/shift-roster/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- shift-roster ../shift-roster-repo`.

## Features

- Plain-text staff and shift lists with required headcount per shift.
- Rules: weekly off day and leave dates per person (`Asha; off=Sun; leave=2026-11-02..2026-11-04`), maximum days in a row, maximum shifts a week, minimum rest hours between shifts.
- Even distribution of shifts and a statistics table (shifts, weekends, nights per person).
- Checks after manual edits: understaffing, rest breaches and too many days in a row.
- CSV export.

## How it works

`js/core.js` exports `RosterCore`: `DOWN`, `parseStaff`, `parseShifts`, `generate`, `check`, `setCell`, `stats`, `restHours`, `toCsv` and `sample`. Generation is deterministic: the same inputs give the same roster.

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

- It is a planning aid, not a labour-law checker: overtime, statutory rest and local rules are yours to confirm.
- The generator is a fair heuristic, not an optimiser; it may report unfilled slots when the rules are very tight.
- Up to 100 staff and 62 days. Treat results as working aids and check anything important before acting on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/shift-roster/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
