"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Opportunity, updateOpportunityStatus, recordPurchase } from "@/lib/api";
import { usd } from "@/lib/format";

export function ActionButtons({ opp }: { opp: Opportunity }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(status: string) {
    setLoading(true);
    setError(null);
    try {
      await updateOpportunityStatus(opp.id, status);
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function markWon() {
    setLoading(true);
    setError(null);
    const priceStr = prompt(`Record purchase price (max bid was ${usd(opp.max_bid)}):`);
    if (!priceStr) { setLoading(false); return; }
    const price = parseFloat(priceStr);
    if (isNaN(price)) { setError("Invalid price"); setLoading(false); return; }
    try {
      await recordPurchase({
        listing_id: opp.listing_id,
        opportunity_id: opp.id,
        purchase_price: price,
        shipping_paid: opp.listing.shipping_price,
      });
      await updateOpportunityStatus(opp.id, "won");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || ["won", "lost", "passed"].includes(opp.status);

  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Actions</h3>
      <div className="flex flex-wrap gap-2">
        <a
          href={opp.listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
        >
          Open on eBay ↗
        </a>
        <button
          onClick={() => act("watched")}
          disabled={disabled}
          className="px-3 py-2 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 text-sm font-medium disabled:opacity-40"
        >
          Watch
        </button>
        <button
          onClick={markWon}
          disabled={disabled}
          className="px-3 py-2 rounded bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-40"
        >
          Mark Won
        </button>
        <button
          onClick={() => act("lost")}
          disabled={disabled}
          className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium disabled:opacity-40"
        >
          Lost
        </button>
        <button
          onClick={() => act("passed")}
          disabled={disabled}
          className="px-3 py-2 rounded bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium disabled:opacity-40"
        >
          Pass
        </button>
      </div>

      {opp.status !== "pending" && (
        <p className="mt-2 text-xs text-gray-500 capitalize">Status: {opp.status}</p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}

      <div className="mt-3 p-3 rounded bg-blue-50 border border-blue-200 text-sm">
        <p className="font-medium text-blue-800">Max bid: {usd(opp.max_bid)}</p>
        <p className="text-blue-600 text-xs mt-0.5">Do not exceed this amount.</p>
      </div>
    </div>
  );
}
