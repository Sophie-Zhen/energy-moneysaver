// Annual electricity + gas cost simulator. Direct TS port of src/simulator.py.
// Verification: tests/simulator.test.ts asserts parity with the Python output.
import { ANNUAL_PSO_LEVY_INC_VAT, DAY_RATE_PROBE_HOUR, GAS_CARBON_TAX_EUR_PER_KWH_INC_VAT, PEAK_HOUR_END, PEAK_HOUR_START, WEEKDAYS_PER_YEAR, WEEKENDS_PER_YEAR, } from "./constants";
export function rateForHour(plan, hour) {
    if (plan.kind === "flat") {
        if (plan.rate_cpkwh === undefined) {
            throw new Error(`flat plan ${plan.id} missing rate_cpkwh`);
        }
        return plan.rate_cpkwh;
    }
    if (!plan.bands) {
        throw new Error(`banded plan ${plan.id} missing bands`);
    }
    for (const band of plan.bands) {
        const [lo, hi] = band.hours;
        if (lo <= hour && hour < hi)
            return band.rate_cpkwh;
    }
    throw new Error(`No band matches hour ${hour} in plan ${plan.label}`);
}
export function rateForHourAware(plan, hour, isWeekend) {
    if (isWeekend &&
        PEAK_HOUR_START <= hour &&
        hour < PEAK_HOUR_END &&
        plan.kind === "bands") {
        return rateForHour(plan, DAY_RATE_PROBE_HOUR);
    }
    return rateForHour(plan, hour);
}
export function annualElectricityCostEur(input) {
    const { weekdayHourly, weekendHourly, elecPlan, evAnnualKwh, evDistribution = {}, } = input;
    let totalCents = 0;
    for (let hour = 0; hour < 24; hour++) {
        const wdBase = (weekdayHourly[hour] ?? 0) * WEEKDAYS_PER_YEAR;
        const weBase = (weekendHourly[hour] ?? 0) * WEEKENDS_PER_YEAR;
        const evHour = evAnnualKwh * (evDistribution[hour] ?? 0);
        const evWd = (evHour * 5) / 7;
        const evWe = (evHour * 2) / 7;
        totalCents += (wdBase + evWd) * rateForHourAware(elecPlan, hour, false);
        totalCents += (weBase + evWe) * rateForHourAware(elecPlan, hour, true);
    }
    return totalCents / 100;
}
export function annualGasCostEur(plan, annualKwh) {
    const unitEur = plan.rate_cpkwh / 100;
    return (unitEur * annualKwh +
        GAS_CARBON_TAX_EUR_PER_KWH_INC_VAT * annualKwh +
        plan.standing_eur_per_year -
        plan.welcome_credit_eur);
}
export function annualDualFuelCostEur(input) {
    const elecUnits = annualElectricityCostEur(input);
    const elecOverhead = input.elecPlan.standing_eur_per_year +
        ANNUAL_PSO_LEVY_INC_VAT -
        input.elecPlan.welcome_credit_eur;
    const gas = annualGasCostEur(input.gasPlan, input.gasAnnualKwh);
    return elecUnits + elecOverhead + gas;
}
