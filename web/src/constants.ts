// Irish energy market constants (Jun 2026). Mirrors src/constants.py exactly.

export const VAT_RESIDENTIAL = 1.09;

export const PSO_LEVY_EUR_PER_MONTH_EX_VAT = 1.46;
export const PSO_LEVY_EUR_PER_MONTH_INC_VAT =
  PSO_LEVY_EUR_PER_MONTH_EX_VAT * VAT_RESIDENTIAL;
export const ANNUAL_PSO_LEVY_INC_VAT = PSO_LEVY_EUR_PER_MONTH_INC_VAT * 12;

export const GAS_CARBON_TAX_EUR_PER_KWH_EX_VAT = 0.01148;
export const GAS_CARBON_TAX_EUR_PER_KWH_INC_VAT =
  GAS_CARBON_TAX_EUR_PER_KWH_EX_VAT * VAT_RESIDENTIAL;

// CRU time-of-use band convention. Peak applies Mon-Fri 17:00-19:00 only;
// weekend 17-19 is charged at Day rate.
export const PEAK_HOUR_START = 17;
export const PEAK_HOUR_END = 19;
export const DAY_RATE_PROBE_HOUR = 16;

export const WEEKDAYS_PER_YEAR = (365 * 5) / 7;
export const WEEKENDS_PER_YEAR = (365 * 2) / 7;
