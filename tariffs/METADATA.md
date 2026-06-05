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

Quarterly cadence recommended.

1. For each supplier, browse the official tariff page and compare against the
   YAML. Update any changed rates and set `verified_on` to today.
2. Search Google News for `"<supplier name>" price` filtered to the last 30
   days. Any announced hike with a future effective date goes into
   `hikes.yaml`.
3. Bump the top-level `last_verified` field in each touched file.
4. Run the test suite (when it exists) to confirm the simulator still loads
   every plan.

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
