# TODOS

_Last updated: 2026-06-08_

## Current Focus
M2 web rewrite shipped (TS simulator + form-mode ranking UI, 592/592 parity tests pass). Next: M3 — HDF CSV upload mode for high-accuracy users.

## Open Questions / Blockers
- Web app Pages deploy: serve from `/docs/` subdir on main vs a `gh-pages` branch? (Decide before/during M3.)
- Promote v0.2 outside (Reddit r/ireland, HN) or stay quiet until catalogue is more complete?

## Todo
- [ ] Pin `energy-moneysaver` to GitHub profile (manual step — gh CLI doesn't support)
- [ ] M3: HDF CSV upload mode (Papa Parse + File API, parity with verify_against_v3)
- [ ] M4: UI polish, mobile-responsive, methodology drawer
- [ ] Catalogue: SSE 1 Year Smart Weekends Dual Fuel (blocked on Free Day schema)
- [ ] Schema: support "Free Day" plans (BG Smart Weekend, EI Weekender) — deferred until after web v0.2
- [ ] Profiles: source authoritative CRU residential load profile to replace single-household sample
- [ ] Upgrade Vite 5→8 / React 18→19 / Vitest 2→4 cluster (breaking; defer until after M4)
