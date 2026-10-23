# Ideas and good first tasks

Pick something, open an issue to say so, and follow [CONTRIBUTING.md](../CONTRIBUTING.md). Difficulty guide: **J** = suitable for a junior engineer, **M** = mid-level.

## Improvements to existing tools

| Tool                  | Task                                                | Level |
| --------------------- | --------------------------------------------------- | ----- |
| Visitor Log           | Pre-registration list for expected visitors         | J     |
| Visitor Log           | Badge size and layout options for the pass          | J     |
| Inventory Tracker     | Batch and expiry dates                              | M     |
| Inventory Tracker     | Import movements from a delivery-note CSV           | J     |
| Shift Roster          | Preferences per person (preferred shifts)           | M     |
| Shift Roster          | Print layout for a notice board                     | J     |
| Purchase Order        | Link a PO to a supplier list you load from Excel    | M     |
| Purchase Order        | Delivery schedule per item                          | M     |
| Contract Tracker      | Escalating reminder wording by days left            | J     |
| Room Booking          | Week view with all rooms                            | M     |
| Maintenance Scheduler | Usage-based intervals (every N hours)               | M     |
| Travel Request        | City-grade based caps                               | J     |
| Incident Log          | Weekly summary page for printing                    | J     |
| SOP Builder           | Revision history table on the PDF                   | J     |
| All                   | Translate tool text (an `i18n` helper in `shared/`) | M     |
| All                   | Playwright smoke tests for each page in CI          | M     |

## New tool candidates

Fresh candidates for an eleventh tool:

| Idea                          | What it does                                               | Level |
| ----------------------------- | ---------------------------------------------------------- | ----- |
| Asset Register                | Office assets with location, custodian and handover log    | J     |
| Key & Equipment Issue Log     | Who has which key or laptop, with return tracking          | J     |
| Courier & Dak Register        | Inward/outward register with acknowledgement slip          | J     |
| Vendor Evaluation             | Weighted scorecard to compare suppliers                    | M     |
| Petty Cash Book               | Cash book with running balance and monthly summary         | J     |
| Fire Drill & Safety Checklist | Recurring safety checks with a sign-off log                | M     |
| Vehicle Log Book              | Trips, odometer and fuel log with monthly summary          | J     |
| Parking Allocation            | Slots per employee and visitor, with a day sheet           | J     |
| Event Run-sheet               | Timeline of an event with owners and a printable run-sheet | M     |
| Quotation Comparison          | Side-by-side comparison of vendor quotes with landed cost  | M     |

## Repository and quality

- Add a screenshot gallery to the root README (J).
- Add an accessibility audit script with axe-core run from Playwright in CI (M).
- Add a Content-Security-Policy `report` mode test that fails on any violation during the smoke tests (M).
