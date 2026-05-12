import { Opportunity } from "@/lib/api";
import { usd, pct } from "@/lib/format";

export function MathBreakdown({ opp }: { opp: Opportunity }) {
  const rows: [string, number, boolean?][] = [
    ["Resale value (after haircuts)", opp.resale_value],
    ["eBay fees (13.25% + $0.40)", -opp.fee_estimate],
    ["Outbound shipping", -opp.shipping_out],
    ["Supplies", -opp.supplies],
    ["Risk buffer", -opp.risk_buffer],
    ["Target profit", -opp.target_profit],
    ["Inbound shipping", -opp.listing.shipping_price],
  ];

  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Max-Bid Math</h3>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t border-gray-50">
              <td className="py-1.5 text-gray-600">{label}</td>
              <td className={`py-1.5 text-right font-mono ${value < 0 ? "text-red-600" : "text-gray-900"}`}>
                {value < 0 ? `−${usd(Math.abs(value))}` : usd(value)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-300 font-bold text-base">
            <td className="pt-2 text-gray-900">Max Bid</td>
            <td className="pt-2 text-right font-mono text-blue-700">{usd(opp.max_bid)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
        <Stat label="Expected Profit" value={usd(opp.expected_profit)} good />
        <Stat label="ROI" value={pct(opp.roi)} good />
        <Stat label="Market Value" value={usd(opp.market_value)} />
      </div>
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className={`rounded p-2 ${good ? "bg-green-50" : "bg-gray-50"}`}>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className={`font-bold mt-0.5 ${good ? "text-green-700" : "text-gray-800"}`}>{value}</p>
    </div>
  );
}
