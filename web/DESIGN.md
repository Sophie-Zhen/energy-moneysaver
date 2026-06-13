# energy-moneysaver web (v0.2) — Design

_Status: draft, 2026-06-07_

This document is the architectural contract for the React + TypeScript web rewrite of `energy-moneysaver`. The existing Python CLI continues to live in `src/`; this document covers only the `web/` subdirectory and what it needs from the rest of the repo.

If you read nothing else, read **Goals & non-goals** and **Verification strategy** — they constrain every other decision.

## 1. Goals & non-goals

### Goals

- **Mainstream usability.** A non-technical Irish electricity consumer can compare plans in their browser without installing Python, conda, YAML, or anything else.
- **Two input modes in one UI.**
  - "I have an ESB Networks HDF export" → upload CSV, get precise per-hour modelling.
  - "I don't" → enter annual kWh and a few checkboxes, get an approximation from the CRU default load profile.
- **Zero PII risk.** Every byte of the user's HDF stays in their browser. No server, no upload endpoint, no telemetry.
- **Single source of truth for catalogue data.** The YAML in `tariffs/` remains authoritative; the web app reads JSON generated from it at build time. The CLI and the web app never drift.
- **Cost-calc parity with the Python CLI.** The TypeScript simulator must reproduce `examples/verify_against_v3.py` numbers within €1 on every benchmark combo.

### Non-goals (v0.2)

- **No accounts, login, or stored history.** Stateless web app; refresh = blank slate. Privacy first, complexity later.
- **No backend or server-side compute.** Static site only. Hosted on GitHub Pages, no Render/Fly/HuggingFace.
- **No native mobile app.** Mobile-responsive web only.
- **No wholesale dynamic plan modelling.** BG Dynamic / Energia Dynamic remain documented but not simulated. Out of user-stated scope.
- **No Free Day plan support yet.** SSE Smart Weekends and similar are deferred until the underlying schema work is done.
- **No i18n.** Irish English only for v0.2. Chinese localisation is a v0.3 candidate.
- **No charts library yet.** First M4 pass uses HTML/CSS visuals only.

## 2. Target users & flows

| User                                                    | Mode | Path                                                                                                       |
| ------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| Smart-meter owner who exported HDF                      | A    | Upload CSV → set EV/gas/dual-fuel flags → see ranking → drill into per-plan breakdown.                     |
| Smart-meter owner who has not exported HDF              | B    | Enter annual kWh estimate + flags → see ranking with "approximate" badge → optionally upload HDF to refine. |
| Pre-smart-meter household (Day/Night meter or standard) | B    | Same as above, with meter-type select that filters compatible plans.                                       |

Both flows feed the same simulator. The only difference is the source of `weekdayHourly` / `weekendHourly` series.

## 3. Architecture overview

```
+-------------------+        +----------------------+        +-----------+
| build step        |        | static assets        |        | browser   |
| YAML → tariffs.json|  -->  | tariffs.json         |  -->   | React app |
| (Node, vite plugin)|       | profiles.json        |        | simulator |
+-------------------+        | index.html, JS bundle|        | (TS, WASM- |
                             +----------------------+        |  free)    |
                                                             +-----------+
```

- Static SPA, served from GitHub Pages out of `web/dist/` (or a `docs/` directory at repo root, decided in §11).
- All compute (HDF parsing, cost calculation, ranking) runs in the user's browser.
- No network requests after the initial page + assets load. (Caveat: GitHub Pages may serve fonts from a CDN; we minimise.)

## 4. Tech stack

