# Contributing

Thanks for taking a look. The single most useful contribution is **fresh tariff data** — even a one-line `verified_on` bump tells the next user that the rate they're seeing is still correct.

This guide is written for tariff-data contributors first. Code changes are covered briefly at the end.

## Why tariff data matters

Irish suppliers change rates frequently: discounted welcome offers expire, standing charges drift, dual-fuel discount tiers get rejigged. A comparison tool with stale data is worse than no tool — it confidently recommends the wrong plan. Every plan in this repo carries a `verified_on` date and a `confidence` level so the user (and the simulator's staleness check) can tell freshness at a glance.

We track each plan's provenance in 4 tiers, in order of trust:

| Confidence    | Source                                            | When to use                                              |
|---------------|---------------------------------------------------|----------------------------------------------------------|
| `FACT`        | Supplier's own PDF tariff sheet or HTML rate page | Default for any direct supplier source                   |
| `BONKERS`     | bonkers.ie plan detail page                       | When the supplier hides the rate behind a quote form     |
| `THIRD_PARTY` | selectra.ie or similar aggregator                 | When neither supplier nor bonkers has it published       |
| `GUESS`       | Forum post, screenshot, customer report           | Last resort — always file an issue to get it verified    |

If you can move a plan up a tier (e.g. find the PDF that backs a `THIRD_PARTY` entry), that's a great PR.

## Quickstart: refresh an existing plan

The simplest contribution is updating `verified_on` after re-checking a rate.

1. Open `tariffs/electricity.yaml` or `tariffs/gas.yaml`.
2. Find the plan, follow its `source.url`, confirm the rate / standing charge / discount still match.
3. If everything matches: bump `verified_on` to today's ISO date (`YYYY-MM-DD`).
4. If something changed: update the changed fields, bump `verified_on`, and **update `confidence`** if the source tier shifted.
5. Run the smoke tests (`pytest tests/`) and open a PR.

A PR title like `Refresh Electric Ireland Home Dual+ SST (Jun 2026)` is plenty.

## Adding a new plan

Each plan is a YAML record in the appropriate file. Here's the minimum-viable electricity plan, with every required field:

```yaml
- id: ei_home_electric_saver_28pc                  # snake_case, unique, includes supplier + plan + quarter or discount
  supplier: Electric Ireland                       # human-readable
  label: Home Electric+ Saver (24hr) with 28% new-customer discount
  category: new_customer_offer                     # see "Categories" below
  meter_type: smart                                # smart | standard | nightsaver
  requires_dual_fuel: false                        # if discount only unlocks with gas bundle
  requires_ev: false                               # if plan is gated to EV owners
  contract_months: 12
  discount_pct: 28
  discount_duration_months: 12
  welcome_credit_eur: 0
  exit_fee_eur: 50
  rates_inc_vat:
    kind: flat                                     # flat | bands
    rate_cpkwh: 24.497                             # c/kWh INCLUDING 9% residential VAT
  standing_eur_per_year: 250.846                   # €/year INCLUDING VAT, ex PSO levy
  source:
    url: electricireland.ie/switch/new-customer/price-plans-bundles
    verified_on: 2026-06-03
    confidence: FACT
```

A banded (time-of-use) plan replaces `rates_inc_vat` with a list of bands:

```yaml
  rates_inc_vat:
    kind: bands
    bands:
      - {hours: [17, 19], rate_cpkwh: 36.14, label: Peak}
      - {hours: [23, 24], rate_cpkwh: 17.80, label: Night}
      - {hours: [0, 8],   rate_cpkwh: 17.80, label: Night}
      - {hours: [8, 17],  rate_cpkwh: 33.88, label: Day}
      - {hours: [19, 23], rate_cpkwh: 33.88, label: Day}
```

Hour ranges are `[lo, hi)` (lo inclusive, hi exclusive). Bands must cover all 24 hours with no gaps or overlaps. The CRU Peak band (Mon-Fri 17:00-19:00) is enforced in the simulator — weekend 17-19 falls back to the Day rate.

Gas plans use a flatter schema — see `tariffs/gas.yaml` for the canonical shape.

### Categories

- `new_customer_offer` — discounted welcome rate, the kind a switcher would actually take. Default for anything you'd recommend.
- `post_hike_standard` — what the plan reverts to after the welcome discount expires (the "do nothing" trap).
- `discontinued` — kept for traceability so old reports remain reproducible. Don't add new entries here unless removing an existing one.

### What NOT to include in rates

The simulator already handles these — keep them out of your numbers:

- **PSO levy** (€1.46/month ex VAT). Added per electricity account.
- **Carbon tax on gas** (~1.25 c/kWh inc VAT). Added per kWh of gas.
- **VAT itself** is *included* in every rate you write (the suffix `_inc_vat` is a reminder).

### Dual-fuel discount tiers

Many gas plans offer different discounts depending on the paired electricity plan. Each tier is a **separate plan** with `requires_dual_fuel_with` listing which electricity plan ids unlock it. See `bg_gas_21pc_with_nonev_smart_plans` vs `bg_gas_15pc_with_ev_smart` for a worked example.

## Verifying your change locally

```bash
# One-time: create the conda env
conda create -n energy-moneysaver python=3.11 -y
conda activate energy-moneysaver
pip install -r requirements.txt -r requirements-dev.txt

# Every PR:
pytest tests/ -v
```

The smoke tests check:

- All modules import.
- Every plan in the YAML has its required fields.
- A representative dual-fuel cost calc returns a sane number.

If a smoke test fails after your change, you likely dropped a required field or mistyped `kind`. The error message names the offending plan.

**Optional, deeper check:** if you have your own ESB Networks HDF half-hour export, you can run `examples/verify_against_v3.py` with `VERIFY_HDF_PATH` pointing at it. This is the reference-numbers regression suite — it won't pass on someone else's HDF, but you can edit the expected values to your own numbers and use it as your personal regression check across YAML edits.

## Pull request checklist

Before opening a PR with tariff data changes:

- [ ] Every changed plan has `source.url` filled in.
- [ ] `source.verified_on` is today's date (`YYYY-MM-DD`).
- [ ] `source.confidence` honestly reflects where the data came from.
- [ ] Rates are c/kWh **including** 9% residential VAT.
- [ ] Standing charges are €/year **including** VAT, **excluding** PSO levy.
- [ ] `pytest tests/` passes.
- [ ] PR description names the supplier and what changed in one line.

If you found a discount tier or hidden cost we missed, mention it in the PR body — those nuances are the most valuable thing here, and they tend to be invisible from the YAML diff alone.

## Code changes

For non-trivial code changes (new simulator logic, schema fields, output formats), please open an issue first to discuss the approach. Smaller fixes (bug fixes, typo corrections, test additions) are welcome as direct PRs.

Style guidance:

- Match the existing style; surgical diffs over refactors.
- No new dependencies without discussion — the lean install (`pandas`, `PyYAML`) is intentional.
- Tests should run without network access and without a real HDF.

## Reporting bad data without a PR

If you don't have time for a PR but spot a stale rate, please open an issue with:

- The plan id (e.g. `bg_smart_standard_dual_fuel_2026q2`).
- What you think the current rate is.
- Where you got it (link or screenshot is fine).

That's enough for someone else to land the PR.
