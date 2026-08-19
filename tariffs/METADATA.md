# Tariff data — verification and update procedure

## Files

- `electricity.yaml` — every electricity plan, smart meter only for v0
- `gas.yaml` — every gas plan
- `hikes.yaml` — announced price changes with effective dates

## Schema

See `electricity.yaml` / `gas.yaml` / `hikes.yaml` themselves — each file has
a `schema_version` field and inline examples.

Every plan record carries:

- `id`: stable kebab-case identifier (e.g. `bg_ev_smart_dual_fuel_2026q2`)
- `supplier`: official supplier name
- `label`: human-readable plan name as shown on the supplier's website
- `meter_type`: one of `smart`, `day_night`, `standard_24hr`
- `requires_dual_fuel`: true if the listed rate requires also taking the
  supplier's gas plan
- `contract_months`, `discount_pct`, `welcome_credit_eur`, `exit_fee_eur`
- `rates_inc_vat`: either `{kind: flat, rate_cpkwh}` or
  `{kind: bands, bands: [{hours: [lo, hi], rate_cpkwh, label}, ...]}`
- `standing_eur_per_year`
- `source`: `{url, verified_on, confidence}`

## Confidence levels

- `FACT`: rate pulled directly from supplier's official tariff page or a
  customer-specific quote
- `BONKERS`: rate pulled from bonkers.ie plan detail page (which itself
  sources from the supplier)
- `THIRD_PARTY`: rate from a third-party comparison site (selectra,
  saveonheat, etc.) — usually reliable but second-hand
- `GUESS`: estimated from related plan; flagged in the report

## Updating

Quarterly cadence recommended — but see the 2026-08 note below: the June
snapshot had three materially wrong rates within ten weeks, so treat anything
older than ~2 months as unverified rather than merely stale.

1. For each supplier, browse the official tariff page and compare against the
   YAML. Update any changed rates and set `verified_on` to today.
2. Search Google News for `"<supplier name>" price` filtered to the last 30
   days. Any announced hike with a future effective date goes into
   `hikes.yaml`.
3. Bump the top-level `last_verified` field in each touched file.
4. Run the test suite: `pytest tests/` and, in `web/`, `npm test`.
5. Regenerate the golden fixture whenever a rate changes:
   `python web/scripts/gen_parity_fixture.py`, then commit
   `web/tests/fixtures/parity.json`. The required `web` CI check compares the
   TS port against that fixture and will fail on a stale one.
   `web/public/tariffs.json` is gitignored and rebuilt by npm `pretest`.
6. `web/tests/simulator.test.ts` also carries a single HARDCODED Python value.
   If it fails after a tariff edit, take the replacement from the freshly
   generated `parity.json` (scenario `form_3500_elec_12000_gas_no_ev`, plan
   pair `bg_smart_standard_dual_fuel_2026q2` + `bg_gas_21pc_with_nonev_smart_plans`),
   never by copying whatever the TS side printed.

### Scraping notes (learned the hard way, 2026-08-17)

- **Plain HTTP fetching mostly fails.** Electric Ireland, Flogas, SSE and
  Energia's tariff URLs return 404/403 to a non-browser client, and several
  pages render rates only after JS runs. Drive a real browser instead.
- **SSE publishes proper tariff cards as PDFs** at
  `sseairtricity.com/assets/Tariffs/ROI/Current/<CODE>.pdf`; the index of
  current codes is at `/ie/home/help-centre/our-tariffs/current-offers`.
  These are the authoritative source and are worth preferring over its
  product pages.
- **Yuno's rate page is an accordion.** A whole-page text scrape interleaves
  the panels and will pair an electricity table with the wrong gas rate. Walk
  `a.ckeditor-accordion-toggler` → `parentElement.nextElementSibling` per
  panel instead.
- **Cross-check against the supplier's own published EAB** before trusting a
  scrape. For flat and gas tariffs it is exact arithmetic
  (`4200 * rate + standing + PSO`). For time-of-use plans, fit the implied
  CRU load split on two of a supplier's plans and confirm it reproduces a
  third — this caught nothing in Aug 2026, which is the point.

### Watch out for silent discount re-cuts

A supplier changing its *discount tier* moves the real rate just as much as an
announced price hike, but appears nowhere in the news and nowhere in
`hikes.yaml`. Between June and August 2026, with no announcement at all:

- Bord Gáis new-customer dual fuel: 22%/21% → **17%/17%**
- SSE Smart EV Max: 30%/30% → **20%/20%** (the 30/30 card was withdrawn)
- SSE headline dual fuel: 25%/20% → **28%/23%** (moved the other way)
- Energia: withdrew its 27%-elec + 27%-gas bundle, replaced by a 23%/23%
  dual-fuel tier plus a 30% electricity-only tier that forces gas to 10%
- Electric Ireland: dual-fuel gas tier 8.5% → **18%**

So step 1 above must re-read the *discount percentage* too, not just look for
a changed unit rate.

## Snapshot — 2026-08-17 (whole-market refresh)

All six suppliers re-read from their own sites / official tariff cards on
2026-08-17. 42 electricity plans, 23 gas plans. Every rate in the catalogue is
now post-hike as read from the supplier, so `planner.HIKE_APPLICATIONS` is
empty — see the comment there before adding to it.

Also fixed in this pass:

- Yuno's 24hr and Day/Night entries were carrying the **dual-fuel** rate table
  while flagged `requires_dual_fuel: false`. Corrected, and the genuine
  electricity-only rates (34.85c / 38.12c-23.03c) added alongside.
- Energia's 24hr Dual Fuel 25% plan was linked to the 15% gas rate; it pairs
  with the 25% rate (8.45c).
- Pinergy's discontinued EV Drive Time plan was still in
  `CURATED_ELECTRICITY_ONLY`; removed. Pinergy supplies no gas, so its plans
  can only ever appear as a split bundle.
- Flogas EV Night Charge standing charge was an estimate (€376.70, scaled
  +8%); the published figure is €387.16.

Validated end-to-end: the Python CLI's ranking on a real HDF reproduces an
independently written model to the euro across 17 combos, and 1,014 web tests
plus 4 Python tests pass.

## v0 snapshot — 2026-06-03

Built from manual browse of:

- electricireland.ie
- bordgaisenergy.ie
- energia.ie/about-energia/our-tariffs
- sseairtricity.com
- flogas.ie (via bonkers.ie plan detail pages — Flogas's own page returns 404)
- yunoenergy.ie
- bonkers.ie dual-fuel comparison (filter "Available for sign-up" turned off
  to reveal Energia and Flogas)
