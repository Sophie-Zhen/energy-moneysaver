"""Render the comparison results as a self-contained HTML file."""
from __future__ import annotations

from datetime import date
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from . import tariff_loader as tl
from .config import UserConfig
from .constants import (
    ANNUAL_PSO_LEVY_INC_VAT,
    GAS_CARBON_TAX_EUR_PER_KWH_INC_VAT,
)

_REPO_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = _REPO_ROOT / "templates"


def render_html(
    results: list,
    config: UserConfig,
    snapshot: tl.TariffSnapshot,
    baseload_source: str,
    out_path: Path,
) -> None:
    """Write the HTML report.

    `results` is the ordered list of ComboResult objects from cli.main:
    switchable (sorted by cost_shifted_eur ascending), then baseline, then
    do-nothing.
    """
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    template = env.get_template("report.html.j2")

    switchable = [r for r in results
                  if not r.combo.is_baseline and not r.combo.is_do_nothing]
    baseline = next((r for r in results if r.combo.is_baseline), None)
    do_nothing = next((r for r in results if r.combo.is_do_nothing), None)
    top_two = switchable[:2]

    # Staleness — take the worst across the three files.
    levels = [tl.staleness_level(v) for v in snapshot.last_verified.values()]
    order = ["fresh", "warn", "critical"]
    worst = max(levels, key=order.index)

    html = template.render(
        title=config.output.title,
        generated_on=date.today().isoformat(),
        config=config,
        snapshot=snapshot,
        baseload_source=baseload_source,
        switchable_results=switchable,
        top_two=top_two,
        baseline=baseline,
        do_nothing=do_nothing,
        can_schedule=(config.electricity.ev.enabled
                      and config.electricity.ev.can_schedule_charging),
        hikes=snapshot.hikes,
        staleness=worst,
        pso_levy_annual=ANNUAL_PSO_LEVY_INC_VAT,
        gas_carbon_tax_inc_vat=GAS_CARBON_TAX_EUR_PER_KWH_INC_VAT,
    )
    out_path.write_text(html)
