import { useEffect, useRef, useState } from "react";

/**
 * Counts from 0 up to `target` once, on mount.
 * Internal to this file — exporting it would break Fast Refresh,
 * which requires modules to export components only.
 *
 * Every setValue runs inside a requestAnimationFrame callback, never
 * synchronously in the effect body (React 19 warns about the latter).
 */
function useCountUp(target: number, duration = 900, delay = 0) {
  const [value, setValue] = useState(0);
  const frame = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Nothing to animate — land on the target next frame.
    if (reduce || target === 0) {
      frame.current = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(frame.current);
    }

    let start: number | null = null;
    const startAt = performance.now() + delay;

    const step = (now: number) => {
      if (now < startAt) {
        frame.current = requestAnimationFrame(step);
        return;
      }
      if (start === null) start = now;
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration, delay]);

  return value;
}

/**
 * A number that counts up to `value` on mount.
 * Renders a bare number, so it inherits whatever type styles wrap it.
 */
export function CountUp({
  value,
  duration = 900,
  delay = 0,
}: {
  value: number;
  duration?: number;
  delay?: number;
}) {
  return <>{useCountUp(value, duration, delay)}</>;
}

/**
 * Animated progress ring. The arc sweeps in on mount and the
 * centre figure counts up with it.
 */
export function Ring({
  percent,
  label,
  sublabel,
  colour = "var(--color-brand-600)",
  size = 132,
  delay = 150,
}: {
  percent: number;
  label: string;
  sublabel?: string;
  colour?: string;
  size?: number;
  delay?: number;
}) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const safe = Math.max(0, Math.min(100, percent));
  const offset = circ - (safe / 100) * circ;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-slate-100)"
            strokeWidth={stroke}
          />
          <circle
            className="ring-draw"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colour}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            style={
              {
                "--ring-circ": circ,
                "--ring-off": offset,
                "--d": `${delay}ms`,
              } as React.CSSProperties
            }
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <p className="text-[26px] font-bold leading-none tabular-nums text-ink-900">
            <CountUp value={safe} delay={delay} />
            <span className="text-sm font-semibold text-ink-400">%</span>
          </p>
        </div>
      </div>
      <p className="mt-2.5 text-[11px] font-bold uppercase tracking-[1.2px] text-ink-900">{label}</p>
      {sublabel && <p className="mt-0.5 text-[11px] text-ink-400">{sublabel}</p>}
    </div>
  );
}