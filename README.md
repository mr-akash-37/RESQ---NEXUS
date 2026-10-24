# ResQ Nexus

Intelligent Disaster Response & Resource Allocation — a working prototype
that fuses satellite-derived data and citizen ground reports into a single
incident feed, then dispatches the nearest compatible resource using a
priority-weighted allocation engine.

## Run it locally

No installation step, no database server, no API keys required.

**Requirements:** [Node.js](https://nodejs.org) 14 or later (any recent
version works). Check with `node --version`.

```bash
node server.js
```

Then open **http://localhost:3000** in your browser.

That's it — the app persists its data to `data/store.json`, which is
created automatically on first run and pre-seeded with five sample
resources around Bengaluru so the map and allocation engine have something
to work with immediately.

To wipe all data and start fresh, either delete `data/store.json` and
restart the server, or call `POST /api/reset`.

## What's in the app

| Page | Purpose |
|---|---|
| `/` | Landing page: project overview, live stats, references |
| `/report` | Citizen incident reporting form + one-tap SOS button |
| `/dashboard` | Live map, incident feed, and "Run allocation" control |
| `/resources` | View and add resources (ambulances, shelters, etc.) |
| `/alerts` | Alert delivery log with acknowledge / escalation tracking |

## How it works

**Intake (`lib/intake.js`)** — every report, whether from a citizen form or
a satellite feed, is logged as a raw report first. Reports of the same
disaster type within 2 km and 3 hours of an existing incident are merged
into it rather than creating a duplicate, and each additional independent
report raises that incident's confidence score. Citizen reports start
unverified; satellite/official sources start verified.

**Allocation (`lib/allocate.js`)** — active incidents are ranked by an
urgency score (severity × log-scaled population affected × confidence),
then matched to the nearest *available* resource of a compatible type
within a 50 km radius, using great-circle distance (`lib/geo.js`). This is
a transparent, explainable baseline — swap it for an OR-Tools/linear-
programming solver later without touching the rest of the system.

**Alerts (`lib/alerts.js`)** — alerts carry a lifecycle (`sent` →
`acknowledged` or `escalated`), not just a send-and-forget message. An
alert unacknowledged for 10 minutes is automatically flagged for
escalation, addressing the specific failure pattern (alerts sent but
receipt never confirmed) seen in past flood responses.

## Migrating to production

This prototype uses a single JSON file (`lib/store.js`) as its data layer
so it needs zero setup. The field names were chosen to match a
PostgreSQL + PostGIS schema directly — `incidents`, `incident_reports`,
`resources`, `allocations`, `alerts` — so moving to a real database later
means replacing `lib/store.js` with a Postgres client; the route logic in
`server.js` and the algorithms in `lib/allocate.js` / `lib/intake.js`
should not need to change.

## Project structure

```
resq-nexus/
├── server.js           # HTTP server + API routes (zero dependencies)
├── lib/
│   ├── store.js         # JSON-file data layer
│   ├── geo.js            # distance / ETA calculations
│   ├── intake.js         # multi-source report fusion
│   ├── allocate.js       # allocation engine
│   └── alerts.js         # alert lifecycle + escalation
├── data/
│   └── store.json        # created on first run
└── public/               # frontend (static HTML/CSS/JS + Leaflet map)
```

## Attribution

Landing-page references cite the IEEE conference paper and news article
that informed parts of this design — see the footer of the homepage for
full citations. Map tiles via OpenStreetMap/CARTO, mapping via Leaflet.js
(both loaded from public CDNs, so an internet connection is needed for the
map to render, even though the app itself runs fully offline otherwise).
