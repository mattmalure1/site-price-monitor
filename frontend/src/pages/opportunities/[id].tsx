import { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { Opportunity, fetchOpportunity } from "@/lib/api";
import { SignalBadge } from "@/components/shared/SignalBadge";
import { MathBreakdown } from "@/components/detail/MathBreakdown";
import { ScoreBreakdown } from "@/components/detail/ScoreBreakdown";
import { ActionButtons } from "@/components/detail/ActionButtons";
import { BankrollBar } from "@/components/shared/BankrollBar";
import { formatCountdown, usd } from "@/lib/format";

interface Props {
  opp: Opportunity;
}

export default function OpportunityDetail({ opp }: Props) {
  const card = opp.listing.parsed_card;
  const title = card
    ? `${card.grader} ${card.grade} ${card.card_name}`
    : opp.listing.title.slice(0, 50);

  const countdown =
    opp.listing.listing_type === "BIN"
      ? "Buy It Now"
      : formatCountdown(opp.listing.end_time);

  return (
    <>
      <Head>
        <title>{title} — Card Arbitrage</title>
      </Head>
      <div className="min-h-screen flex flex-col">
        <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-700 text-sm">← Back</Link>
          <h1 className="text-base font-semibold text-gray-900 truncate flex-1">{title}</h1>
          <SignalBadge signal={opp.signal} />
        </header>
        <BankrollBar />
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: images + listing info */}
            <div className="space-y-4">
              {opp.listing.image_urls.length > 0 && (
                <div className="rounded-lg border bg-white p-2 flex gap-2 overflow-x-auto">
                  {opp.listing.image_urls.slice(0, 4).map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`Card image ${i + 1}`}
                      className="h-40 w-auto object-contain rounded flex-shrink-0"
                    />
                  ))}
                </div>
              )}

              <div className="rounded-lg border bg-white p-4 space-y-2 text-sm">
                <h3 className="font-semibold text-gray-900">Listing</h3>
                <Row label="Title" value={opp.listing.title} />
                <Row label="Type" value={opp.listing.listing_type} />
                <Row label="Current price" value={usd(opp.listing.current_price)} />
                <Row label="Shipping" value={usd(opp.listing.shipping_price)} />
                <Row label="Total" value={usd(opp.listing.total_price)} />
                <Row label="Ends" value={countdown} />
                {opp.listing.listing_type === "AUCTION" && (
                  <Row label="Bids" value={String(opp.listing.bid_count)} />
                )}
              </div>

              <div className="rounded-lg border bg-white p-4 space-y-2 text-sm">
                <h3 className="font-semibold text-gray-900">Seller</h3>
                <Row label="Username" value={opp.listing.seller_username} />
                <Row label="Feedback" value={`${opp.listing.seller_feedback_score} (${opp.listing.seller_feedback_percent}%)`} />
                <Row label="Returns" value={opp.listing.return_policy || "No returns"} />
                {opp.listing.has_authenticity_guarantee && (
                  <p className="text-green-700 font-medium">eBay Authenticity Guarantee</p>
                )}
              </div>

              {card && (
                <div className="rounded-lg border bg-white p-4 space-y-2 text-sm">
                  <h3 className="font-semibold text-gray-900">Parsed Card</h3>
                  <Row label="Name" value={card.card_name} />
                  <Row label="Set" value={card.set_name} />
                  <Row label="Number" value={card.card_number} />
                  <Row label="Grader" value={card.grader} />
                  <Row label="Grade" value={String(card.grade)} />
                  <Row label="Language" value={card.language} />
                  <Row label="Variant" value={card.variant} />
                  <Row label="Confidence" value={`${(card.parse_confidence * 100).toFixed(0)}%`} />
                  {card.risk_flags.length > 0 && (
                    <div className="mt-2 p-2 bg-red-50 rounded text-red-700">
                      <p className="font-medium">Risk Flags</p>
                      <ul className="mt-1 list-disc list-inside space-y-0.5">
                        {card.risk_flags.map((f) => <li key={f}>{f}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: math + score + actions */}
            <div className="space-y-4">
              <MathBreakdown opp={opp} />
              <ScoreBreakdown opp={opp} />
              <ActionButtons opp={opp} />
              {opp.notes && (
                <div className="rounded-lg border bg-amber-50 p-4 text-sm text-amber-800">
                  <p className="font-medium">Notes</p>
                  <p className="mt-1">{opp.notes}</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 w-28 flex-shrink-0">{label}</span>
      <span className="text-gray-800 break-words">{value}</span>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const id = parseInt(ctx.params!.id as string);
  try {
    const opp = await fetchOpportunity(id);
    return { props: { opp } };
  } catch {
    return { notFound: true };
  }
};
