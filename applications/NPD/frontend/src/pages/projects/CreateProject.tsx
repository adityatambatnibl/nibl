import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "../../services/api";
import { templateApi } from "../../services/templateApi";
import { useFetch } from "../../hooks/useFetch";
import { apqpPath } from "../../utils/links";
import { recipientApi, type Recipients } from "../../services/recipientApi";
import { RecipientsEditor } from "../../components/RecipientsEditor";
import { DateInput } from "../../components/DateInput";

type ItemIn = {
  item_description: string;
  bearing_type: string;
  po_qty: string;
  value: number | null;
};

type GroupIn = {
  anchor_a0: string;
  anchor_a: string;
  items: ItemIn[];
};

const emptyItem = (): ItemIn => ({
  item_description: "",
  bearing_type: "",
  po_qty: "",
  value: null,
});

const emptyGroup = (): GroupIn => ({
  anchor_a0: "",
  anchor_a: "",
  items: [emptyItem()],
});

// One page, read top to bottom: 1 APQP Timeline -> 2 Tracking -> 3 Emails.
const label = "mb-1 block text-[13px] font-semibold text-ink-900";
const field =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-ink-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/10";
const help = "mt-0.5 text-[11px] text-ink-400";
const Req = () => <span className="text-brand-600"> *</span>;

