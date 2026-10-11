// Pick people from the user list, or type / paste any address (several at once
// work: "a@x.in, b@x.in; c@x.in" or one per line). Shown as removable chips.
import { useMemo, useRef, useState } from "react";

const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

function splitEmails(text: string): string[] {
  return text.split(/[\s,;]+/).map((s) => s.trim().replace(/^<|>$/g, "").toLowerCase()).filter(Boolean);
}

export function EmailPicker({
  value, onChange, users, placeholder = "Select a person or type an email", variant = "box",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  users: { name: string; email: string }[];
  placeholder?: string;
  variant?: "box" | "card";   // "card": no outer box, a small dashed "+ add" pill (Create new project)
}) {
  const card = variant === "card";
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [bad, setBad] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const nameOf = useMemo(() => Object.fromEntries(users.map((u) => [u.email.toLowerCase(), u.name])), [users]);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    return users
      .filter((u) => !value.includes(u.email.toLowerCase()))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [users, value, text]);

  function add(list: string[]) {
    const good = list.filter((e) => EMAIL.test(e));
    const wrong = list.filter((e) => !EMAIL.test(e));
    const next = [...value];
    for (const e of good) if (!next.includes(e)) next.push(e);
    if (next.length !== value.length) onChange(next);
    setBad(wrong.length ? `Not an email: ${wrong.join(", ")}` : "");
    setText(wrong.join(" "));
    setOpen(false);   // close the list so it never covers the next box
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (["Enter", ",", ";", "Tab"].includes(e.key) && text.trim()) {
      if (e.key !== "Tab") e.preventDefault();
      const exact = matches.find((u) => u.name.toLowerCase() === text.trim().toLowerCase());
      add(exact ? [exact.email.toLowerCase()] : splitEmails(text));
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={box} className="relative"
      onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) { setOpen(false); if (text.trim()) add(splitEmails(text)); } }}>
      <div className={card
        ? "flex flex-col gap-1.5"
        : `flex min-h-[38px] flex-wrap items-center gap-1.5 rounded border bg-white px-2 py-1 ${bad ? "border-red-400" : "border-slate-300 focus-within:border-brand-600"}`}>
        {value.map((e) => (
          <span key={e} className={card
            ? "flex items-center justify-between gap-2 rounded-md bg-brand-50 px-2.5 py-1.5 text-[13px] text-brand-700"
            : "inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[12px] text-brand-700"} title={e}>
            {card ? <span className="min-w-0 truncate">{nameOf[e] ? <><b className="font-semibold">{nameOf[e]}</b> <span className="text-brand-700/70">{e}</span></> : e}</span> : nameOf[e] ? <><b className="font-semibold">{nameOf[e]}</b><span className="text-brand-700/70">{e}</span></> : e}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== e))} className="ml-0.5 text-brand-700/60 hover:text-brand-800" aria-label={`Remove ${e}`}>×</button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); setBad(""); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKey}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/[,;\s]/.test(t.trim())) { e.preventDefault(); add(splitEmails(t)); } }}
          placeholder={card ? "+ Add person or email" : value.length ? "" : placeholder}
          style={card ? { outline: "none" } : undefined}
          className={card
            ? `w-full rounded-md border border-dashed bg-white px-2.5 py-1.5 text-[13px] shadow-none outline-none placeholder:text-slate-400 hover:border-slate-400 focus:border-solid focus:border-brand-600 focus:outline-none focus-visible:outline-none ${bad ? "border-red-400" : "border-slate-300"}`
            : "min-w-[160px] flex-1 border-0 bg-transparent py-1 text-sm shadow-none outline-none ring-0 focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none"}
        />
      </div>
      {bad && <p className="mt-0.5 text-[11px] text-red-600">{bad}</p>}
      {open && (matches.length > 0 || (text.trim() && EMAIL.test(text.trim()))) && (
        <ul className={`absolute z-20 mt-1 max-h-60 overflow-y-auto ${card ? "w-full min-w-[240px]" : "w-full"} rounded border border-slate-200 bg-white py-1 text-sm shadow-lg`}>
          {text.trim() && EMAIL.test(text.trim()) && !nameOf[text.trim().toLowerCase()] && (
            <li><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add([text.trim().toLowerCase()])}
              className="w-full px-3 py-1.5 text-left hover:bg-slate-50">Add <b>{text.trim()}</b></button></li>
          )}
          {matches.map((u) => (
            <li key={u.email}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add([u.email.toLowerCase()])}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left hover:bg-slate-50">
                <span className="font-medium text-slate-900">{u.name}</span>
                <span className="truncate text-[12px] text-slate-500">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
