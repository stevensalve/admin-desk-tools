# Purchase Order Maker

> GST purchase orders with CGST/SGST or IGST, amount in words and a clean PDF.

Part of [Admin Desk Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Enter the buyer, the supplier and the items, and get a purchase order as a PDF. It chooses CGST + SGST or IGST from the two states, rounds every line to paise so the totals add up, and writes the total in Indian words.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/purchase-order/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- purchase-order ../purchase-order-repo`.

## Features

- Buyer and supplier with state and GSTIN validation (format, state code and check character).
- Items with HSN/SAC, quantity, unit, rate, discount and GST rate.
- Numbering such as `PO/26-27/0007` that increments to the next number; delivery date and terms.
- PDF (extra pages for long orders) and CSV; save and reopen as `.json`.

## How it works

`js/core.js` exports `PoCore`: `STATES`, `GST_RATES`, `DEFAULT_TERMS`, `gstinProblem`, `nextNumber`, `financialYear`, `create`, `validate`, `compute`, `toCsv`, `sanitize`, `buildPdf`, `serialize` and `parse`.

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

- It does not approve, send or track the order.
- Reverse charge, cess and TCS are not modelled.
- PDF fonts are Latin only; the rupee sign prints as `Rs.`. Treat results as working aids and check anything important before acting on it.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/purchase-order/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). pdf-lib (MIT).