| Concern         | Choice                       | Reason                                                                                                             |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Language        | TypeScript (strict)          | Catalogue plan shapes are unforgiving; static types catch field-rename regressions the Python smoke tests can't.   |
| Build           | Vite                         | De-facto modern default. Fast HMR, low config, native TS support.                                                  |
| UI framework    | React 18 (functional + hooks) | Job-market value in Irish tech; largest community resources.                                                       |
| State           | React `useState` / `useReducer` | The whole computed state fits in one reducer. No Redux, Zustand, etc., for v0.2.                                  |
| Styling         | TBD — see §11                | Tailwind, CSS Modules, or vanilla CSS. Postponed to M4 when actual layout work begins.                              |
| CSV parsing     | Papa Parse                   | ~50 KB, battle-tested, streaming-capable. Rolling our own buys nothing.                                            |
| YAML → JSON     | `js-yaml` in a build script  | Same parser semantics as PyYAML for the subset we use.                                                              |
| Unit tests      | Vitest                       | Vite-native; same dev server. Runs in CI.                                                                          |
| Hosting         | GitHub Pages                 | Already enabled for `data_guide.html`. Free, no ops.                                                                |
| CI              | GitHub Actions               | Extend the existing `ci.yml`: run `pytest` AND `npm test` in the same workflow.                                     |

## 5. Type model

The full type surface lives in `web/src/types.ts`. Key shapes:

```typescript
type ConfidenceLevel = "FACT" | "BONKERS" | "THIRD_PARTY" | "GUESS";

type RateBand = {
  hours: [number, number];   // [lo, hi) — same as Python convention
  rate_cpkwh: number;
  label: string;
};

type ElectricityPlan = {
  id: string;
  supplier: string;
  label: string;
  category: "new_customer_offer" | "post_hike_standard" | "discontinued";
  meter_type: "smart" | "day_night" | "standard_24hr";
  kind: "flat" | "bands";
  rate_cpkwh?: number;             // present iff kind === "flat"
  bands?: RateBand[];              // present iff kind === "bands"
  standing_eur_per_year: number;
  welcome_credit_eur: number;
  discount_pct: number;
  requires_dual_fuel: boolean;
  requires_ev: boolean;
  source: { url: string; verified_on: string; confidence: ConfidenceLevel };
};

type GasPlan = {
  id: string;
  supplier: string;
  label: string;
  category: "new_customer_offer" | "post_hike_standard" | "discontinued";
  rate_cpkwh: number;              // inc VAT, ex carbon tax (added by simulator)
  standing_eur_per_year: number;
  welcome_credit_eur: number;
  discount_pct: number;
  requires_dual_fuel: boolean;
  requires_dual_fuel_with: string[] | null;
  source: { url: string; verified_on: string; confidence: ConfidenceLevel };
};

type HourlySeries = number[];      // length 24, index = hour, value = kWh/day at that hour

type HouseholdInputs = {
  mode: "hdf" | "form";
  weekdayHourly: HourlySeries;
  weekendHourly: HourlySeries;
  annualGasKwh: number;
  evAnnualKwh: number;
  evDistribution: Record<number, number>;   // hour → share of EV kWh
};

type Combo = {
  electricity: ElectricityPlan;
  gas: GasPlan | null;             // null for electricity-only customers
  label: string;
};

type ComboResult = {
  combo: Combo;
  annualCostNowEur: number;        // EV charging at user's current habits
  annualCostShiftedEur: number;    // EV scheduled to plan's cheapest band
  savingsVsBaselineEur: number;    // computed by ranking, not simulator
};
```

`HouseholdInputs` is the same shape regardless of which mode the user picked. Form mode just builds the series from the default profile.

## 6. Module structure

```
web/
  DESIGN.md                  ← this file
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  public/
    tariffs.json             ← built artifact (gitignored)
    profiles.json             ← built artifact (gitignored)
  scripts/
    build-data.ts            ← reads ../tariffs/*.yaml → public/*.json
  src/
    types.ts
    constants.ts             ← port of src/constants.py
    simulator.ts             ← port of src/simulator.py
    tariffLoader.ts          ← port of src/tariff_loader.py
    planner.ts               ← port of src/planner.py
    profiles.ts              ← port of src/profiles.py
    hdfParser.ts             ← new: Papa Parse-based HDF CSV reader
    ui/
      App.tsx                ← root, mode toggle, ranking display
      ConfigForm.tsx         ← form-mode inputs
      HdfUploader.tsx        ← file picker + parser feedback
      RankingTable.tsx       ← results table
      MethodologyDrawer.tsx  ← M4: confidence + source transparency
  tests/
    simulator.parity.test.ts ← reproduces verify_against_v3 combos
    tariffLoader.test.ts
    hdfParser.test.ts
    fixtures/
      sample_hdf.csv         ← small synthetic HDF for unit tests
```