function Section({ n, title, hint, todo, children }: {
  n: number; title: string; hint: string; todo: number; children: React.ReactNode;
}) {
  const done = todo === 0;
  return (
    <section className="rise mt-3 overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex items-center gap-3 border-b border-line bg-slate-50/60 px-4 py-2.5 sm:px-5">
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${done ? "bg-ok" : "bg-brand-600"}`}>
          {done ? "✓" : n}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-ink-900">{title}</h2>
          <p className="text-xs text-ink-500">{hint}</p>
        </div>
        <span className={`ml-auto whitespace-nowrap text-[13px] font-semibold ${done ? "text-ok" : "text-ink-400"}`}>
          {done ? "✓ Done" : `${todo} to fill`}
        </span>
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

export default function CreateProject() {
  const navigate = useNavigate();
  const { data: lookups } = useFetch(() => templateApi.getLookups(), [], { key: "lookups" });

  // Step 4: who gets this project's emails. Starts from the last project's list.
  const { data: recOptions, error: recError } = useFetch(() => recipientApi.options(), [], { key: "recipient-options" });
  const [recipients, setRecipients] = useState<Recipients | null>(null);
  if (recOptions && recipients === null) setRecipients(recOptions.defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [head, setHead] = useState({
    order_no: "",
    order_date: "",
    customer: "",
    planned_delivery_sample: "",
    planned_delivery_batch: "",
    rpd_status: "Not received",
    notes: "",
  });

  const [apqp, setApqp] = useState({
    enquiry_date: "",
    product_name: "",
    customer_part_no: "",
    program_name: "",
    application: "",
    supply_condition: "",
    original_date: "",
    ppap_date: "",
    sample_submission_date: "",
    start_month: "",
  });

  const [groups, setGroups] = useState<GroupIn[]>([emptyGroup()]);

  function setH(k: keyof typeof head, v: string) {
    setHead((h) => ({ ...h, [k]: v }));
    setError("");
  }
  function setA(k: keyof typeof apqp, v: string) {
    setApqp((a) => ({ ...a, [k]: v }));
    setError("");
  }
  function setItem(gi: number, ii: number, patch: Partial<ItemIn>) {
    setGroups((gs) =>
      gs.map((g, i) =>
        i === gi
          ? { ...g, items: g.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) }
          : g,
      ),
    );
    setError("");
  }
  function setGroup(gi: number, patch: Partial<GroupIn>) {
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
    setError("");
  }

  // ── what each tab still needs ────────────────────────────────────────
  // Order number is optional now - the product name carries the identity.
  const orderDone = Boolean(head.order_date && head.customer.trim());
  const itemsDone = groups.every(
    (g) => (g.anchor_a0 || g.anchor_a) && g.items.every((i) => i.item_description.trim()),
  );
  // Product name is the identity now, so it gates the form the way the
  // order number used to.
  const apqpDone = Boolean(apqp.start_month && apqp.product_name.trim());
  const ready = orderDone && itemsDone && apqpDone;

  // What is still empty, in the order it appears on the page.
  const need1 = [!apqp.product_name.trim() && "Product name", !apqp.start_month && "Start month"].filter(Boolean) as string[];
  const need2 = [
    !head.customer.trim() && "Customer",
    !head.order_date && "Order date",
    groups.some((g) => !g.anchor_a0 && !g.anchor_a) && "A0 or A date",
    groups.some((g) => g.items.some((i) => !i.item_description.trim())) && "Item description",
  ].filter(Boolean) as string[];
  const need = [...need1, ...need2];

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{ order_no: string; project_id: string }>(
        "/apqp/with-order",
        {
          customer: head.customer.trim(),
          order_no: head.order_no.trim() || null,
          order_date: head.order_date,
          planned_delivery_sample: head.planned_delivery_sample || null,
          planned_delivery_batch: head.planned_delivery_batch || null,
          rpd_status: head.rpd_status,
          notes: head.notes || null,
          groups: groups.map((g) => ({
            anchor_a0: g.anchor_a0 || null,
            anchor_a: g.anchor_a || null,
            items: g.items.map((i) => ({
              item_description: i.item_description.trim(),
              bearing_type: i.bearing_type,
              po_qty: i.po_qty || null,
              value: i.value,
            })),
          })),
          enquiry_date: apqp.enquiry_date || null,
          product_name: apqp.product_name.trim(),
          customer_part_no: apqp.customer_part_no || null,
          program_name: apqp.program_name || null,
          application: apqp.application || null,
          supply_condition: apqp.supply_condition || null,
          original_date: apqp.original_date || null,
          ppap_date: apqp.ppap_date || null,
          sample_submission_date: apqp.sample_submission_date || null,
          start_month: apqp.start_month,
          ...(recipients ? { stage_owners: recipients.stage_owners, dept_owners: recipients.dept_owners } : {}),
        },
      );
      navigate(apqpPath({ product_name: apqp.product_name, project_id: res.data.project_id }), { replace: true });
    } catch (err) {
      setError(apiError(err, "Could not create the project."));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[980px] pb-4">
      <div className="rise">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-600 shadow-[0_0_0_4px_var(--color-brand-50)]" />
          <span className="text-[8px] font-extrabold uppercase tracking-[1.4px] text-brand-600">New</span>
        </div>
        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.8px] text-ink-900">Create new project</h1>
        <p className="mt-1 text-sm text-ink-500">
          Fill this one page from top to bottom: APQP Timeline, then Tracking, then Emails. Both are created
          together under the same product name.
        </p>
        <p className="mt-1 text-[13px] text-ink-500">
          Boxes marked <span className="font-semibold text-brand-600">*</span> must be filled. Everything else can be added later.
        </p>
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* ── 1. APQP TIMELINE ── */}
      <Section n={1} title="APQP Timeline" hint="Product details and the timing plan" todo={need1.length}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label}>Product name<Req /></label>
            <input value={apqp.product_name} onChange={(e) => setA("product_name", e.target.value)}
              placeholder="e.g. Thrust washer" className={field} />
            <p className={help}>The APQP Timeline and Tracking are shown under this name.</p>
          </div>
          <div>
            <label className={label}>Customer part no.</label>
            <input value={apqp.customer_part_no} onChange={(e) => setA("customer_part_no", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Program name</label>
            <input value={apqp.program_name} onChange={(e) => setA("program_name", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Application</label>
            <input value={apqp.application} onChange={(e) => setA("application", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Supply condition</label>
            <input value={apqp.supply_condition} onChange={(e) => setA("supply_condition", e.target.value)} className={field} />
          </div>

          <p className="border-t border-dashed border-line pt-3 text-[11px] font-bold uppercase tracking-[0.8px] text-ink-400 sm:col-span-2 lg:col-span-3">
            Timing plan
          </p>
          <div>
            <label className={label}>Start month<Req /></label>
            <DateInput type="month" value={apqp.start_month} onChange={(e) => setA("start_month", e.target.value)} className={field} />
            <p className={help}>First of the 5 months on the plan.</p>
          </div>
          <div>
            <label className={label}>Enquiry date</label>
            <DateInput value={apqp.enquiry_date} onChange={(e) => setA("enquiry_date", e.target.value)} className={field} />
            <p className={help}>Plan date of 0.1 Receipt of Enquiry.</p>
          </div>
          <div>
            <label className={label}>Original date</label>
            <DateInput value={apqp.original_date} onChange={(e) => setA("original_date", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>PPAP date</label>
            <DateInput value={apqp.ppap_date} onChange={(e) => setA("ppap_date", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Sample submission date</label>
            <DateInput value={apqp.sample_submission_date} onChange={(e) => setA("sample_submission_date", e.target.value)} className={field} />
          </div>
        </div>
      </Section>

      {/* ── 2. TRACKING ── */}
      <Section n={2} title="Tracking" hint="Order details, items and the stage dates" todo={need2.length}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label}>Order no. with product name</label>
            <input value={head.order_no} onChange={(e) => setH("order_no", e.target.value)} className={field} />
            <p className={help}>Leave blank to use the product name from section 1.</p>
          </div>
          <div>
            <label className={label}>Customer<Req /></label>
            <input value={head.customer} onChange={(e) => setH("customer", e.target.value)} placeholder="e.g. Rollon Srl" className={field} />
          </div>
          <div>
            <label className={label}>Order date<Req /></label>
            <DateInput value={head.order_date} onChange={(e) => setH("order_date", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Sample delivery</label>
            <DateInput value={head.planned_delivery_sample} onChange={(e) => setH("planned_delivery_sample", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Batch delivery</label>
            <DateInput value={head.planned_delivery_batch} onChange={(e) => setH("planned_delivery_batch", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>RPD status</label>
            <select value={head.rpd_status} onChange={(e) => setH("rpd_status", e.target.value)} className={field}>
              {(lookups?.rpd_statuses ?? ["Not received", "Received"]).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label}>Notes</label>
            <textarea value={head.notes} onChange={(e) => setH("notes", e.target.value)} rows={2}
              placeholder="Anything the team should know (optional)" className={`${field} h-auto py-2.5`} />
          </div>

          <p className="border-t border-dashed border-line pt-3 text-[11px] font-bold uppercase tracking-[0.8px] text-ink-400 sm:col-span-2 lg:col-span-3">
            Items &amp; dates{" "}
            <span className="font-medium normal-case tracking-normal">- give one of the two dates, the other is worked out</span>
          </p>
        </div>

        <div className="mt-3 space-y-3">
          {groups.map((g, gi) => (
            <div key={gi} className="overflow-hidden rounded-xl border border-line">
              <div className="flex items-center justify-between border-b border-line bg-slate-50 px-3 py-2">
                <b className="text-[13px] text-ink-900">Schedule group {gi + 1}</b>
                {groups.length > 1 && (
                  <button type="button" onClick={() => setGroups((gs) => gs.filter((_, i) => i !== gi))}
                    className="text-[13px] text-red-700 hover:underline">Remove group</button>
                )}
              </div>
              <div className="p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className={label}>Sample study - expected sample from customer (A0)</label>
                    <DateInput value={g.anchor_a0} onChange={(e) => setGroup(gi, { anchor_a0: e.target.value })} className={field} />
                  </div>
                  <div>
                    <label className={label}>Proposal drawing to customer (A)</label>
                    <DateInput value={g.anchor_a} onChange={(e) => setGroup(gi, { anchor_a: e.target.value })} className={field} />
                  </div>
                </div>

                <div className="mt-2">
                  {g.items.map((it, ii) => (
                    <div key={ii} className="grid grid-cols-2 items-end gap-2 border-t border-dashed border-line py-2 first:border-t-0 md:grid-cols-[2fr_1.2fr_1fr_1fr_32px]">
                      <div className="col-span-2 md:col-span-1">
                        <label className="mb-0.5 block text-xs font-semibold text-ink-500">Description<Req /></label>
                        <input value={it.item_description} onChange={(e) => setItem(gi, ii, { item_description: e.target.value })}
                          placeholder="e.g. AXZ 5,5917" className={field} />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-semibold text-ink-500">Bearing type</label>
                        <select value={it.bearing_type} onChange={(e) => setItem(gi, ii, { bearing_type: e.target.value })} className={field}>
                          <option value="">—</option>
                          {(lookups?.bearing_types ?? []).map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-semibold text-ink-500">PO qty</label>
                        <input value={it.po_qty} onChange={(e) => setItem(gi, ii, { po_qty: e.target.value })} placeholder="2000" className={field} />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-semibold text-ink-500">Value</label>
                        <input type="number" step="0.01" value={it.value ?? ""}
                          onChange={(e) => setItem(gi, ii, { value: e.target.value === "" ? null : Number(e.target.value) })}
                          className={field} />
                      </div>
                      <div className="flex justify-end md:block">
                        {g.items.length > 1 && (
                          <button type="button" title="Remove item"
                            onClick={() => setGroups((gs) => gs.map((gg, i) => (i === gi ? { ...gg, items: gg.items.filter((_, j) => j !== ii) } : gg)))}
                            className="h-9 w-8 rounded-md text-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600">×</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button"
                  onClick={() => setGroups((gs) => gs.map((gg, i) => (i === gi ? { ...gg, items: [...gg.items, emptyItem()] } : gg)))}
                  className="text-sm font-semibold text-brand-600 hover:underline">+ Add item</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setGroups((gs) => [...gs, emptyGroup()])}
            className="w-full rounded-xl border border-dashed border-slate-300 bg-white py-2 text-sm font-semibold text-ink-700 hover:border-brand-600 hover:bg-brand-50 hover:text-brand-600">
            + Add another schedule group
          </button>
        </div>
      </Section>

      {/* ── 3. EMAILS ── */}
      <Section n={3} title="Emails" hint={`Who is notified - filled in from the ${recOptions?.defaults_from ?? "last project"}`} todo={0}>
        <p className="mb-3 rounded-md bg-brand-50 px-3 py-2 text-xs text-ink-700">
          Change only what is different for this project. You can also change it later with the <b>Emails</b> button
          on the project or the order.
        </p>
        {recError ? (
          <p className="text-sm text-red-700">{recError}</p>
        ) : !recOptions || !recipients ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : (
          <RecipientsEditor options={recOptions} value={recipients} onChange={setRecipients} layout="cards" />
        )}
      </Section>

      {/* ── Create bar, always visible at the bottom ── */}
      <div className="sticky bottom-0 z-10 -mx-1 mt-4 border-t border-line bg-white/95 px-4 py-2.5 backdrop-blur sm:rounded-t-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="hidden text-[13px] text-ink-500 sm:block">
            {ready
              ? <span className="font-semibold text-ok">✓ Everything needed is filled - ready to create</span>
              : <>Still to fill: <b className="text-brand-600">{need.join(", ")}</b></>}
          </p>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => navigate(-1)}
              className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-ink-700 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={submit} disabled={!ready || busy}
              className="h-9 rounded-md bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-40">
              {busy ? "Creating..." : "Create project"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
