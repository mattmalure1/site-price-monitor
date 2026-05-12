import clsx from "clsx";

export function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 85
      ? "bg-green-500"
      : score >= 70
      ? "bg-yellow-400"
      : "bg-red-400";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded bg-gray-200 overflow-hidden">
        <div className={clsx("h-full rounded", color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-bold tabular-nums w-10 text-right">{score.toFixed(0)}</span>
    </div>
  );
}
