/**
 * The catalogue shown on the launcher page (index.html).
 * Keep in sync with the folders in /tools - `npm run check:structure` fails if
 * a tool is missing here. It is a .js file (not .json) so the launcher also
 * works when opened straight from disk, where browsers block fetch().
 */
window.TOOLS = [
  {
    id: 'visitor-log',
    title: 'Visitor Log & Passes',
    tagline: 'Check visitors in and out, print visitor passes, and see who is on site right now.',
    replaces: 'paper visitor registers',
    tags: ['visitor', 'reception', 'pass'],
  },
  {
    id: 'inventory-tracker',
    title: 'Inventory & Stock Tracker',
    tagline: 'Track stock in and out, spot low stock and get reorder suggestions with values.',
    replaces: 'stock spreadsheets',
    tags: ['stock', 'inventory', 'reorder'],
  },
  {
    id: 'shift-roster',
    title: 'Shift Roster Planner',
    tagline: 'Build a fair weekly or monthly shift roster that meets minimum cover and rest rules.',
    replaces: 'hand-made rosters',
    tags: ['roster', 'shift', 'schedule'],
  },
  {
    id: 'purchase-order',
    title: 'Purchase Order Maker',
    tagline: 'GST purchase orders with vendor terms, delivery details and a clean PDF.',
    replaces: 'Word purchase-order templates',
    tags: ['po', 'purchase', 'gst'],
  },
  {
    id: 'contract-tracker',
    title: 'Contract & Renewal Tracker',
    tagline: 'Never miss a renewal: end dates, notice periods, auto-renewals and a calendar file.',
    replaces: 'renewal reminders in e-mail',
    tags: ['contract', 'renewal', 'vendor'],
  },
  {
    id: 'room-booking',
    title: 'Meeting Room Planner',
    tagline: 'Book rooms on a day grid, catch double bookings and print the day sheet.',
    replaces: 'shared booking sheets',
    tags: ['rooms', 'booking', 'calendar'],
  },
  {
    id: 'maintenance-scheduler',
    title: 'Maintenance Scheduler',
    tagline: 'Recurring maintenance for equipment and premises with due and overdue lists.',
    replaces: 'maintenance wall charts',
    tags: ['maintenance', 'assets', 'recurring'],
  },
  {
    id: 'travel-request',
    title: 'Travel Request Form',
    tagline: 'Estimate trip costs with per-diem and print a travel request for approval.',
    replaces: 'paper travel forms',
    tags: ['travel', 'request', 'approval'],
  },
  {
    id: 'incident-log',
    title: 'Incident & Complaint Log',
    tagline: 'Log issues with severity and due dates, track status and see what is overdue.',
    replaces: 'shared issue sheets',
    tags: ['incident', 'complaint', 'sla'],
  },
  {
    id: 'sop-builder',
    title: 'SOP & Checklist Builder',
    tagline: 'Turn steps into a printable SOP or checklist with owners and sign-off boxes.',
    replaces: 'Word checklists',
    tags: ['sop', 'checklist', 'pdf'],
  },
];
