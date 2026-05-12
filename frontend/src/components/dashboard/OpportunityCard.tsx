"use client";
import Link from "next/link";
import { Opportunity } from "@/lib/api";
import { usd, pct, formatCountdown } from "@/lib/format";
import { SignalBadge } from "@/components/shared/SignalBadge";
import { ScoreBar } from "@/components/shared/ScoreBar";
import clsx from "clsx";

interface Props {
  opp: Opportunity;
}

export function OpportunityCard({ opp }: Props) {
  const card = opp.listing.parsed_card;
  const cardLabel = card
    ? `${card.grader} ${card.grade} ${card.card_name}${card.variant ? ` (${card.variant})` : ""}`
    : opp.listing.title.slice(0, 60);

  const countdown =
    opp.listing.listing_type === "BIN"
      ? "BIN"
      : formatCountdown(opp.listing.end_time);

  const isUrgent = opp.signal === "GREEN" && opp.listing.listing_type === "AUCTION";

  return (
    <div
      className={clsx(
        "rounded-lg border bg-white p-4 shadow-sm hover:shadow-md transition-shadow",
        isUrgent && "border-green-400 ring-1 ring-green-300"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate" title={cardLabel}>
            {cardLabel}
          </p>
          {card?.card_number && (
            <p className="text-xs text-gray-400 mt-0.5">
              {card.set_name} #{card.card_number} · {card.language}
            </p>
          )}
        </div>
        <SignalBadge signal={opp.signal} />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
        <Row label="Market" value={usd(opp.market_value)} />
        <Row label="Current" value={usd(opp.listing.total_price)} />
        <Row label="Max bid" value={usd(opp.max_bid)} highlight />
        <Row label="Profit" value={`${usd(opp.expected_profit)} (${pct(opp.roi)} ROI)`} highlight />
      </div>

      <ScoreBar score={opp.total_score} />

      <div className="flex items-center justify-between mt-3 text-sm">
        <span
          className={clsx(
            "font-medium",
            opp.listing.listing_type === "AUCTION" && parseInt(countdown) < 10
              ? "text-red-600"
              : "text-gray-500"
          )}
        >
          {countdown}
          {opp.listing.listing_type === "AUCTION" && ` · ${opp.listing.bid_count} bids`}
        </span>
        <div className="flex gap-2">
          <a
            href={opp.listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs"
          >
            eBay ↗
          </a>
          <Link
            href={`/opportunities/${opp.id}`}
            className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs"
          >
            Review
          </Link>
        </div>
      </div>

      {card?.risk_flags && card.risk_flags.length > 0 && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
          {card.risk_flags[0]}
          {card.risk_flags.length > 1 && ` +${card.risk_flags.length - 1} more`}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className={clsx("font-medium", highlight ? "text-gray-900" : "text-gray-700")}>
        {value}
      </span>
    </>
  );
}
