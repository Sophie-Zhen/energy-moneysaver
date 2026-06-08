# energy-moneysaver

Compare Irish electricity and gas plans against your actual usage. Outputs a
self-contained HTML report ranking dual-fuel and single-fuel options by total
annual cost, factoring in time-of-use bands, announced price hikes, welcome
credits, and standing charges.

Built for households on smart meters (MCC12), with Day/Night meter support
added in v0.2.

## Try it online

**→ [sophie-zhen.github.io/energy-moneysaver](https://sophie-zhen.github.io/energy-moneysaver/)**

The web app runs entirely in your browser. Upload your ESB Networks HDF
half-hour CSV for high-accuracy modelling, or pick form mode and enter your
annual kWh. Your file never leaves your device.

Not sure where to find your inputs? See the
[data guide](https://sophie-zhen.github.io/energy-moneysaver/data_guide.html).

## Why this exists

Irish comparison sites (bonkers.ie, switcher.ie) are commission-driven and
silently exclude any supplier they cannot directly sign you up to (notably
Energia and Flogas). This tool runs the same maths on the **full big-six
market** snapshot and uses **your actual usage data** instead of bonkers'
default consumption profile.

## What it does

1. Read your inputs from a YAML config: annual electricity kWh, annual gas
   kWh, smart-meter type, current supplier and plan, EV details if any.
2. Optional: ingest an ESB Networks half-hourly data (HDF) CSV for accurate
   time-of-use cost modelling. Without it, the tool uses the SEAI residential
   standard load profile (see `docs/profile_source.md`).
3. Apply each plan's rates against your usage, handling:
   - CRU time-of-use bands (Peak applies Mon-Fri 17:00-19:00 only)
   - Announced price hikes (`tariffs/hikes.yaml`)
   - Plan-specific requirements (dual-fuel-only discounts, EV bands, etc.)
4. Generate an HTML report with rankings, methodology notes, and source links.

## Quick start

```bash
git clone https://github.com/<you>/energy-moneysaver.git
cd energy-moneysaver

# Create a dedicated conda environment (recommended)
conda create -n energy-moneysaver python=3.12 -y
conda activate energy-moneysaver
pip install -r requirements.txt

# Configure your household
cp example_config.yaml my_config.yaml
# Open data_guide.html in your browser for help finding each input
# Edit my_config.yaml with your numbers

# Run
python -m src.cli --config my_config.yaml --output report.html
open report.html

# Optional: terminal-only output (no HTML)
python -m src.cli --config my_config.yaml --text-only
```

## Tariff data

All plan rates live in `tariffs/electricity.yaml` and `tariffs/gas.yaml`,
each labelled with a `verified_on` date and a `source` URL. Announced hikes
are tracked separately in `tariffs/hikes.yaml`.

When you run the tool it prints a staleness warning if the snapshot is older
than 60 days (yellow) or 120 days (red). See `tariffs/METADATA.md` for the
update procedure.

## Contributing

Found a wrong rate, a new plan, or a hike announcement? Open a PR against the
relevant YAML file with the source URL. See `tariffs/METADATA.md` for the
required fields.

## Status

v0.2 shipped:
- [x] CLI tool with HTML report generator
- [x] 32 electricity + 16 gas plans across EI, BG, Energia, SSE, Flogas, Yuno, Pinergy
- [x] Smart meter + Day/Night meter support
- [x] Web app at [sophie-zhen.github.io/energy-moneysaver](https://sophie-zhen.github.io/energy-moneysaver/)
      with HDF upload and form mode (TS port of the simulator, parity-tested
      against the Python reference)

Roadmap:
- v0.3: "Free Day" plan support (SSE Smart Weekends, BG Smart Weekend, EI
  Weekender), authoritative CRU residential load profile, smaller suppliers

## License

MIT. See [LICENSE](LICENSE).
