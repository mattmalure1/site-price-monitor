"use client";
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { BankrollBar } from "@/components/shared/BankrollBar";
import { usd } from "@/lib/format";
import { API_BASE } from "@/lib/api";

interface Purchase {
  id: number;
  listing_id: number;
  purchase_price: number;
  shipping_paid: number;
  total_cost: number;
  sale_price: number | null;
  net_profit: number | null;
  days_to_sell: number | null;
  status: string;
  won_at: string | null;
}

export default function Purchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/purchases`)
      .then((r) => r.json())
      .then(setPurchases)
      .finally(() => setLoading(false));
  }, []);

  const totalProfit = purchases.reduce((s, p) => s + (p.net_profit ?? 0), 0);
  const sold = purchases.filter((p) => p.status === "sold");
  const inInventory = purchases.filter((p) => p.status !== "sold");

  return (
    <>
      <Head>
        <title>Purchases — Card Arbitrage</title>
      </Head>
      <div className="min-h-screen flex flex-col">
        <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Card Arbitrage</h1>
            <p className="text-xs text-gray-400">Graded Pokémon Deal Finder</p>
          </div>
          <nav className="flex gap-3 text-sm">
            <a href="/" className="text-gray-500 hover:text-gray-900">Opportunities</a>
            <a href="/purchases" className="font-medium text-blue-600">Purchases</a>
          </nav>
        </header>
        <BankrollBar />
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
          <div className="flex items-center gap-6 mb-6">
            <Stat label="Total Purchases" value={String(purchases.length)} />
            <Stat label="Sold" value={String(sold.length)} />
            <Stat label="In Inventory" value={String(inInventory.length)} />
            <Stat label="Total Net Profit" value={usd(totalProfit)} good={totalProfit > 0} />
          </div>

          {loading ? (
            <div className="animate-pulse h-40 bg-gray-100 rounded-lg" />
          ) : purchases.length === 0 ? (
            <div className="text-center text-gray-400 py-16">No purchases recorded yet.</div>
          ) : (
            <div className="rounded-lg border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">ID</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Sale</th>
                    <th className="px-4 py-3 text-right">Profit</th>
                    <th className="px-4 py-3 text-center">Days</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">#{p.id}</td>
                      <td className="px-4 py-3 text-right">{usd(p.total_cost)}</td>
                      <td className="px-4 py-3 text-right">{p.sale_price != null ? usd(p.sale_price) : "—"}</td>
                      <td className={`px-4 py-3 text-right font-medium ${p.net_profit != null ? (p.net_profit >= 0 ? "text-green-700" : "text-red-600") : "text-gray-400"}`}>
                        {p.net_profit != null ? usd(p.net_profit) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500">{p.days_to_sell ?? "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 capitalize">
                          {p.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${good ? "text-green-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
