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

# CRU time-of-use band convention.
# Peak applies Mon-Fri 17:00-19:00 only; weekend 17-19 is charged at Day rate.
PEAK_HOUR_START = 17
PEAK_HOUR_END = 19
DAY_RATE_PROBE_HOUR = 16  # used to look up "Day" rate on banded plans
