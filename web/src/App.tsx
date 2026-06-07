import { useState } from "react";
import { annualDualFuelCostEur } from "./simulator";
import { BG_SMART_STANDARD, BG_GAS_21PC } from "./fixturePlans";
import {
  DEFAULT_WEEKDAY_HOURLY_3500KWH,
  DEFAULT_WEEKEND_HOURLY_3500KWH,
} from "./fixtureProfile";

export function App() {
  const [annualGasKwh, setAnnualGasKwh] = useState(12_000);
  const [result, setResult] = useState<number | null>(null);

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

  return (
    <main>
      <h1>energy-moneysaver — M1 verification</h1>
      <p className="muted">
        Hardcoded combo: <strong>BG Smart Standard Dual Fuel + Gas 21% off</strong>,
        no EV, default profile scaled to 3,500 kWh electricity.
      </p>
      <label className="field">
        Annual gas kWh:
        <input
          type="number"
          value={annualGasKwh}
          onChange={(e) => setAnnualGasKwh(Number(e.target.value))}
        />
      </label>
      <button onClick={handleCalculate}>Calculate annual cost</button>
      {result !== null && (
        <div className="result">
          Annual dual-fuel cost: <strong>€{result.toFixed(2)}</strong>
        </div>
      )}
    </main>
  );
}
