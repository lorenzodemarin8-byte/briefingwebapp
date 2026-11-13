# Lido mBriefing EFB - Architecture Notes

### 1. File Structure & Script Load Order (`index.html`)
- `css/style.css?v=61`: Lido mBriefing iPadOS design system (Light/Dark mode, tabular-nums).
- Scripts (classic `<script src="...">`, no ES modules):
  1. `js/storage.js`: LocalStorage wrapper (`mbriefing_flights`, `mbriefing_theme`).
  2. `js/simbrief.js`: SimBrief API fetcher and flight ID extraction.
  3. `js/utils.js`: Shared formatting (dates, times, METAR), toasts, notifications, theme.
  4. `js/fuel-engine.js`: Reactive fuel calculations, 8 Lido limit checks, bottlenecks (`LAND`/`TOW`/`TANK`).
  5. `js/myflights.js`: Flights grid (auto-fill 310px), Listed/Submitted tabs, flight card & delete modal.
  6. `js/dashboard.js`: Dashboard UI, VATSIM A-CDM polling, route, weather, signature/submit logic.
  7. `js/briefing.js`: Briefing sidebar, General, Fuel UI, MEL/CDL, ATC, Dispatch, WX/Runway wind/NOTAM.
  8. `js/journeylog.js`: Journey log OOOI times, fuel records, crew assignment and delay reporting.
  9. `js/navlog.js`: NavLog waypoints, dynamic fuel bar (FINRES / TOTAL / LANDING), live AFOB deltas.
  10. `js/app.js`: Hash router (`#/home`, `#/flight/<id>`), drawer interactions and bootstrap.

### 2. Lido mBriefing Color Palette & Controls
- **Light Theme (`:root`)**: App Bg `#eaedf1` | Bars `#e4e7ec` (border `#cfd5dd`) | Cards `#ffffff` (border `#d8dde3`, r=8px, shadow `0 1px 2px rgba(0,0,0,0.04)`) | Bands `#eef1f5` | Briefing Active Item `#5b82b4`.
- **Dark Theme (`[data-theme="dark"]`)**: App Bg `#181b1f` (no pure `#000`) | Bars `#1f2328` (border `#2e333b`) | Cards `#23272d` (border `#32373f`, r=8px) | Bands `#2b3038`.
- **Segmented Controls**: Container `#e2e6ec` (Dark: `#1b1e23`, r=6px, p=2px), Active Tab `#ffffff` (Dark: `#3e444e`, text `#fff`, shadow `0 1px 2px rgba(0,0,0,0.08)`).
- **Typography**: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;` with `font-variant-numeric: tabular-nums;` on all numbers, tables, weights, fuel and times.

### 3. LocalStorage `flight` Schema (`mbriefing_flights[id]`)
```json
{
  "raw": { /* SimBrief XML/JSON parsed object (origin, destination, general, atc, fuel, times, weights, navlog, etc.) */ },
  "fetchedAt": 1731530000000,
  "state": {
    "accepted": true,
    "submitted": false,
    "submittedAt": 1731535000000,
    "fuelState": { "altnIndex": 0, "discFuel": "500", "discReason": "WX DEV", "blockFuel": "7200", "fuelOrdered": true },
    "actualWeights": { "load": "14500", "zfw": "54200", "tow": "61400", "lw": "56300" },
    "flaggedNotams": ["A1234/26"],
    "navlogActuals": { "TOP": { "time": "21:35", "afob": "6900" } },
    "journeyLog": { "times": { "actOut": "21:15", "actOff": "21:28", "actOn": "22:42", "actIn": "22:47" }, "fuel": { "actRamp": "7200", "actTkof": "7050", "actLnd": "4200", "actIn": "4150" }, "delays": [] }
  }
}
```
