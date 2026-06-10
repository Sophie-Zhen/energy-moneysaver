# TODOS

_Last updated: 2026-06-09_

## Current Focus
v0.3 product redesign — direction locked in `web/DESIGN-v0.3.md`. Pivot from
"render a ranking table" to an **answer-first explanation**: lead with "will my
current plan get worse / what's cheapest for me next 12 months", with every
chart and detail there to raise confidence in that answer. Triggered by
dogfooding energypal.ie (feature-rich but too complex). M1 (answer-first hero +
current-plan selector), M2 (time-weighted forward projection of announced
hikes), M3 (cost breakdown current-vs-cheapest + expandable sources), and M4
("why cheapest" usage-shape evidence bar), M5 (stay-and-negotiate target), and
M6 (switch-timing + contract-end date as projection anchor) shipped on branch
`v0.3-redesign`, plus a form-grid reflow fix. Next action: v0.3-M7 (solar).

## Open Questions / Blockers
- Authoritative per-supplier CEG solar feed-in rates source? (need-by M7)

## Todo
### v0.3 redesign (per DESIGN-v0.3.md)
- [ ] M7: solar export modelling (keep export column, electricity_export.yaml, net revenue, €400 note)
- [ ] M8: help layer — user manual + FAQ
- [ ] M9 (after structure done): visual hierarchy / design polish pass — distinguish primary (answer, savings) from secondary (form, ranking, disclosures). Deferred from M3 review (Sophie) to avoid polishing a moving target; run /design-review.

### Carry-over
- [ ] Pin `energy-moneysaver` to GitHub profile (manual step — gh CLI doesn't support)
- [ ] Schema: support "Free Day" plans (BG Smart Weekend, EI Weekender) — energypal's "discounted units" proves the model; fold into M4 evidence thinking
- [ ] Catalogue: SSE 1 Year Smart Weekends Dual Fuel (blocked on Free Day schema)
- [ ] Profiles: source authoritative CRU residential load profile to replace single-household sample
- [ ] Upgrade Vite 5→8 / React 18→19 / Vitest 2→4 cluster (breaking; standalone upgrade)
