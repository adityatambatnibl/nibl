// One calendar for every date box in the app (replaces <input type="date">).
// Shows dates as 05-Oct-2026 on every PC. Click the title to jump to a
// month, click again to jump to a year. Value in / out stays "YYYY-MM-DD"
// (or "YYYY-MM" with type="month"), and onChange gets { target: { value } }
// so existing handlers like (e) => set(e.target.value) work unchanged.
// The date can also be typed: 05-10-2026, 5/10/26, 05102026, 5 Oct 2026,
// 05-Oct-2026 or 2026-10-05 (day first). Enter or leaving the box saves it.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parse(v: string | null | undefined, month: boolean): Date | null {
  if (!v) return null;
  const p = v.slice(0, 10).split("-").map(Number);
  if (!p[0] || !p[1]) return null;
  const d = new Date(p[0], p[1] - 1, month ? 1 : p[2] || 1);
  return isNaN(d.getTime()) ? null : d;
}

function formatDisplay(v: string | null | undefined, month = false): string {
  const d = parse(v, month);
  if (!d) return "";
  return month ? `${M[d.getMonth()]}-${d.getFullYear()}` : `${pad(d.getDate())}-${M[d.getMonth()]}-${d.getFullYear()}`;
}

// Understands what people type; returns "YYYY-MM-DD" / "YYYY-MM", "" for
// empty, or null when it is not a real date.
function parseTyped(raw: string, month: boolean): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return "";
  const year = (v: string) => { const n = +v; return v.length <= 2 ? 2000 + n : n; };
  const mon = (v: string) => { const i = M.findIndex((x) => v.startsWith(x.toLowerCase())); return i >= 0 ? i + 1 : +v; };
  const ok = (y: number, m: number, d: number) => {
    if (!y || y < 1900 || y > 2200 || m < 1 || m > 12) return null;
    if (month) return `${y}-${pad(m)}`;
    const dt = new Date(y, m - 1, d);
    return dt.getMonth() === m - 1 && dt.getDate() === d ? toKey(dt) : null;
  };
  let x: RegExpMatchArray | null;
  if ((x = t.match(/^(\d{4})[-/. ](\d{1,2})(?:[-/. ](\d{1,2}))?$/))) return ok(+x[1], +x[2], +(x[3] ?? 1));
  if (month) {
    if ((x = t.match(/^([a-z]{3,}|\d{1,2})[-/. ,]+(\d{2}|\d{4})$/))) return ok(year(x[2]), mon(x[1]), 1);
    if ((x = t.match(/^(\d{2})(\d{4})$/))) return ok(+x[2], +x[1], 1);
    return null;
  }
  if ((x = t.match(/^(\d{1,2})[-/. ]+([a-z]{3,}|\d{1,2})[-/. ,]+(\d{2}|\d{4})$/))) return ok(year(x[3]), mon(x[2]), +x[1]);
  if ((x = t.match(/^(\d{2})(\d{2})(\d{4}|\d{2})$/))) return ok(year(x[3]), +x[2], +x[1]);
  return null;
}

type Props = {
  value: string | null | undefined;
  onChange: (e: { target: { value: string } }) => void;
  type?: "date" | "month";
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
  id?: string;
  title?: string;
  "aria-label"?: string;
};

type View = "d" | "m" | "y";

