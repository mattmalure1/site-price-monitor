export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export const pct = (n: number) => `${n.toFixed(1)}%`;

export function minutesUntil(isoString: string | null): number | null {
  if (!isoString) return null;
  const diff = new Date(isoString).getTime() - Date.now();
  return Math.floor(diff / 60000);
}

export function formatCountdown(isoString: string | null): string {
  const mins = minutesUntil(isoString);
  if (mins === null) return "BIN";
  if (mins < 0) return "Ended";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}h ${rem}m`;
}
