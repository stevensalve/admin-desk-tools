# Meeting Room Planner

> Book rooms on a day grid, catch clashes, and print the day sheet.

Part of [Admin Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Define your rooms and hours, then book meetings. The tool refuses double bookings, checks capacity, can repeat a meeting daily or weekly, and suggests free rooms for a time slot. The day view shows every room on one grid.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/room-booking/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- room-booking ../room-booking-repo`.

## Features

- Rooms with seats, opening hours and an optional buffer between meetings.
- Clash and capacity checks; weekday and weekly repeats, skipping dates that clash.
- "Which rooms are free?" for a time and number of people.
- Day grid with utilisation, printable day sheet, CSV, calendar file (`.ics`); save and reopen as `.json`.

## How it works

`js/core.js` exports `RoomCore`: `toMin`, `fmt`, `create`, `parseRooms`, `configure`, `problem`, `book`, `bookSeries`, `cancel`, `suggest`, `freeSlots`, `day`, `toCsv`, `toIcs`, `serialize` and `parse`.

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

- It works only on one computer: bookings are not shared. Save the plan file and pass it on, or host one copy and agree who edits it.
- Bookings cannot cross midnight.
- Calendar files carry no attendees or invitations. Treat results as working aids and check anything important before acting on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/room-booking/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
