import clsx from "clsx";

const COLORS: Record<string, string> = {
  GREEN: "bg-green-100 text-green-800 border-green-300",
  YELLOW: "bg-yellow-100 text-yellow-800 border-yellow-300",
  RED: "bg-red-100 text-red-700 border-red-300",
  PASS: "bg-gray-100 text-gray-500 border-gray-200",
};

export function SignalBadge({ signal }: { signal: string }) {
  return (
    <span
      className={clsx(
        "inline-block border rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
        COLORS[signal] ?? COLORS.PASS
      )}
    >
      {signal}
    </span>
  );
}
