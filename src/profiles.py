"""Default residential load profiles, used when the user does not supply
their own ESB Networks HDF export."""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import yaml

_REPO_ROOT = Path(__file__).resolve().parent.parent
PROFILES_DIR = _REPO_ROOT / "tariffs" / "profiles"
DEFAULT_PROFILE_ID = "dublin_2person_mixed"


def load_profile(profile_id: str = DEFAULT_PROFILE_ID) -> tuple[pd.Series, pd.Series, dict]:
    """Return (weekday_hourly, weekend_hourly, ev_unscheduled_share)
    from the named YAML profile."""
    path = PROFILES_DIR / f"{profile_id}.yaml"
    raw = yaml.safe_load(path.read_text())
    weekday = pd.Series({int(k): float(v) for k, v in raw["weekday"].items()})
    weekend = pd.Series({int(k): float(v) for k, v in raw["weekend"].items()})
    ev_share = {int(k): float(v) for k, v in raw.get("ev_unscheduled_hour_share", {}).items()}
    return weekday, weekend, ev_share


def scale_profile_to_annual_kwh(
    weekday: pd.Series,
    weekend: pd.Series,
    target_annual_kwh: float,
) -> tuple[pd.Series, pd.Series]:
    """Scale a profile so its annualised total matches `target_annual_kwh`.

    The default profile is normalised to ~3,777 kWh/year; for a user with
    different annual usage, multiply each hour by the right factor."""
    from .simulator import WEEKDAYS_PER_YEAR, WEEKENDS_PER_YEAR
    current_annual = weekday.sum() * WEEKDAYS_PER_YEAR + weekend.sum() * WEEKENDS_PER_YEAR
    if current_annual == 0:
        return weekday, weekend
    factor = target_annual_kwh / current_annual
    return weekday * factor, weekend * factor
