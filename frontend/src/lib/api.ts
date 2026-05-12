export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface ParsedCard {
  card_name: string;
  set_name: string;
  card_number: string;
  language: string;
  grader: string;
  grade: number | null;
  cert_number: string;
  variant: string;
  parse_confidence: number;
  risk_flags: string[];
  image_flags: string[];
}

export interface Listing {
  id: number;
  ebay_item_id: string;
  title: string;
  url: string;
  listing_type: string;
  current_price: number;
  shipping_price: number;
  total_price: number;
  bid_count: number;
  end_time: string | null;
  seller_username: string;
  seller_feedback_score: number;
  seller_feedback_percent: number;
  condition: string;
  image_urls: string[];
  has_authenticity_guarantee: boolean;
  return_policy: string;
  parsed_card: ParsedCard | null;
}

export interface Opportunity {
  id: number;
  listing_id: number;
  market_value: number;
  resale_value: number;
  fee_estimate: number;
  shipping_out: number;
  supplies: number;
  risk_buffer: number;
  target_profit: number;
  max_bid: number;
  expected_profit: number;
  roi: number;
  profit_score: number;
  roi_score: number;
  confidence_score: number;
  liquidity_score: number;
  seller_score: number;
  timing_score: number;
  total_score: number;
  signal: "GREEN" | "YELLOW" | "RED" | "PASS";
  status: string;
  notes: string;
  alerted_at: string | null;
  created_at: string;
  updated_at: string;
  listing: Listing;
}

export interface BankrollStatus {
  daily_spent: number;
  daily_limit: number;
  monthly_spent: number;
  monthly_limit: number;
  open_auctions: number;
  max_open_auctions: number;
  available_today: number;
  available_month: number;
}

export async function fetchBest(): Promise<Opportunity[]> {
  const res = await fetch(`${API_BASE}/api/opportunities/best`);
  if (!res.ok) throw new Error("Failed to fetch opportunities");
  return res.json();
}

export async function fetchOpportunity(id: number): Promise<Opportunity> {
  const res = await fetch(`${API_BASE}/api/opportunities/${id}`);
  if (!res.ok) throw new Error("Failed to fetch opportunity");
  return res.json();
}

export async function updateOpportunityStatus(
  id: number,
  status: string,
  notes?: string
): Promise<Opportunity> {
  const res = await fetch(`${API_BASE}/api/opportunities/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, notes }),
  });
  if (!res.ok) throw new Error("Failed to update status");
  return res.json();
}

export async function fetchBankroll(): Promise<BankrollStatus> {
  const res = await fetch(`${API_BASE}/api/purchases/bankroll`);
  if (!res.ok) throw new Error("Failed to fetch bankroll");
  return res.json();
}

export async function recordPurchase(data: {
  listing_id: number;
  opportunity_id?: number;
  purchase_price: number;
  shipping_paid: number;
}) {
  const res = await fetch(`${API_BASE}/api/purchases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(JSON.stringify(err));
  }
  return res.json();
}
