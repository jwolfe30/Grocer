import { dealBadgeLabel, type DealSignal } from "@/lib/pricing";

/** Small optional badge when live price is below 30-day median. */
export function DealBadge({
  signal,
  className = "",
}: {
  signal?: DealSignal | null;
  className?: string;
}) {
  if (!signal) return null;
  const label = dealBadgeLabel(signal);
  return (
    <span
      className={`inline-block text-[10px] font-semibold tracking-wide text-[var(--sale)] uppercase ${className}`}
      title={`About ${Math.round(signal.pctBelowMedian * 100)}% below the 30-day median (${signal.medianUsd.toFixed(2)})`}
    >
      Deal · {label}
    </span>
  );
}