export function DateInput({
  value, onChange, type = "date", className = "", disabled, placeholder, min, max, id, title, ...rest
}: Props) {
  const isMonth = type === "month";
  const sel = parse(value, isMonth);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>(isMonth ? "m" : "d");
  const [cursor, setCursor] = useState<Date>(() => sel ?? new Date());
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLDivElement>(null);
  const inp = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState<string | null>(null);   // text while typing
  const [bad, setBad] = useState(false);
  const pop = useRef<HTMLDivElement>(null);

  function show() {
    if (disabled) return;
    const start = sel ?? new Date();
    setCursor(new Date(start.getFullYear(), start.getMonth(), 1));
    setView(isMonth ? "m" : "d");
    setOpen(true);
  }
  const close = () => setOpen(false);
  function pick(v: string) {
    onChange({ target: { value: v } });
    setTyped(null);
    setBad(false);
    setOpen(false);
    inp.current?.focus();
  }

  // Place the popup under the box (or above it near the bottom of the
  // screen). It lives on <body>, so table scroll areas never clip it.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      const p = pop.current;
      if (!r || !p) return;
      const w = p.offsetWidth, h = p.offsetHeight;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      const below = r.bottom + 4;
      const top = below + h > window.innerHeight - 8 && r.top - h - 4 > 8 ? r.top - h - 4 : below;
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); inp.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const y = cursor.getFullYear(), m = cursor.getMonth();
  const todayKey = toKey(new Date());
  const minD = parse(min, isMonth), maxD = parse(max, isMonth);
  const outOfRange = (d: Date) => (!!minD && d < minD) || (!!maxD && d > maxD);

  function step(n: number) {
    if (view === "d") setCursor(new Date(y, m + n, 1));
    else if (view === "m") setCursor(new Date(y + n, m, 1));
    else setCursor(new Date(y + 12 * n, m, 1));
  }
  function up() { setView(view === "d" ? "m" : view === "m" ? "y" : isMonth ? "m" : "d"); }

  const decade = y - (y % 12);
  const titleText = view === "d" ? `${M[m]} ${y}` : view === "m" ? `${y}` : `${decade} – ${decade + 11}`;

  let body: ReactNode;
  if (view === "d") {
    const s = new Date(y, m, 1);
    s.setDate(1 - ((s.getDay() + 6) % 7));
    const cells = Array.from({ length: 42 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i));
    body = (
      <div className="grid grid-cols-7 gap-[3px] text-center">
        {DW.map((d) => <div key={d} className="py-1 text-[11px] font-bold text-slate-500">{d}</div>)}
        {cells.map((d, i) => {
          const k = toKey(d), other = d.getMonth() !== m, isSel = !!sel && k === toKey(sel), off = outOfRange(d);
          return (
            <button key={k} type="button" disabled={off} onClick={() => pick(k)}
              className={[
                "h-8 rounded-lg text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                isSel ? "bg-brand-600 font-bold text-white"
                  : k === todayKey ? "font-semibold text-brand-600 ring-[1.5px] ring-inset ring-brand-600 hover:bg-brand-50"
                  : other ? "text-slate-300 hover:bg-brand-50"
                  : i % 7 === 6 ? "text-slate-400 hover:bg-brand-50"
                  : "text-ink-900 hover:bg-brand-50",
              ].join(" ")}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    );
  } else if (view === "m") {
    body = (
      <div className="grid grid-cols-3 gap-1.5 py-1">
        {M.map((name, i) => {
          const d = new Date(y, i, 1);
          const on = !!sel && sel.getFullYear() === y && sel.getMonth() === i;
          const cur = cursor.getMonth() === i && !isMonth;
          return (
            <button key={name} type="button"
              disabled={isMonth && outOfRange(d)}
              onClick={() => (isMonth ? pick(`${y}-${pad(i + 1)}`) : (setCursor(d), setView("d")))}
              className={`h-11 rounded-lg text-[13px] disabled:opacity-30 ${on ? "bg-brand-600 font-bold text-white" : cur ? "bg-brand-50 text-brand-600" : "text-ink-900 hover:bg-brand-50"}`}>
              {name}
            </button>
          );
        })}
      </div>
    );
  } else {
    body = (
      <div className="grid grid-cols-3 gap-1.5 py-1">
        {Array.from({ length: 12 }, (_, i) => decade + i).map((yr) => (
          <button key={yr} type="button" onClick={() => { setCursor(new Date(yr, m, 1)); setView("m"); }}
            className={`h-11 rounded-lg text-[13px] ${yr === y ? "bg-brand-600 font-bold text-white" : "text-ink-900 hover:bg-brand-50"}`}>
            {yr}
          </button>
        ))}
      </div>
    );
  }

  const text = formatDisplay(value, isMonth);

  function onType(v: string) {
    setTyped(v);
    const k = parseTyped(v, isMonth);
    setBad(k === null && v.trim().length >= 6);
    const d = k ? parse(k, isMonth) : null;
    if (d) setCursor(new Date(d.getFullYear(), d.getMonth(), 1));   // calendar follows
  }
  // Save what was typed; a wrong date goes back to the last good one.
  function commit() {
    if (typed === null) return;
    const k = parseTyped(typed, isMonth);
    const d = k ? parse(k, isMonth) : null;
    if (k !== null && !(d && outOfRange(d))) { if (k !== (value ?? "").slice(0, isMonth ? 7 : 10)) onChange({ target: { value: k } }); }
    setTyped(null);
    setBad(false);
  }

  return (
    <>
      <div
        ref={btn} title={title}
        className={`inline-flex items-center justify-between gap-1.5 whitespace-nowrap text-left ${disabled ? "cursor-not-allowed !bg-slate-50 text-slate-700" : "cursor-text"} ${bad ? "!border-red-500" : ""} focus-within:!border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/15 ${className}`}
        onMouseDown={(e) => { if (!disabled && e.target !== inp.current) { e.preventDefault(); inp.current?.focus(); if (!open) show(); } }}
        {...(disabled ? { "aria-disabled": true } : {})}
      >
        <input
          ref={inp} id={id} aria-label={rest["aria-label"]} disabled={disabled} autoComplete="off"
          value={typed ?? text}
          placeholder={placeholder || (isMonth ? "MM-YYYY" : "DD-MM-YYYY")}
          onChange={(e) => onType(e.target.value)}
          onFocus={(e) => e.target.select()}
          onClick={() => { if (!open) show(); }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); close(); }
            else if (e.key === "Tab") close();
            else if (e.key === "ArrowDown" && !open) { e.preventDefault(); show(); }
          }}
          className="w-full min-w-0 border-0 bg-transparent p-0 text-inherit outline-none placeholder:text-slate-400 focus-visible:outline-none disabled:cursor-not-allowed"
          style={{ font: "inherit", color: "inherit", outline: "none", boxShadow: "none" }}
        />
        <button type="button" tabIndex={-1} disabled={disabled} aria-label="Open calendar"
          aria-haspopup="dialog" aria-expanded={open}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (disabled) return; inp.current?.focus(); if (open) close(); else show(); }}
          className="shrink-0 text-slate-400 hover:text-brand-600 disabled:cursor-not-allowed">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" />
          </svg>
        </button>
      </div>
      {open && createPortal(
        <div ref={pop} role="dialog" onMouseDown={(e) => e.preventDefault()}
          style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, zIndex: 1000 }}
          className="w-[280px] select-none rounded-xl border border-slate-200 bg-white p-3 text-ink-900 shadow-[0_10px_30px_rgba(15,23,42,.15)]">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => step(-1)} aria-label="Previous"
              className="h-7 w-7 rounded-md text-lg leading-none text-slate-600 hover:bg-brand-50 hover:text-brand-600">‹</button>
            <button type="button" onClick={up}
              className="rounded-md px-2 py-1 text-sm font-bold text-ink-900 hover:bg-brand-50 hover:text-brand-600">
              {titleText}{view !== "y" && " ▾"}
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next"
              className="h-7 w-7 rounded-md text-lg leading-none text-slate-600 hover:bg-brand-50 hover:text-brand-600">›</button>
          </div>
          {body}
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-200 pt-2">
            <button type="button" onClick={() => pick("")}
              className="rounded-md px-2 py-1 text-[13px] font-semibold text-slate-500 hover:bg-brand-50">Clear</button>
            <button type="button"
              onClick={() => { const t = new Date(); pick(isMonth ? `${t.getFullYear()}-${pad(t.getMonth() + 1)}` : toKey(t)); }}
              className="rounded-md px-2 py-1 text-[13px] font-semibold text-brand-600 hover:bg-brand-50">
              {isMonth ? "This month" : "Today"}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
