import { Opportunity } from "@/lib/api";

const SCORE_ROWS: { key: keyof Opportunity; label: string; max: number }[] = [
  { key: "profit_score", label: "Profit", max: 30 },
  { key: "roi_score", label: "ROI", max: 20 },
  { key: "confidence_score", label: "Confidence", max: 20 },
  { key: "liquidity_score", label: "Liquidity", max: 10 },
  { key: "seller_score", label: "Seller", max: 10 },
  { key: "timing_score", label: "Timing", max: 10 },
];

export function ScoreBreakdown({ opp }: { opp: Opportunity }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="font-semibold text-gray-900 mb-3">
        Score: <span className="text-blue-700">{opp.total_score.toFixed(0)}</span>/100
      </h3>
      <div className="space-y-2">
        {SCORE_ROWS.map(({ key, label, max }) => {
          const val = opp[key] as number;
          const pct = (val / max) * 100;
          return (
            <div key={key}>
              <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                <span>{label}</span>
                <span>{val.toFixed(1)}/{max}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
