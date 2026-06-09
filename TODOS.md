# TODOS

_Last updated: 2026-06-09_

## Current Focus
v0.3 product redesign — direction locked in `web/DESIGN-v0.3.md`. Pivot from
"render a ranking table" to an **answer-first explanation**: lead with "will my
current plan get worse / what's cheapest for me next 12 months", with every
chart and detail there to raise confidence in that answer. Triggered by
dogfooding energypal.ie (feature-rich but too complex). M1 (answer-first hero +
current-plan selector) and M2 (time-weighted forward projection of announced
hikes) shipped on branch `v0.3-redesign`. Next action: v0.3-M3 (cost breakdown).

## Open Questions / Blockers
- Retention target: one number (rate-only) or two (incl. welcome credit)? (need-by M5; leaning two)
- Authoritative per-supplier CEG solar feed-in rates source? (need-by M7)
- Switch/contract-end date input (anchors the projection window per user, replacing "today") — lands with the ② personalisation block, before/with M6.

## Todo
### v0.3 redesign (per DESIGN-v0.3.md)
- [ ] M3: cost breakdown (simulator exposes per-component split) + expand to PlanDetail drawer
- [ ] M4: "why cheapest" evidence section — cost-weighted usage visual under its claim
- [ ] M5: stay-and-negotiate target (retention back-solve, two targets)
- [ ] M6: switch-timing module (submit-on date + FACT/THIRD_PARTY/advisory labelling)
- [ ] M7: solar export modelling (keep export column, electricity_export.yaml, net revenue, €400 note)
- [ ] M8: help layer — user manual + FAQ

### Carry-over
- [ ] Pin `energy-moneysaver` to GitHub profile (manual step — gh CLI doesn't support)
- [ ] Schema: support "Free Day" plans (BG Smart Weekend, EI Weekender) — energypal's "discounted units" proves the model; fold into M4 evidence thinking
- [ ] Catalogue: SSE 1 Year Smart Weekends Dual Fuel (blocked on Free Day schema)
- [ ] Profiles: source authoritative CRU residential load profile to replace single-household sample
- [ ] Upgrade Vite 5→8 / React 18→19 / Vitest 2→4 cluster (breaking; standalone upgrade)
