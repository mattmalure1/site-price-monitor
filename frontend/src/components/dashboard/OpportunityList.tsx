"use client";
import useSWR from "swr";
import { fetchBest, Opportunity } from "@/lib/api";
import { OpportunityCard } from "./OpportunityCard";

const fetcher = () => fetchBest();

export function OpportunityList() {
  const { data, error, isLoading } = useSWR<Opportunity[]>("best-opportunities", fetcher, {
    refreshInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-gray-50 h-48 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
        Failed to load opportunities. Is the backend running?
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border bg-gray-50 p-10 text-center text-gray-500">
        <p className="text-lg font-medium">No active opportunities right now.</p>
        <p className="text-sm mt-1">The scanner runs every 3 minutes for auctions and every 5 minutes for BIN listings.</p>
      </div>
    );
  }

  const green = data.filter((o) => o.signal === "GREEN");
  const yellow = data.filter((o) => o.signal === "YELLOW");

  return (
    <div className="space-y-6">
      {green.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-green-700 mb-3">
            Strong Buys ({green.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {green.map((opp) => (
              <OpportunityCard key={opp.id} opp={opp} />
            ))}
          </div>
        </section>
      )}
      {yellow.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-yellow-700 mb-3">
            Review ({yellow.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {yellow.map((opp) => (
              <OpportunityCard key={opp.id} opp={opp} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
