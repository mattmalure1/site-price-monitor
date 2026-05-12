"use client";
import useSWR from "swr";
import { fetchBankroll, BankrollStatus } from "@/lib/api";
import { usd } from "@/lib/format";

const fetcher = () => fetchBankroll();

export function BankrollBar() {
  const { data } = useSWR<BankrollStatus>("bankroll", fetcher, { refreshInterval: 30000 });

  if (!data) return null;

  const dayPct = Math.min(100, (data.daily_spent / data.daily_limit) * 100);
  const monthPct = Math.min(100, (data.monthly_spent / data.monthly_limit) * 100);

  return (
    <div className="bg-gray-50 border-b px-4 py-2 flex flex-wrap gap-6 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Today</span>
        <div className="w-24 h-1.5 bg-gray-200 rounded overflow-hidden">
          <div className="h-full bg-blue-500 rounded" style={{ width: `${dayPct}%` }} />
        </div>
        <span className="font-medium">{usd(data.daily_spent)} / {usd(data.daily_limit)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Month</span>
        <div className="w-24 h-1.5 bg-gray-200 rounded overflow-hidden">
          <div className="h-full bg-indigo-500 rounded" style={{ width: `${monthPct}%` }} />
        </div>
        <span className="font-medium">{usd(data.monthly_spent)} / {usd(data.monthly_limit)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Available today</span>
        <span className="font-semibold text-green-700">{usd(data.available_today)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Open auctions</span>
        <span className="font-medium">{data.open_auctions} / {data.max_open_auctions}</span>
      </div>
    </div>
  );
}