The Python `src/cli.py` has no TS counterpart — the web app (`ui/App.tsx`) is the user-facing report; the CLI is the parity reference and a terminal check.

## 7. Data flow

1. **Page load.** App fetches `/tariffs.json` and `/profiles.json` (built artifacts, ~50 KB each gzipped).
2. **Mode selection.** User picks "HDF" or "form-only" via a top-level toggle.
3. **Input collection.**
   - HDF mode: user uploads `HDF_calckWh_*.csv`. `hdfParser.ts` produces `weekdayHourly` and `weekendHourly` series.
   - Form mode: user enters annual kWh, ticks EV/gas/meter-type boxes. `profiles.ts` scales the default profile to the user's annual kWh.
4. **Combo construction.** `planner.ts` filters `tariffs.electricity` × `tariffs.gas` against user constraints (has-gas, has-EV, meter type, dual-fuel pairings).
5. **Cost calculation.** For each combo, `simulator.annualDualFuelCostEur(...)` returns "now" and "shifted" costs.
6. **Ranking.** Results sorted by `min(now, shifted)`. Baseline (user's current EI plan, or first combo) determines `savingsVsBaseline`.
7. **Display.** `RankingTable.tsx` shows the sorted list with per-plan confidence badges.

No step requires a network call after step 1's asset load.

## 8. Build pipeline

```
npm run build
  └→ vite build
       ├→ runs scripts/build-data.ts (vite plugin)
       │    reads ../tariffs/electricity.yaml, gas.yaml, hikes.yaml, profiles/*.yaml
       │    writes public/tariffs.json, public/profiles.json
       └→ standard Vite TS bundle → dist/
```

`build-data.ts` is the only place YAML semantics need to be replicated. It validates that every plan has the required fields the TS types expect, and fails the build on a missing field. This is the analogue of `test_snapshot_loads_with_required_fields` in `tests/test_smoke.py`.

`npm run dev` skips the YAML build only if the JSON artifacts are newer than the YAML — otherwise it rebuilds.

## 9. Verification strategy

The single biggest risk is **silent cost-calc drift** between the Python CLI (tested against Sophie's real HDF in `verify_against_v3.py`) and the TypeScript port. Three layers of defence:

### Layer 1 — TS unit tests (Vitest, runs on every PR)

- One test per ported function: `rateForHour`, `rateForHourAware`, `cheapestBandEvDistribution`, `annualElectricityCostEur`, `annualGasCostEur`, `annualDualFuelCostEur`.
- Each test uses small hand-crafted plans with hand-computed expected values.

### Layer 2 — Parity snapshot test

- A fixture file `tests/parity-fixtures.json` is generated **once** by a Python script that runs `verify_against_v3` against a small synthetic HDF (committed to the repo, not Sophie's real one).
- `simulator.parity.test.ts` reads the same synthetic HDF, runs the TS simulator, and asserts every output is within €0.01 of the Python output.
- Regenerating the fixture is a one-line script and a deliberate act (not automatic).

### Layer 3 — Manual end-to-end before each release

- Run the Python CLI on Sophie's real HDF with a known config → save report.
- Open the web app, enter same inputs → eyeball-compare rankings and top-5 numbers.
- This is the only check against Sophie's real data; never automated, never committed.

CI runs Layers 1 + 2 on every push. Layer 3 is a release-checklist item.

## 10. Milestones

Each milestone ends with one deployable artifact and one verify step. No "almost done" milestones.

### M1 — Scaffold + single-plan verification (~1 week)

- Vite + React + TS skeleton in `web/`.
- One hand-typed plan (`bg_smart_standard_dual_fuel_2026q2`) hardcoded.
- One `annualDualFuelCostEur` call wired to a "Calculate" button.
- Default profile baked into TS as a constant.
- Pages deploy via Actions.
- **Verify:** open the deployed page, click Calculate, see a number within €1 of `python -m src.cli` on the same fixture inputs.

### M2 — Full simulator + ranking + YAML→JSON pipeline (~1 week)

- All of `constants.ts`, `simulator.ts`, `tariffLoader.ts`, `planner.ts`, `profiles.ts` ported.
- `scripts/build-data.ts` running in Vite.
- Form-only UI: annual kWh, EV checkbox, gas checkbox, meter-type select.
- Ranking table renders sorted combos.
- **Verify:** Vitest parity test passes 13/13 combos within €1 against the Python fixture; deployed page renders a usable ranking.

### M3 — HDF upload mode (~1 week)

- `hdfParser.ts` reads ESB Networks CSV via Papa Parse.
- UI toggle: "I have HDF" / "I don't have HDF".
- HDF mode produces the same `HouseholdInputs` shape as form mode.
- Error states: malformed CSV, missing columns, post-EV-only data, etc.
- **Verify:** upload Sophie's real HDF (locally, off the record); rankings match the Python CLI output for the same plan set.

### M4 — UI polish, mobile, methodology (~1 week)

- Layout pass: ranking table styled, savings vs baseline highlighted.
- Methodology drawer: per-plan source link, confidence badge, "what's modelled, what's not" copy.
- Mobile-responsive (test on iPhone Safari + Android Chrome).
- README + repo Pages link updated to point at the live app.
- **Verify:** open on a phone, complete form mode, see ranking; no horizontal scroll, no tap-target smaller than 44 px.

## 11. Open questions (decide before the milestone that needs them)

| Question                                                              | Need-by | Notes                                                                              |
| --------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| Styling: Tailwind, CSS Modules, or vanilla CSS?                       | M4      | Tailwind = fastest velocity; vanilla = smallest bundle; CSS Modules = middle ground.|
| GitHub Pages root: `/docs/` at repo root, or `gh-pages` branch?       | M1      | `/docs/` keeps everything in `main`; `gh-pages` keeps the source repo clean.       |
| Should the form-mode default profile be CRU-published or our sample?   | M2      | Currently `tariffs/profiles/dublin_2person_mixed.yaml` is a single-household sample.|
| Persist user inputs between visits (localStorage)?                    | M3      | Convenience vs the "stateless, refresh-resets" privacy stance. Default: no.        |
| Do we expose plan source URLs as outbound links from the ranking table? | M4      | Useful for transparency; trade-off is page becoming a link farm.                    |
| Telemetry / analytics?                                                 | M4      | Default: none. Reconsider after launch if there's demand for usage stats.           |

## 12. What this design does not cover

- Detailed React component contracts (props, state shapes) — deferred to per-component PRs.
- Exact CSS class names or design tokens — deferred to M4.
- Marketing copy, landing page text — written when M4 demands it.
- Future "Free Day" plan support, dynamic wholesale plans, Northern Ireland market — out of v0.2 scope.

---

## Appendix A — Why TypeScript, not Pyodide

Pyodide would let us reuse the Python code unchanged. We're not doing that because:

1. Initial bundle weight: Pyodide is ~10 MB minified; a TS port is ~50 KB.
2. Portfolio value: TypeScript is a high-signal skill for the Irish tech market; Pyodide is not.
3. Long-term clarity: two codebases (Python CLI + TS web) with a parity contract is more maintainable than one Python codebase running in two environments where browser quirks can surface in subtle ways.

The trade-off is duplicated implementation effort. The verification strategy (§9) is the price we pay for that.

## Appendix B — Why no backend

Three reasons, ranked by importance:

1. **Privacy.** ESB Networks HDF files are PII. Touching them on a server creates a data-handling surface we don't want.
2. **Cost.** A static site costs €0/month. Any persistent backend costs at least the operator's attention.
3. **Speed of iteration.** No deploys, no migrations, no database — every commit is the whole app.

If a feature ever needs a backend (e.g. shared comparisons, cross-device sync), revisit. Until then, browser-only.
