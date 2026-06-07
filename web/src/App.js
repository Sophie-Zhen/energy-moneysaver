import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { annualDualFuelCostEur } from "./simulator";
import { BG_SMART_STANDARD, BG_GAS_21PC } from "./fixturePlans";
import { DEFAULT_WEEKDAY_HOURLY_3500KWH, DEFAULT_WEEKEND_HOURLY_3500KWH, } from "./fixtureProfile";
export function App() {
    const [annualGasKwh, setAnnualGasKwh] = useState(12_000);
    const [result, setResult] = useState(null);
    const handleCalculate = () => {
        const cost = annualDualFuelCostEur({
            weekdayHourly: DEFAULT_WEEKDAY_HOURLY_3500KWH,
            weekendHourly: DEFAULT_WEEKEND_HOURLY_3500KWH,
            elecPlan: BG_SMART_STANDARD,
            gasPlan: BG_GAS_21PC,
            gasAnnualKwh: annualGasKwh,
            evAnnualKwh: 0,
        });
        setResult(cost);
    };
    return (_jsxs("main", { children: [_jsx("h1", { children: "energy-moneysaver \u2014 M1 verification" }), _jsxs("p", { className: "muted", children: ["Hardcoded combo: ", _jsx("strong", { children: "BG Smart Standard Dual Fuel + Gas 21% off" }), ", no EV, default profile scaled to 3,500 kWh electricity."] }), _jsxs("label", { className: "field", children: ["Annual gas kWh:", _jsx("input", { type: "number", value: annualGasKwh, onChange: (e) => setAnnualGasKwh(Number(e.target.value)) })] }), _jsx("button", { onClick: handleCalculate, children: "Calculate annual cost" }), result !== null && (_jsxs("div", { className: "result", children: ["Annual dual-fuel cost: ", _jsxs("strong", { children: ["\u20AC", result.toFixed(2)] })] }))] }));
}
