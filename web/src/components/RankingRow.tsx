import { useT } from "../i18n";
import type { RankedCombo } from "../viewModel";
import { ComboRateDetail } from "./PlanRateDetail";

export function RankingRow({
  row,
  rank,
  delta,
  isBest,
  isExpanded,
  onToggle,
}: {
  row: RankedCombo;
  rank: number;
  delta: number;
  isBest: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useT();
  const { combo, annualEur } = row;
  return (
    <>
      <tr
        className={`${isBest ? "best " : ""}${isExpanded ? "expanded" : ""}`}
        onClick={onToggle}
      >
        <td>
          <span aria-hidden="true" className="caret">
            {isExpanded ? "▾" : "▸"}
          </span>{" "}
          {rank}
        </td>
        <td>
          <div>{combo.label}</div>
          <div className="muted">
            {combo.elec.supplier}
            {combo.gas ? t.gasSuffix(combo.gas.supplier) : ""}
          </div>
        </td>
        <td className="num">{annualEur.toFixed(0)}</td>
        <td className="num">{rank === 1 ? "—" : `+${delta.toFixed(0)}`}</td>
      </tr>
      {isExpanded && (
        <tr className="drawer-row">
          <td colSpan={4}>
            <ComboRateDetail ranked={row} />
          </td>
        </tr>
      )}
    </>
  );
}
