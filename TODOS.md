# TODOS

_Last updated: 2026-06-05_

## Current Focus
v0 shipped to GitHub. Next: GitHub housekeeping (description, topics, Pages) and catalogue gaps surfaced during the v0 browse session.

## Open Questions / Blockers
- Enable GitHub Pages to host `data_guide.html` publicly? (vs. read it from the README link only)
- Promote v0 outside (Reddit r/ireland, HN) or stay quiet until catalogue is more complete?

## Todo
- [ ] Add repo description + topics on GitHub (`ireland`, `energy`, `electricity`, `python`, `cli`)
- [ ] Enable GitHub Pages serving `data_guide.html`
- [ ] Pin `energy-moneysaver` to GitHub profile
- [ ] Catalogue: EI standalone gas (no dual-fuel discount tier)
- [ ] Catalogue: SSE 1 Year Smart Weekends Dual Fuel (from PDF tariff sheet)
- [ ] Catalogue: Energia Day/Night Meter + Dynamic plans
- [ ] Catalogue: Pinergy current plans (replace selectra-sourced data, verify FACT)
- [ ] Schema: support "Free Day" plans (BG Smart Weekend, EI Weekender)
- [ ] Schema: support wholesale-pass-through plans (Energia / BG Dynamic)
- [ ] Profiles: source authoritative CRU residential load profile to replace single-household sample
- [ ] CI: GitHub Actions running `verify_against_v3` on every PR
- [ ] Docs: CONTRIBUTING.md with PR template for new tariff data
- [ ] Upgrade Vite 5→8 / React 18→19 / Vitest 2→4 cluster (breaking; defer until after M4)
