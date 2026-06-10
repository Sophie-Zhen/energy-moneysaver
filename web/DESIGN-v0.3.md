# energy-moneysaver web (v0.3) — Product redesign

_Status: draft, 2026-06-09_

This document supersedes `DESIGN.md` for **product/UX direction only**. The v0.2
architecture (build pipeline, simulator parity, privacy stance, tech stack) in
`DESIGN.md` still holds — read it for the engineering contract. This doc covers
*what the app should say to the user and in what order*, which v0.2 never
specified beyond "render a ranking table".

The trigger for this rewrite: dogfooding the closest comparable tool
([energypal.ie](https://energypal.ie/)) and concluding it is **too complex to
use** despite being feature-rich. Our edge is not more features. It is a
trustworthy, personalised *answer* that the user understands well enough to act
on.

## 1. North star

**The job is not to compute the cheapest plan. It is to make the user confident
enough in the answer to act on it.**

Two consequences that constrain everything below:

1. **Optimise the user's cost, not switching volume.** Unlike bonkers/switcher
   (commission-driven, want you to switch) we will tell the user to *stay and
   renegotiate* when that wins, and *when* to switch when that wins. The tool
   has no stake in the outcome. This is the whole reason the project exists.
2. **Every chart, number, and expandable detail exists to raise confidence in
   the recommendation — never to show off.** A visualisation earns its place
   only by being the *evidence* for a claim the user is reading right then. No
   chart for its own sake. This extends the standing data rule: facts must be
   accurate, and anything inferred/guessed must be labelled as such, because a
   beautiful tool on bad data is worthless.

## 2. The reframe: an explanation, not a dashboard

energypal hands you a dashboard with three levels of tabs (Electricity/Gas →
Plans/Simulate/Insights → six sub-tabs) and walls of numbers, and leaves you to
assemble the conclusion. That is the failure mode.

We render a single top-to-bottom **explanation** the user reads like a letter:
the answer first, then its justification, then the actions. Detail is
*progressive disclosure of "why we said that"*, not a set of parallel tabs to
navigate.

| energypal (machine-first)            | us (answer-first)                          |
| ------------------------------------ | ------------------------------------------ |
| Dashboard you operate                | Explanation you read                       |
| 6 analyses in tabs, pick one         | The 2–3 things that matter, each with proof |
| kWh everywhere, no €                 | Lead with €; usage shown only as evidence   |
| Heatmap and band-shading are separate| Evidence sits directly under its claim      |
| You configure colour thresholds      | We make every interpretive choice for you   |
| Form-first (5 decisions before value)| Inputs minimal; infer from HDF where we can |

### What energypal genuinely does well (learn, do not copy)

- Intra-day bar chart with ToU-band background shading (Night/Day/Peak). Good
  idea; we apply it as *evidence under a claim*, and in **cost** not kWh.
- "Potentially discounted units" view — quantifies how much usage falls in each
  plan's special window (EV night hours, Free-Day Saturday/Sunday). This is
  prescriptive and it already models Free-Day plans, which we deferred. Worth
  matching in spirit (tie usage to plan structure) but expressed as € saved.
- KPI cards with ✅/‼️ status glyphs are clean and scannable.

### What we will not copy (energypal anti-patterns)

- Three levels of tab nesting.
- User-configurable colour thresholds (we decide).
- Form-first gate before any value is shown.
- Dynamic/wholesale plan modelling — explicitly out of scope (user decision).
- Battery-sizing hardware recommendations — off our comparison core.

## 3. Page structure (one column, read top to bottom)

Legend: ✓ reuse existing · 🔨 partial, restructure · 🆕 new.

### ① Entry — two input modes + data guide  ✓
Keep the current `mode` toggle (`form` | `hdf`) and the data-guide link. Upload
HDF for precision, or enter annual kWh manually. No change to the privacy model.

### ② Confirm what we know about you (personalisation)  🔨
A compact "is this you?" block, not a long form. Fields:
- **Current supplier + plan** 🆕 — required to answer "will mine get worse" and
  to compute the retention target. Picked from the catalogue.
- **Contract end date** 🆕 (optional) — unlocks personalised "your discount
  expires on X" and the switch-timing recommendation. Degrades gracefully: if
  blank, fall back to a generic 12-month projection.
- **Solar?** 🆕 — if yes, export estimate (from HDF export column, or manual).
- **EV?** ✓ — annual EV kWh, and whether it can shift to night.
- **Gas?** ✓ — annual gas kWh, or electricity-only.
- In HDF mode, **infer and pre-fill** what we can (EV from an evening/charging
  spike, solar from the export column) and present as "we detected X — correct?"
  rather than making the user type it. Inference is labelled, never silent.

### ③ The answer (hero)  🆕 — the two questions the user actually has
Big, first thing below inputs. Answers, verbatim, the user's stated concerns:
> **Your plan:** EI Home Electric Saver — projected next 12 months **€1,850**.
> ⚠️ The 1 Jul market hike + your 28 % discount ending make it more expensive.
>
> **Cheapest for you, next 12 months:** Flogas EV Night Charge — **€1,470**.
> You'd save **€380**.

"Savings vs current plan" reuses the existing `savingsVsBaseline` machinery; the
new part is anchoring the baseline to the user's *named current plan* and to a
*forward* 12-month projection (see §4).

### ④ Cost breakdown  🔨
Recommended plan and current plan, side by side, split into: standing charge /
day units / peak units / night units / gas / welcome credit / hike impact. One
glance shows where money goes and where the saving comes from.
> "Want the exact maths?" → expands to the existing **PlanDetail drawer**
> (per-band rates, source URL, FACT/BONKERS/THIRD_PARTY/GUESS badge). ✓ reuse.

Requires the simulator to expose a per-component breakdown, not just a total
(currently returns scalars). 🆕 simulator work.

### ⑤ Why this is cheapest (evidence → confidence)  🆕
One or two visuals, each directly under the claim it proves. Example:
> "Because **64 % of your usage is at night**, night-weighted plans win."
> [usage-by-hour chart, night hours highlighted]

Only the slices relevant to *this* recommendation appear — not six analyses.
Charts are cost-weighted where possible (energypal's are kWh-only). This is the
section that turns "trust me" into "see for yourself".

### 🅰 Stay and negotiate — the target rate  🆕
Because *not switching but still cheap* is the best outcome (no switch hassle, no
exit-fee timing risk):
> "Call EI and ask for at least **32 % off** (≈ 21.5 c/kWh). At or below that,
> staying matches Flogas — and you skip the switch."

Computation: back-solve (binary search) the **discount %** on the current plan's
rates such that its projected annual cost equals the best switch option's. Two
targets shown:
- **match on rate** (ignores the switcher's one-off welcome credit), and
- **match including their sign-up bonus** (a harder target).

Labelled **advisory** — it is the number to aim for in the call, not a promise
the supplier will offer it. Multi-band plans: solve for a uniform discount %
(how Irish retention offers are actually framed); state the assumption.

### 🅱 When and how to switch  🆕
Shown as the second of two action paths (negotiate first, switch if that fails),
which itself signals "switching is the last resort":
> **Submit on 2026-07-03** (day after expiry).
> • Switch before expiry → €50 early-exit fee (**FACT**, EI T&C)
> • Switch on the exact expiry day → some users auto-charged, had to dispute
>   (**THIRD_PARTY**, forum reports)
> • Process ≈ 10–15 working days, but you can waive the 14-day cooling-off to
>   speed it up (**FACT**, regulation)
> • Each day left on the old plan after expiry costs ≈ €2–3 → don't drag it out
> ⚠️ Confirm your exact expiry date in your account first.

The *logic* is generic to every Irish user; only the dates are personal — so
this belongs in the tool, not just one person's case.

### ⑦ Full ranking (demoted, expandable)  ✓
The current ranking table, moved below the answer. People who want every option
scroll to it. Reuse `RankingRow` + `PlanDetail` as-is.

### ⑧ Help layer — user manual + FAQ  🆕
Linked out, not stuffed into the main flow:
- **User manual** — "how this tool works", for first-time users.
- **FAQ** — common questions. May extend the existing `data_guide.html`.

### Layout (chosen): single-column, two-phase

The modules above are arranged in **one vertical column read top to bottom**,
like a letter — not a dashboard with tabs. The logical order ①→⑧ is invariant;
this is how inputs and outputs share the page in space.

The column has **two phases**:

- **Before data:** the input block (① + the ② essentials) is the hero —
  centered, inviting, "Will my plan get worse? What should I switch to?".
  Nothing else competes.
- **After data:** the input block **collapses to a one-line editable summary
  bar** (e.g. `EI Home Electric Saver · 4,200 kWh · EV · gas  [edit]`) and the
  answer (③) takes the hero position. The rest of the column (④⑤🅰🅱⑦⑧)
  flows below.

Why this over a sticky-sidebar or a two-screen wizard:
- Reads as one continuous explanation (serves "clear, efficient reading").
- Least dashboard-like — the opposite of energypal's control-panel feel.
- Mobile-native: one column needs no responsive sidebar collapse.
- The sidebar's "tweak and re-read" benefit is recovered by the inline-editable
  summary bar, without a persistent control panel.

Default expand/collapse for reading efficiency: ③ answer, 🅰 negotiate, 🅱 switch
are **always visible** (answer + actions are the point); ④ exact maths, ⑤ deeper
analysis, ⑦ full ranking are **collapsed by default** (progressive disclosure).
The two action paths 🅰/🅱 sit **side by side on desktop** (a fork: negotiate
first, switch if that fails), **stacked on mobile**.

## 4. New computation required

| Need | Where | Notes |
| ---- | ----- | ----- |
| Forward 12-month projection | planner layer (`hikes.ts`), NOT the simulator | Irish plans are predominantly variable-rate: an announced supplier increase passes through to discounted customers (discount % unchanged, applied to a higher base; fixed-price products have largely been pulled). So apply announced hikes (`tariffs/hikes.yaml`) to pre-hike plans, **time-weighted**: only the share of the 12-month window after the effective date pays the increase. Reference start = today (becomes the user's switch/contract date when that input lands). Skip plans already at post-hike rates (`post_hike_standard`, or `verified_on` past the effective date). Keeps the simulator-parity contract because projection happens before the simulator on raw plans. |
| Current-plan baseline | planner | User names their current plan; project *it* forward to power "your plan will get worse" and savings. |
| Cost breakdown | simulator | Expose per-component split (standing / day / peak / night / gas / credit / hike), not just the scalar total. |
| Retention back-solve | new module | Binary-search discount % on current plan to match best switch cost. Two targets (rate-only, incl. welcome credit). |
| Switch-timing rule | new module + content | Mostly static guidance + the user's expiry date. Output a submit-on date and the labelled reasoning. |
| Solar export | hdfParser + new schema | Stop discarding the "Active Export Interval" column; new `tariffs/electricity_export.yaml` with per-supplier CEG feed-in rates; subtract export revenue from the bill. Flag the €400/yr tax-free export limit. Biggest new piece. |

## 5. Confidence labelling (applies everywhere)

Reuse the existing FACT / BONKERS / THIRD_PARTY / GUESS badge vocabulary, and
extend it to the *advice* surfaces, not just tariff rows:
- Regulation / published T&C (€50 exit fee ends after expiry, cooling-off
  waivable) → **FACT**.
- Forum consensus / individual anecdotes ("switch the day after", "charged on
  expiry day") → **THIRD_PARTY**.
- Retention target rate, switch processing speed in days → **advisory / GUESS**,
  shown as a range with "confirm with your supplier".

The user must always be able to tell what they can bank on from what is a
judgement call. That distinction *is* the confidence the north star is after.

## 6. Milestones

Each ends with one shippable artifact and a verify step. Ordered by value and
dependency; the first increment fixes "too complex" using mostly existing parts.

### v0.3-M1 — Answer-first restructure  (highest value, least new math)
- Add "current supplier + plan" selection to inputs.
- Hero answer card: current plan vs cheapest vs savings.
- Demote the ranking table below the answer.
- **Verify:** load the app, pick a current plan, see a correct savings figure vs
  that plan at the top; ranking still reachable below.

### v0.3-M2 — Forward projection + "your plan will get worse"  ✅ done
- Apply announced hikes to pre-hike variable plans, time-weighted from today
  (only the post-effective-date share of the 12-month window is hiked). EI
  (+8%/+7.7%) and Yuno (+9.5%/+11%) only — no speculative hikes for unannounced
  suppliers. Skips already-post-hike plans. `hikes.ts`, unit-tested.
- Hero flags when the current plan's figure includes the announced increase.
- Deferred to a later milestone (with the personalisation block): a
  contract-end / switch-date input to anchor the projection window per user
  instead of "today".
- **Verify (done):** EI/Yuno plans show higher, time-weighted figures (Yuno
  €2529 → €2733, EI SST → €2851); un-hiked suppliers unchanged; 609/609 tests
  pass; hand-check in `hikes.test.ts`.

### v0.3-M3 — Cost breakdown  ✅ done
- `electricityBreakdown` / `gasBreakdown` split the same totals the scalar
  functions return: night / day / peak (CRU wkdy 17-19) units, standing, PSO,
  gas units, carbon tax, gas standing, welcome credit. Units bucketed into
  CRU-style windows for a comparable split; rate is still the plan's actual
  hourly rate. Simulator scalar functions untouched → parity safe.
- Renders current-vs-cheapest side by side with a per-line "You save" column;
  an expandable "Rates & sources" reuses the PlanDetail drawer.
- **Verify (done):** `breakdown.test.ts` asserts components sum to the scalar
  total within €0.005 for every catalogue plan; 611/611 pass. (Displayed
  per-row integers can visually sum €1 off the total — rounding only; the
  underlying math is exact.)

### v0.3-M4 — "Why cheapest" evidence section  ✅ done
- A night/day/peak bar of the household's electricity usage shape, with an auto
  conclusion linking the dominant band to the recommendation. Pure CSS bar, no
  chart lib. `usageKwhByBand`, unit-tested (sums to annual kWh).
- Deviation from the original "cost-weighted" note: the evidence uses
  **consumption (kWh)** share, not cost. Cost-weighting would price the bar with
  the chosen plan's rates — baking the answer into its own evidence (circular).
  kWh share is the plan-agnostic *cause* ("where you use" → which plan's cheap
  band matters). EV excluded (its schedule would be self-fulfilling).
- Honest in both modes: form mode is labelled "typical profile — upload your HDF
  for your real shape"; HDF mode uses the user's data.
- **Verify (done):** bar segments match the split (Night 33% / Day 60% / Peak
  8% on the default profile); conclusion names the dominant band; 612/612 pass.

### v0.3-M5 — Stay-and-negotiate target
- Retention back-solve module + UI block with two targets.
- **Verify:** plugging the suggested discount into the current plan yields a
  projected cost equal to the best switch cost within €1.

### v0.3-M6 — Switch-timing module
- Timing rule + content, driven by the expiry date.
- **Verify:** with a sample expiry date, the recommended submit date and labelled
  reasons render; labels match the FACT/THIRD_PARTY/advisory split.

### v0.3-M7 — Solar export modelling
- Parser keeps export column; `electricity_export.yaml`; simulator nets export
  revenue; UI gated behind the solar toggle.
- **Verify:** an HDF with export rows lowers the bill by exactly
  Σ(export kWh × feed-in rate); €400 tax-free note shown.

### v0.3-M8 — Help layer
- User manual + FAQ pages, linked from the app.
- **Verify:** a first-time reader can follow the manual end to end without the
  code.

## 7. Open questions (decide before the milestone that needs them)

| Question | Need-by | Notes |
| -------- | ------- | ----- |
| ~~Forward-projection baseline: generic vs contract-expiry-aware?~~ | ~~M2~~ | RESOLVED: Irish plans are variable → announced hikes pass through. Applied time-weighted from today; the switch/contract date becomes the window anchor when that input lands. |
| Retention target: show one number (rate-only) or two (incl. welcome credit)? | M5 | Leaning two — the welcome-credit-inclusive target is the honest one for year 1. |
| Solar feed-in rates: where is the authoritative per-supplier CEG source? | M7 | Needs a catalogue pass like the plan catalogue; CRU + supplier pages. |
| User manual format: extend `data_guide.html` or a new in-app page? | M8 | Lean: extend data_guide for "how to get data", new page for "how to read the answer". |

## 8. Relationship to v0.2 DESIGN.md

Unchanged and still authoritative: tech stack (§4), build pipeline (§8),
verification/parity strategy (§9), privacy/no-backend stance (Appendix B). New
simulator outputs (breakdown, forward projection) must keep the parity contract:
extend the Python reference and the parity fixture in lockstep, never let the TS
and Python diverge.

## 9. Hosting & privacy (decided: no change)

Stay on **GitHub Pages**. Privacy is a property of the *architecture*, not the
host: the HDF is read in-browser via the File API, all compute is client-side,
and there is no endpoint that receives the file — so no static host (GitHub
Pages, Cloudflare Pages, Netlify, Codeberg Pages, …) ever sees the user's data.
They all serve the same static bundle and are equally private. Migrating hosts
would buy zero privacy and cost CI/deploy rework.

The real privacy red lines are app-level, not host-level, and are kept:
1. **No analytics / trackers** (no Google Analytics etc.).
2. **No third-party CDN resources** — self-host fonts so no IP leaks on load.

A privacy-hardening pass (confirm self-hosted fonts, audit for any external
request) is folded into a later milestone, not a host migration.
