# Inventory & Stock Tracker

> Stock on hand, low-stock alerts and a reorder list from a simple item and movement list.

Part of [Admin Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Load a list of items and the stock movements (received, issued, adjusted) and see the stock level of every item on any date, which items are below their reorder level, and how much to order.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/inventory-tracker/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- inventory-tracker ../inventory-tracker-repo`.

## Features

- Reads Excel and CSV; items need a code or name, reorder level and optional reorder quantity and unit cost.
- Stock on any date from the movement history; value of stock at unit cost.
- Low-stock and out-of-stock lists with a suggested order quantity.
- Movements that would take stock below zero are flagged rather than hidden.
- CSV exports of stock, reorder list and movements.

## How it works

`js/core.js` exports `StockCore`: `rowsToItems`, `rowsToMovements`, `addMovement`, `stockOn`, `suggestOrder`, `report`, `stockCsv`, `reorderCsv`, `movementsCsv` and `sample`.

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

- It is a simple ledger for small stores. Batches, expiry dates, serial numbers and multiple locations are not tracked.
- Stock is only as accurate as the movements entered; do a physical count regularly.
- Item matching is by code (or name) ignoring case. Treat results as working aids and check anything important before acting on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/inventory-tracker/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS Community Edition 0.20.3 (Apache-2.0).
