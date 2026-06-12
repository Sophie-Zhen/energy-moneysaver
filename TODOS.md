# TODOS

_Last updated: 2026-06-12_

## Current Focus
v0.3 product redesign — direction locked in `web/DESIGN-v0.3.md`. Pivot from
"render a ranking table" to an **answer-first explanation**: lead with "will my
current plan get worse / what's cheapest for me next 12 months", with every
chart and detail there to raise confidence in that answer. Triggered by
dogfooding energypal.ie (feature-rich but too complex). M1 (answer-first hero +
current-plan selector), M2 (time-weighted forward projection of announced
hikes), M3 (cost breakdown current-vs-cheapest + expandable sources), and M4
("why cheapest" usage-shape evidence bar), M5 (stay-and-negotiate target), and
M6 (switch-timing + contract-end date as projection anchor), M7 (solar
export modelling — CEG rates in electricity_export.yaml, HDF export parsing,
net credit + €400/€800 tax line, solar toggle), M8 (help layer — new
manual.html "how to read your result" + FAQ), a source-verifiability patch
(show band-level rates, fix dead/indirect source links), and M9 (visual
hierarchy — answer hero as the focal point, supporting sections as uniform
white cards, euro-sunburst logo + tagline) all shipped on branch
`v0.3-redesign`. **v0.3 is structurally complete. Next action: merge → main.**

## Open Questions / Blockers
- M7 export rates: 6 of 7 are THIRD_PARTY (only Energia confirmed on its own
  page). Optional follow-up: confirm the other six on supplier pages → FACT.

## Todo
### v0.3 redesign — COMPLETE (M1–M9 + source-verifiability patch all shipped on `v0.3-redesign`)
Next: merge `v0.3-redesign` → `main`.

### Follow-ups (optional)
- [ ] M7 follow-up: per-supplier official confirmation of the 6 THIRD_PARTY CEG rates; re-verify Yuno after its 2026-07-01 rise to 17.16c

### Carry-over
- [ ] Pin `energy-moneysaver` to GitHub profile (manual step — gh CLI doesn't support)
- [ ] Schema: support "Free Day" plans (BG Smart Weekend, EI Weekender) — energypal's "discounted units" proves the model; fold into M4 evidence thinking
- [ ] Catalogue: SSE 1 Year Smart Weekends Dual Fuel (blocked on Free Day schema)
- [ ] Profiles: source authoritative CRU residential load profile to replace single-household sample
- [ ] Upgrade Vite 5→8 / React 18→19 / Vitest 2→4 cluster (breaking; standalone upgrade)
