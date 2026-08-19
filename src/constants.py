"""Irish energy market constants (Jun 2026)."""

VAT_RESIDENTIAL = 1.09  # 9% VAT on residential energy

# PSO levy: applied per electricity account, regardless of supplier or plan.
# Reference April 2026 bill shows €1.46/month ex VAT.
PSO_LEVY_EUR_PER_MONTH_EX_VAT = 1.46
PSO_LEVY_EUR_PER_MONTH_INC_VAT = PSO_LEVY_EUR_PER_MONTH_EX_VAT * VAT_RESIDENTIAL
ANNUAL_PSO_LEVY_INC_VAT = PSO_LEVY_EUR_PER_MONTH_INC_VAT * 12

# Gas carbon tax: passed through, no supplier discount, identical for all plans.
GAS_CARBON_TAX_EUR_PER_KWH_EX_VAT = 0.01148
GAS_CARBON_TAX_EUR_PER_KWH_INC_VAT = (
    GAS_CARBON_TAX_EUR_PER_KWH_EX_VAT * VAT_RESIDENTIAL
)

# --------------------------- plan availability ---------------------------
# Whether a household can ACTUALLY get onto a plan. This is a different axis
# from `category` (which says what a plan is FOR: a switching offer, a
# post-discount trap, or a discontinued record kept for reproducibility).
#
# It exists because a published rate is not the same thing as an obtainable
# one. Suppliers publish full tariff tables to satisfy CRU transparency rules
# while exposing only a subset in their sign-up flow. Ranking a rate the user
# cannot sign up for produces a recommendation they cannot act on, which is
# worse than not showing it at all.
#
# Default is SELF_SERVE: a plan is assumed obtainable unless we found specific
# evidence otherwise, so this never silently hides plans nobody has checked.
AVAILABILITY_SELF_SERVE = "self_serve"          # sign up online today
AVAILABILITY_AGENT_ONLY = "agent_only"          # published, phone/retention only
AVAILABILITY_UNVERIFIED = "unverified"          # published, route to it unknown
AVAILABILITY_EXISTING_ONLY = "existing_customers_only"

AVAILABILITY_VALUES = (
    AVAILABILITY_SELF_SERVE,
    AVAILABILITY_AGENT_ONLY,
    AVAILABILITY_UNVERIFIED,
    AVAILABILITY_EXISTING_ONLY,
)

# Only SELF_SERVE plans are eligible to be the headline recommendation.
AVAILABILITY_OBTAINABLE = (AVAILABILITY_SELF_SERVE,)

AVAILABILITY_NOTE = {
    AVAILABILITY_AGENT_ONLY:
        "published rate, but not offered in the supplier's online sign-up "
        "flow - you would have to ring them",
    AVAILABILITY_UNVERIFIED:
        "published rate, but we could not confirm a new customer can actually "
        "get it - treat as unavailable until the supplier confirms",
    AVAILABILITY_EXISTING_ONLY:
        "only offered to the supplier's existing customers",
}


# CRU time-of-use band convention.
# Peak applies Mon-Fri 17:00-19:00 only; weekend 17-19 is charged at Day rate.
PEAK_HOUR_START = 17
PEAK_HOUR_END = 19
DAY_RATE_PROBE_HOUR = 16  # used to look up "Day" rate on banded plans
