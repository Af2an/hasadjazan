import { useEffect, useState } from "react";
import { css } from "../lib/css.js";
import { getJson, toNumber, normPhone } from "../lib/api.js";
import { fmtDate, kg, sar, today, toLogin, primary, ghost, small, danger, input, card, label, grid, muted, errorText, Select } from "../lib/admin-ui.jsx";
import { SPECIES, SOURCES, SHOP_SOURCE, KIND, AVAILABILITY, SUPPLIER_ORDER_STATUS, NEED_STATUS, PAY_METHODS, DELIVERY_TIMES, EXPENSE_CATS, LIMITS, PHONE_RE } from "../../shared/constants.js";
import mark from "../assets/mark.png";

// Reasons the server gives when it refuses an operation.
const REASONS = {
  not_inspected: "افحص الدفعة وسجّل الوزن المقبول أولًا.",
  not_confirmed: "أكّد الطلب أولًا من تبويب الطلبات.",
  batch_exceeded: "الكمية أكبر من المقبول المتبقي في الدفعة.",
  line_exceeded: "الكمية أكبر من المتبقي في هذا الطلب.",
  shop_refused: "هذا المطعم لا يقبل الاستكمال من المحلات.",
  sometimes_undocumented: "المطعم أجاب «أحيانًا»: وثّق الحالات المقبولة في اتفاقه أولًا.",
  species_mismatch: "صنف الدفعة لا يطابق صنف الطلب.",
  cancelled: "الطلب ملغى.",
  above_purchased: "المقبول لا يتجاوز الوزن المشترى.",
  below_allocated: "المقبول أقل مما وُزّع من هذه الدفعة.",
  in_use: "لا يمكن حذف دفعة وُزّع منها شيء.",
  phone_in_use: "هذا الجوال مستخدم في سجل آخر.",
  not_open: "هذا الطلب استُلم أو أُلغي من قبل."
};
const failText = (r) => (!r ? "تعذّر الاتصال." : r.ok ? "" : REASONS[r.data && r.data.error] || (r.status === 400 ? "راجع البيانات." : r.status === 404 ? "تعذّر الحفظ: تأكد من القيم." : "تعذّر تنفيذ العملية."));
const num = (v) => (String(v || "").trim() ? toNumber(v) : NaN);
const round = (n) => Math.round(n * 100) / 100;
const OPEN = ["confirmed", "purchasing", "partial"]; // orders that can receive fish
const PAY = { unpaid: ["غير مدفوع", "#A54B4B"], partial: ["مدفوع جزئيًا", "#7D8A2A"], paid: ["مدفوع", "#2F6666"] };
const badge = (text, color) => <span style={css("font-size:13px;font-weight:700;padding:2px 10px;border-radius:999px;background:#EFF4F0;color:" + color)}>{text}</span>;
const statusColor = { new: "#A54B4B", confirmed: "#2F6666", purchasing: "#7D8A2A", delivered: "#2F6666", partial: "#7D8A2A", cancelled: "#8B9A95" };
const H = ({ children }) => <h2 style={css("margin:6px 0 0;font-size:19px;font-weight:700")}>{children}</h2>;
const lineName = (l) => l.species + (l.spec ? " · " + l.spec : "");
const shopRule = (n) => (n.substitute_answer === "أحيانًا" ? (n.sometimes_cases ? "المحلات: أحيانًا (" + n.sometimes_cases + ")" : "المحلات: أحيانًا، لم تُوثّق الحالات بعد") : "المحلات: " + (n.substitute_answer || (n.accepts_substitute ? "نعم" : "لا")));

/* A small form that keeps its fields, sends them, and shows the server's answer. */
function useForm(initial) {
  const [f, setF] = useState(initial), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: typeof v === "string" ? v : v.target.value })); setMsg(""); };
  const run = async (fn, reset) => {
    if (busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r === undefined) return;
    const t = failText(r);
    setMsg(t);
    if (!t && reset) setF(initial);
  };
  return { f, set, msg, setMsg, busy, run };
}
const DateFilter = ({ dates, value, onChange }) => <div style={css("width:220px")}><Select aria-label="التاريخ" value={value} onChange={onChange} options={dates.map((d) => [d, d])} /></div>;

/* ══ 1. orders ══ */
function NewOrder({ restaurants, act }) {
  const blankLine = () => ({ species: "", spec: "", kg: "" });
  const { f, set, msg, setMsg, busy, run } = useForm({ restaurant: "", date: today(), time: "", location: "", note: "" });
  const [lines, setLines] = useState([blankLine()]);
  const pick = (id) => { set("restaurant")(id); const r = restaurants.find((x) => x.id === id); if (r) set("location")(r.location || [r.city, r.district].filter(Boolean).join(" - ")); };
  const setLine = (i, k) => (ev) => setLines((x) => x.map((y, j) => (j === i ? { ...y, [k]: ev.target.value } : y)));
  const submit = (ev) => {
    ev.preventDefault();
    const ls = lines.map((l) => ({ species: l.species.trim(), spec: l.spec.trim(), kg: num(l.kg) }));
    if (!f.restaurant || !f.time || !f.location.trim() || ls.some((l) => !l.species || !(l.kg > 0))) return setMsg("أكمل المطعم والموعد والموقع، والصنف والكيلو لكل سطر.");
    run(async () => { const r = await act("/api/admin/needs", null, { restaurant_id: f.restaurant, date: f.date, delivery_location: f.location.trim(), delivery_time: f.time, note: f.note.trim(), lines: ls }); if (r && r.ok) setLines([blankLine()]); return r; }, true);
  };
  return (
    <details style={card}>
      <summary style={css("cursor:pointer;font-weight:700;min-height:44px;display:flex;align-items:center")}>+ طلب جديد (بعد الاتفاق مع المطعم)</summary>
      <form onSubmit={submit} style={css("display:flex;flex-direction:column;gap:10px;margin-top:10px")}>
        <div style={grid}>
          <label style={label}>المطعم<Select value={f.restaurant} onChange={pick} options={restaurants.map((r) => [r.id, r.restaurant_name])} /></label>
          <label style={label}>تاريخ التسليم<input type="date" value={f.date} onChange={set("date")} style={input} /></label>
          <label style={label}>موعد التسليم<Select value={f.time} onChange={set("time")} options={DELIVERY_TIMES} /></label>
          <label style={label}>موقع التسليم<input value={f.location} onChange={set("location")} maxLength={LIMITS.location} style={input} /></label>
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{ ...grid, background: "var(--s-F4F7F5, #F4F7F5)", borderRadius: "12px", padding: "8px" }}>
            <label style={label}>الصنف<input list="ops-species" value={l.species} onChange={setLine(i, "species")} maxLength={LIMITS.species} style={input} /></label>
            <label style={label}>الكيلو<input inputMode="decimal" dir="ltr" value={l.kg} onChange={setLine(i, "kg")} style={input} /></label>
            {lines.length > 1 && <button type="button" onClick={() => setLines((x) => x.filter((_, j) => j !== i))} style={{ ...small, ...danger }}>حذف السطر</button>}
          </div>
        ))}
        <datalist id="ops-species">{SPECIES.map((x) => <option key={x} value={x} />)}</datalist>
        <button type="button" onClick={() => setLines((x) => x.concat(blankLine()))} style={{ ...small, alignSelf: "flex-start" }}>+ صنف آخر</button>
        <label style={label}>ملاحظة<input value={f.note} onChange={set("note")} maxLength={LIMITS.note} style={input} /></label>
        {msg && <p role="alert" style={errorText}>{msg}</p>}
        <button type="submit" disabled={busy} style={{ ...primary, alignSelf: "flex-start" }}>حفظ الطلب</button>
      </form>
    </details>
  );
}

function OrderCard({ n, act }) {
  const { f, set, msg, busy, run } = useForm({ status: n.status, fee: n.service_fee == null ? "" : String(n.service_fee), reason: n.cancel_reason || "" });
  const save = (ev) => {
    ev.preventDefault();
    run(() => act("/api/admin/needs/" + n.id + "/update", null, { status: f.status, service_fee: String(f.fee).trim() ? num(f.fee) : null, cancel_reason: f.status === "cancelled" ? f.reason.trim() : "" }));
  };
  return (
    <article style={{ ...card, display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={css("display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center")}>
        <strong style={css("font-size:17px")}>{n.restaurant_name}</strong>{badge(NEED_STATUS[n.status], statusColor[n.status])}{badge(PAY[n.payment_status][0], PAY[n.payment_status][1])}
        <span dir="ltr" className="mono" style={css("margin-inline-start:auto;font-size:14px;color:#546965")}>{n.phone}</span>
      </div>
      <p style={muted}>التسليم {n.date} · {n.delivery_time} · {n.delivery_location}{n.note ? " · " + n.note : ""}</p>
      <p style={css("margin:0;font-size:15px")}>{n.lines.map((l) => lineName(l) + " " + kg(l.kg)).join("، ")}</p>
      <p style={css("margin:0;font-size:14px;color:" + (n.substitute_answer === "أحيانًا" && !n.sometimes_cases ? "#A54B4B" : "#546965"))}>
        {shopRule(n)} · السداد: {n.payment_terms || "لم يُتفق"}{n.fee_terms ? " · الرسوم: " + n.fee_terms : ""}{n.order_cutoff ? " · يطلب " + n.order_cutoff : ""}{n.delivery_window ? " · التسليم المتفق " + n.delivery_window : ""}{!n.agreed_at ? " · لا يوجد اتفاق مسجّل" : ""}
      </p>
      <form onSubmit={save} style={grid}>
        <label style={label}>حالة الطلب<Select value={f.status} onChange={set("status")} options={Object.entries(NEED_STATUS)} /></label>
        <label style={label}>رسوم الخدمة (ر.س)<input inputMode="decimal" dir="ltr" value={f.fee} onChange={set("fee")} placeholder="حسب الاتفاق" style={input} /></label>
        {f.status === "cancelled" && <label style={label}>سبب الإلغاء<input value={f.reason} onChange={set("reason")} maxLength={200} style={input} /></label>}
        <button type="submit" disabled={busy} style={primary}>حفظ</button>
      </form>
      {msg && <p role="alert" style={errorText}>{msg === "راجع البيانات." && f.status === "cancelled" ? "اكتب سبب الإلغاء." : msg}</p>}
      {n.cancel_reason && <p style={css("margin:0;font-size:14px;color:#A54B4B")}>سبب الإلغاء: {n.cancel_reason}</p>}
      <p style={css("margin:0;font-size:13px;color:#8B9A95")}>{n.events.map((e) => NEED_STATUS[e.status] + " " + fmtDate(e.at)).join(" ← ")}</p>
    </article>
  );
}

export function Orders({ needs, restaurants, act }) {
  const dates = [...new Set(needs.map((n) => n.date))].sort();
  const [date, setDate] = useState("");
  const shown = needs.filter((n) => !date || n.date === date);
  return (
    <div style={css("display:flex;flex-direction:column;gap:12px")}>
      <div style={css("display:flex;flex-wrap:wrap;gap:10px;align-items:center")}><H>الطلبات</H><DateFilter dates={dates} value={date} onChange={setDate} /></div>
      <p style={muted}>الطلب لا يُنشأ من التسجيل تلقائيًا: أنشئه بعد الاتفاق مع المطعم، ثم أكّده ليظهر في الشراء والتوزيع.</p>
      <NewOrder restaurants={restaurants.filter((r) => r.trial_interest !== false)} act={act} />
      {shown.map((n) => <OrderCard key={n.id + n.status + n.service_fee + n.cancel_reason} n={n} act={act} />)}
      {needs.length === 0 && <p style={{ ...card, ...muted, textAlign: "center" }}>لا توجد طلبات بعد.</p>}
    </div>
  );
}

/* ══ 2. purchase and distribution ══ */
function Inspect({ b, act }) {
  const { f, set, msg, busy, run } = useForm({ kg: b.accepted_kg == null ? String(b.purchased_kg) : String(b.accepted_kg), note: b.inspection_note || "" });
  return (
    <form onSubmit={(ev) => { ev.preventDefault(); run(() => act("/api/admin/batches/" + b.id + "/inspect", null, { accepted_kg: num(f.kg), note: f.note.trim() })); }} style={grid}>
      <label style={label}>المقبول بالفحص (كجم)<input inputMode="decimal" dir="ltr" value={f.kg} onChange={set("kg")} style={input} /></label>
      <label style={label}>ملاحظة الفحص<input value={f.note} onChange={set("note")} maxLength={LIMITS.note} style={input} /></label>
      <button type="submit" disabled={busy} style={small}>{b.accepted_kg == null ? "سجّل الفحص" : "عدّل الفحص"}</button>
      {msg && <p role="alert" style={errorText}>{msg}</p>}
    </form>
  );
}

function Distribute({ b, open, act }) {
  const targets = open.flatMap((n) => n.lines.filter((l) => l.species === b.species && l.kg - l.allocated_kg > 0 && (b.source !== SHOP_SOURCE || n.accepts_substitute === true || (n.substitute_answer === "أحيانًا" && n.sometimes_cases)))
    .map((l) => [l.id, n.restaurant_name + " · " + n.date + " · " + lineName(l) + " · متبقٍ " + kg(round(l.kg - l.allocated_kg))]));
  const { f, set, msg, setMsg, busy, run } = useForm({ line: "", kg: "" });
  if (b.accepted_kg == null || b.available_kg <= 0) return null;
  if (!targets.length) return <p style={muted}>لا يوجد طلب مؤكد يحتاج {b.species}{b.source === SHOP_SOURCE ? " ويقبل المحلات" : ""}.</p>;
  return (
    <form onSubmit={(ev) => { ev.preventDefault(); const k = num(f.kg); if (!f.line || !(k > 0)) return setMsg("اختر الطلب واكتب الكيلو."); run(() => act("/api/admin/allocations", null, { batch_id: b.id, line_id: f.line, kg: k }), true); }} style={grid}>
      <label style={label}>وزّع على<Select value={f.line} onChange={set("line")} options={targets} /></label>
      <label style={label}>الكيلو (متاح {kg(b.available_kg)})<input inputMode="decimal" dir="ltr" value={f.kg} onChange={set("kg")} style={input} /></label>
      <button type="submit" disabled={busy} style={small}>وزّع</button>
      {msg && <p role="alert" style={errorText}>{msg}</p>}
    </form>
  );
}

function Payout({ b, act }) {
  const { f, set, msg, busy, run } = useForm({ amount: b.supplier_paid_amount == null ? String(b.cost_total) : String(b.supplier_paid_amount), date: b.supplier_paid_on || today() });
  const late = b.supplier_due_on && (b.supplier_paid_on ? b.supplier_paid_on > b.supplier_due_on : today() > b.supplier_due_on);
  return (
    <details>
      <summary style={css("cursor:pointer;font-size:14px;color:" + (late ? "#A54B4B" : "#546965"))}>مستحق المورد: {b.supplier_due_on ? "يستحق " + b.supplier_due_on : "بدون موعد"} · {b.supplier_paid_on ? "دُفع " + sar(b.supplier_paid_amount) + " في " + b.supplier_paid_on : "لم يُدفع"}{late ? " · متأخر" : ""}</summary>
      <form onSubmit={(ev) => { ev.preventDefault(); run(() => act("/api/admin/batches/" + b.id + "/payout", null, { amount: num(f.amount), paid_on: f.date })); }} style={{ ...grid, marginTop: "6px" }}>
        <label style={label}>المدفوع للمورد (ر.س)<input inputMode="decimal" dir="ltr" value={f.amount} onChange={set("amount")} style={input} /></label>
        <label style={label}>تاريخ الدفع<input type="date" value={f.date} onChange={set("date")} style={input} /></label>
        <button type="submit" disabled={busy} style={small}>سجّل الدفع للمورد</button>
        {msg && <p role="alert" style={errorText}>{msg}</p>}
      </form>
    </details>
  );
}

function SupplierOrderCard({ x, act }) {
  const { f, set, msg, setMsg, busy, run } = useForm({ date: today(), kg: String(x.kg), cost: x.price_per_kg == null ? "" : String(round(x.kg * x.price_per_kg)), due: "" });
  const receive = (ev) => {
    ev.preventDefault();
    const k = num(f.kg), c = num(f.cost);
    if (!(k > 0) || !(c >= 0)) return setMsg("اكتب الكمية المستلمة وتكلفتها.");
    run(() => act("/api/admin/supplier-orders/" + x.id + "/receive", null, { date: f.date, purchased_kg: k, cost_total: c, supplier_due_on: f.due || null }));
  };
  return (
    <article style={{ ...card, display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={css("display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center")}>
        <strong style={css("font-size:16px")}>{x.supplier_name}</strong><span style={muted}>{x.supplier_kind}</span>
        {badge(SUPPLIER_ORDER_STATUS[x.status], x.status === "requested" ? "#7D8A2A" : x.status === "received" ? "#2F6666" : "#8B9A95")}
        <a href={"https://wa.me/966" + String(x.supplier_phone || "").replace(/^0/, "")} target="_blank" rel="noopener noreferrer" style={{ ...small, marginInlineStart: "auto", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>واتساب</a>
      </div>
      <p style={css("margin:0;font-size:15px")}>{x.date} · {x.species} · {kg(x.kg)}{x.price_per_kg != null ? " · " + sar(x.price_per_kg) + "/كجم" : ""}{x.note ? " · " + x.note : ""}</p>
      {x.status === "requested" && (
        <form onSubmit={receive} style={grid}>
          <label style={label}>تاريخ الاستلام<input type="date" value={f.date} onChange={set("date")} style={input} /></label>
          <label style={label}>الكمية المستلمة (كجم)<input inputMode="decimal" dir="ltr" value={f.kg} onChange={set("kg")} style={input} /></label>
          <label style={label}>التكلفة الفعلية (ر.س)<input inputMode="decimal" dir="ltr" value={f.cost} onChange={set("cost")} style={input} /></label>
          <label style={label}>موعد دفع المورد<input type="date" value={f.due} onChange={set("due")} style={input} /></label>
          <button type="submit" disabled={busy} style={small}>استلام ← يصير شراء</button>
          <button type="button" onClick={() => act("/api/admin/supplier-orders/" + x.id + "/cancel", "إلغاء هذا الطلب من المورد؟")} style={{ ...small, ...danger }}>إلغاء</button>
          {msg && <p role="alert" style={errorText}>{msg}</p>}
        </form>
      )}
      {x.status === "received" && <p style={css("margin:0;font-size:14px;color:#2F6666")}>صار شراءً: افحصه ووزّعه من صفحة الشراء والتوزيع.</p>}
    </article>
  );
}

export function Suppliers({ suppliers, orders, act }) {
  const s = useForm({ name: "", phone: "", kind: "", species: "", location: "", time: "", note: "" });
  const o = useForm({ supplier: "", date: today(), species: "", kg: "", price: "", note: "" });
  const addSupplier = (ev) => {
    ev.preventDefault();
    const f = s.f, phone = normPhone(f.phone);
    if (!f.name.trim() || !f.kind) return s.setMsg("اكتب الاسم واختر النشاط.");
    if (!PHONE_RE.test(phone)) return s.setMsg("الجوال يبدأ بـ 05 ويتكون من 10 أرقام.");
    s.run(() => act("/api/admin/suppliers", null, { name: f.name.trim(), phone, kind: f.kind, species: f.species.split(/[،,]/).map((x) => x.trim()).filter(Boolean), pickup_location: f.location.trim(), availability_time: f.time || null, note: f.note.trim() }), true);
  };
  const addOrder = (ev) => {
    ev.preventDefault();
    const f = o.f, k = num(f.kg), p = String(f.price).trim() ? num(f.price) : null;
    if (!f.supplier || !f.species.trim() || !(k > 0) || (p != null && !(p >= 0))) return o.setMsg("اختر المورد واكتب الصنف والكمية.");
    o.run(() => act("/api/admin/supplier-orders", null, { supplier_id: f.supplier, date: f.date, species: f.species.trim(), kg: k, price_per_kg: p, note: f.note.trim() }), true);
  };
  const open = orders.filter((x) => x.status === "requested");
  return (
    <div style={css("display:flex;flex-direction:column;gap:12px")}>
      <H>الموردون</H>
      <p style={muted}>داخلي فقط. اطلب من المورد هنا، ولما توصل الكمية اضغط «استلام» فتصير شراءً جاهزًا للفحص والتوزيع.</p>
      <form onSubmit={addOrder} style={{ ...card, display: "flex", flexDirection: "column", gap: "10px" }}>
        <strong>طلب من مورد</strong>
        <div style={grid}>
          <label style={label}>المورد<Select value={o.f.supplier} onChange={o.set("supplier")} options={suppliers.map((x) => [x.id, x.name + " · " + x.kind])} /></label>
          <label style={label}>التاريخ<input type="date" value={o.f.date} onChange={o.set("date")} style={input} /></label>
          <label style={label}>الصنف<input list="ops-species" value={o.f.species} onChange={o.set("species")} maxLength={LIMITS.species} style={input} /></label>
          <label style={label}>الكمية (كجم)<input inputMode="decimal" dir="ltr" value={o.f.kg} onChange={o.set("kg")} style={input} /></label>
          <label style={label}>السعر المتفق للكيلو (اختياري)<input inputMode="decimal" dir="ltr" value={o.f.price} onChange={o.set("price")} style={input} /></label>
          <label style={label}>ملاحظة<input value={o.f.note} onChange={o.set("note")} maxLength={LIMITS.note} style={input} /></label>
        </div>
        <datalist id="ops-species">{SPECIES.map((x) => <option key={x} value={x} />)}</datalist>
        {!suppliers.length && <p style={muted}>أضف المورد أولًا من الأسفل.</p>}
        {o.msg && <p role="alert" style={errorText}>{o.msg}</p>}
        <button type="submit" disabled={o.busy || !suppliers.length} style={{ ...primary, alignSelf: "flex-start" }}>حفظ الطلب</button>
      </form>
      <strong>طلبات مفتوحة ({open.length})</strong>
      {open.map((x) => <SupplierOrderCard key={x.id} x={x} act={act} />)}
      {orders.length > open.length && (
        <details style={card}>
          <summary style={css("cursor:pointer;font-weight:700;min-height:40px;display:flex;align-items:center")}>طلبات سابقة ({orders.length - open.length})</summary>
          {orders.filter((x) => x.status !== "requested").map((x) => <p key={x.id} style={css("margin:6px 0 0;font-size:15px")}>{x.date} · {x.supplier_name} · {x.species} {kg(x.kg)} · {SUPPLIER_ORDER_STATUS[x.status]}</p>)}
        </details>
      )}
      <details style={card}>
        <summary style={css("cursor:pointer;font-weight:700;min-height:44px;display:flex;align-items:center")}>قائمة الموردين ({suppliers.length}) وإضافة مورد</summary>
        <form onSubmit={addSupplier} style={css("display:flex;flex-direction:column;gap:8px;margin-top:10px")}>
          <div style={grid}>
            <label style={label}>الاسم<input value={s.f.name} onChange={s.set("name")} maxLength={LIMITS.name} style={input} /></label>
            <label style={label}>الجوال<input dir="ltr" inputMode="tel" value={s.f.phone} onChange={s.set("phone")} maxLength={16} style={input} /></label>
            <label style={label}>النشاط<Select value={s.f.kind} onChange={s.set("kind")} options={KIND} /></label>
            <label style={label}>الأصناف (بفاصلة)<input value={s.f.species} onChange={s.set("species")} maxLength={400} style={input} /></label>
            <label style={label}>موقع الاستلام<input value={s.f.location} onChange={s.set("location")} maxLength={LIMITS.location} style={input} /></label>
            <label style={label}>وقت التوفر<Select value={s.f.time} onChange={s.set("time")} options={AVAILABILITY} /></label>
          </div>
          {s.msg && <p role="alert" style={errorText}>{s.msg}</p>}
          <button type="submit" disabled={s.busy} style={{ ...small, alignSelf: "flex-start" }}>حفظ المورد</button>
        </form>
        {suppliers.map((x) => (
          <div key={x.id} style={css("display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:8px 0;border-top:1px solid #EDF2EE")}>
            <strong>{x.name}</strong><span>{x.kind}</span><span dir="ltr" className="mono" style={muted}>{x.phone}</span>
            <span style={muted}>{[(x.species || []).join("، "), x.pickup_location, x.availability_time].filter(Boolean).join(" · ")}</span>
            <button type="button" onClick={() => act("/api/admin/leads/fish/" + x.id + "/delete", "حذف هذا المورد وطلباته؟")} style={{ ...small, ...danger, marginInlineStart: "auto" }}>حذف</button>
          </div>
        ))}
      </details>
    </div>
  );
}

/* What the team shows fishers at the market, on the phone or printed: species and kilos still to buy.
   No restaurant names, no prices, no phone numbers. */
function MarketBoard({ rows, date, onClose }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="المطلوب للصيادين" data-print="1" style={css("position:fixed;inset:0;z-index:50;background:#FFFFFF;color:#16211F;overflow:auto;padding:20px 16px 32px")}>
      <div data-noprint="1" style={css("display:flex;gap:8px;justify-content:flex-end;margin-bottom:8px")}>
        <button type="button" onClick={() => window.print()} style={small}>طباعة</button>
        <button type="button" onClick={onClose} style={{ ...small, background: "var(--s-16211F, #16211F)", color: "#FFFFFF" }}>إغلاق</button>
      </div>
      <div style={css("display:flex;align-items:center;gap:12px")}><img src={mark} alt="" style={css("height:56px")} /><h2 style={css("margin:0;font-size:clamp(28px,8vw,44px);font-weight:700")}>نحتاج{date ? " ليوم " + date : ""}</h2></div>
      {rows.length === 0 ? <p style={css("font-size:24px;margin-top:24px")}>اكتمل المطلوب، شكرًا لكم.</p> : (
        <div style={css("display:flex;flex-direction:column;gap:10px;margin-top:20px")}>
          {rows.map(([name, k]) => (
            <div key={name} style={css("display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:2px solid #DCE5DF;padding:10px 4px")}>
              <strong style={css("font-size:clamp(28px,8vw,44px);font-weight:700")}>{name}</strong>
              <span style={css("font-size:clamp(30px,9vw,48px);font-weight:700;color:#2F6666;white-space:nowrap")}>{k + " كجم"}</span>
            </div>
          ))}
        </div>
      )}
      <p style={css("margin:20px 0 0;font-size:20px;color:#546965")}>عندك منها؟ كلمنا الحين، والفحص والوزن عند الاستلام.</p>
    </div>
  );
}

export function Purchase({ needs, batches, suppliers, act }) {
  const [board, setBoard] = useState(false);
  const open = needs.filter((n) => OPEN.includes(n.status));
  const dates = [...new Set(open.map((n) => n.date))].sort();
  const [date, setDate] = useState("");
  const day = open.filter((n) => !date || n.date === date);
  // the confirmed need, summed per species and size, with what is still to buy
  const totals = {};
  for (const n of day) for (const l of n.lines) {
    const k = lineName(l);
    totals[k] = totals[k] || { kg: 0, allocated: 0 };
    totals[k].kg += l.kg; totals[k].allocated += l.allocated_kg;
  }
  const boardRows = Object.entries(day.flatMap((n) => n.lines).reduce((m, l) => { const left = round(l.kg - l.allocated_kg); if (left > 0) m[l.species] = round((m[l.species] || 0) + left); return m; }, {}));
  const { f, set, msg, setMsg, busy, run } = useForm({ date: today(), source: "", supplier: "", species: "", spec: "", kg: "", cost: "", note: "", due: "" });
  const add = (ev) => {
    ev.preventDefault();
    const k = num(f.kg), c = num(f.cost);
    if (!f.source || !f.species.trim() || !(k > 0) || !(c >= 0)) return setMsg("أكمل المصدر والصنف والكمية والتكلفة.");
    run(() => act("/api/admin/batches", null, { date: f.date, source: f.source, supplier_id: f.supplier || null, species: f.species.trim(), spec: f.spec.trim(), purchased_kg: k, cost_total: c, note: f.note.trim(), supplier_due_on: f.due || null }), true);
  };
  return (
    <div style={css("display:flex;flex-direction:column;gap:12px")}>
      {board && <MarketBoard rows={boardRows} date={date} onClose={() => setBoard(false)} />}
      <div style={css("display:flex;flex-wrap:wrap;gap:10px;align-items:center")}><H>الشراء والتوزيع</H><DateFilter dates={dates} value={date} onChange={setDate} /></div>
      <div style={card}>
        <div style={css("display:flex;flex-wrap:wrap;gap:8px;align-items:center")}><strong>المطلوب المؤكد {date ? "ليوم " + date : "(كل التواريخ)"}</strong>{Object.keys(totals).length > 0 && <button type="button" onClick={() => setBoard(true)} style={{ ...primary, marginInlineStart: "auto", minHeight: "40px", padding: "6px 16px" }}>عرض للصيادين</button>}</div>
        {Object.keys(totals).length === 0 ? <p style={{ ...muted, marginTop: "6px" }}>لا توجد طلبات مؤكدة.</p> : (
          <table style={css("width:100%;border-collapse:collapse;margin-top:8px;font-size:15px")}>
            <thead><tr>{["الصنف", "المطلوب", "الموزّع", "المتبقي للشراء"].map((h) => <th key={h} style={css("text-align:start;padding:6px;color:#546965;font-weight:600;border-bottom:1px solid #DCE5DF")}>{h}</th>)}</tr></thead>
            <tbody>{Object.entries(totals).map(([k, t]) => <tr key={k}><td style={css("padding:6px")}>{k}</td><td>{kg(t.kg)}</td><td>{kg(t.allocated)}</td><td><strong>{kg(Math.max(round(t.kg - t.allocated), 0))}</strong></td></tr>)}</tbody>
          </table>
        )}
      </div>
      <details style={card}>
        <summary style={css("cursor:pointer;font-weight:700;min-height:44px;display:flex;align-items:center")}>+ تسجيل شراء</summary>
        <form onSubmit={add} style={css("display:flex;flex-direction:column;gap:10px;margin-top:10px")}>
          <div style={grid}>
            <label style={label}>التاريخ<input type="date" value={f.date} onChange={set("date")} style={input} /></label>
            <label style={label}>المصدر<Select value={f.source} onChange={set("source")} options={SOURCES} /></label>
            <label style={label}>المورد (اختياري)<Select value={f.supplier} onChange={set("supplier")} options={suppliers.map((s) => [s.id, s.name + " · " + s.kind])} /></label>
            <label style={label}>الصنف<input list="ops-species" value={f.species} onChange={set("species")} maxLength={LIMITS.species} style={input} /></label>
            <label style={label}>المقاس (اختياري)<input value={f.spec} onChange={set("spec")} maxLength={LIMITS.spec} style={input} /></label>
            <label style={label}>الكمية المشتراة (كجم)<input inputMode="decimal" dir="ltr" value={f.kg} onChange={set("kg")} style={input} /></label>
            <label style={label}>تكلفة الشراء الفعلية (ر.س)<input inputMode="decimal" dir="ltr" value={f.cost} onChange={set("cost")} style={input} /></label>
            <label style={label}>موعد استحقاق المورد (اختياري)<input type="date" value={f.due} onChange={set("due")} style={input} /></label>
          </div>
          <datalist id="ops-species">{SPECIES.map((x) => <option key={x} value={x} />)}</datalist>
          {msg && <p role="alert" style={errorText}>{msg}</p>}
          <button type="submit" disabled={busy} style={{ ...primary, alignSelf: "flex-start" }}>حفظ الشراء</button>
        </form>
      </details>
      {batches.map((b) => (
        <article key={b.id + b.accepted_kg + b.allocated_kg + b.supplier_paid_on} style={{ ...card, display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={css("display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline")}>
            <strong>{b.species}{b.spec ? " · " + b.spec : ""}</strong>{b.accepted_kg == null && badge("بانتظار الفحص", "#A54B4B")}<span>{b.date} · {b.source}{b.supplier_name ? " · " + b.supplier_name : ""}</span>
            <button type="button" onClick={async () => { const r = await act("/api/admin/batches/" + b.id + "/delete", "حذف هذا الشراء؟"); if (r && !r.ok) alert(failText(r)); }} style={{ ...small, ...danger, marginInlineStart: "auto" }}>حذف</button>
          </div>
          <p style={css("margin:0;font-size:15px")}>مشترى {kg(b.purchased_kg)} بـ {sar(b.cost_total)} ({sar(b.cost_total / b.purchased_kg)}/كجم) · مقبول {b.accepted_kg == null ? "لم يُفحص" : kg(b.accepted_kg)} · مرفوض {b.accepted_kg == null ? "—" : kg(round(b.purchased_kg - b.accepted_kg))} · موزّع {kg(b.allocated_kg)} · <strong>متبقٍ {kg(b.available_kg)}</strong></p>
          <Inspect b={b} act={act} />
          <Distribute b={b} open={open} act={act} />
          <Payout b={b} act={act} />
        </article>
      ))}
    </div>
  );
}

/* ══ 3. delivery and collection ══ */
function Deliver({ a, act }) {
  // now, in Riyadh time, as a datetime-local value
  const nowLocal = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 16);
  const { f, set, msg, busy, run } = useForm({ kg: String(a.kg), rejected: "0", note: "", at: nowLocal() });
  if (a.delivered_kg != null) return <p style={css("margin:0;font-size:14px;color:#2F6666")}>{a.source} · مسلّم {kg(a.delivered_kg)}{a.rejected_kg ? " · مرفوض عند الاستلام " + kg(a.rejected_kg) : ""} · {fmtDate(a.delivered_at)}{a.delivery_note ? " · " + a.delivery_note : ""}</p>;
  return (
    <form onSubmit={(ev) => { ev.preventDefault(); run(() => act("/api/admin/allocations/" + a.id + "/deliver", null, { delivered_kg: num(f.kg), rejected_kg: num(f.rejected || "0"), note: f.note.trim(), delivered_at: f.at || null })); }} style={{ ...grid, borderTop: "1px dashed #DCE5DF", paddingTop: "6px" }}>
      <span style={css("font-size:14px")}>{a.source} · {a.purchase_date} · موزّع {kg(a.kg)}</span>
      <label style={label}>المسلّم (كجم)<input inputMode="decimal" dir="ltr" value={f.kg} onChange={set("kg")} style={input} /></label>
      <label style={label}>مرفوض عند الاستلام<input inputMode="decimal" dir="ltr" value={f.rejected} onChange={set("rejected")} style={input} /></label>
      <label style={label}>وقت التسليم الفعلي<input type="datetime-local" value={f.at} onChange={set("at")} style={input} /></label>
      <label style={label}>ملاحظة<input value={f.note} onChange={set("note")} maxLength={200} style={input} /></label>
      <button type="submit" disabled={busy} style={small}>سجّل التسليم</button>
      <button type="button" onClick={() => act("/api/admin/allocations/" + a.id + "/delete", "إلغاء هذا التوزيع؟")} style={{ ...small, ...danger }}>إلغاء التوزيع</button>
      {msg && <p role="alert" style={errorText}>{msg === "تعذّر الحفظ: تأكد من القيم." ? "المسلّم والمرفوض معًا لا يتجاوزان الموزّع." : msg}</p>}
    </form>
  );
}

/* The statement handed to the restaurant: actual purchase cost per source, the fee, paid and remaining. */
function Statement({ n }) {
  const rows = n.lines.flatMap((l) => l.allocations.map((a) => ({ name: lineName(l), source: a.source, kg: a.delivered_kg ?? a.kg, cost: round((a.delivered_kg ?? a.kg) * a.cost_per_kg) })));
  return (
    <div data-print="1" style={css("display:none")} className="print-only">
      <div style={css("display:flex;align-items:center;gap:12px;margin-bottom:12px")}><img src={mark} alt="" style={css("height:44px")} /><strong style={css("font-size:22px;margin-inline-start:auto")}>كشف طلب</strong></div>
      <p style={css("margin:0")}>المطعم: <strong>{n.restaurant_name}</strong> · تاريخ التسليم: <strong>{n.date}</strong></p>
      <table style={css("width:100%;border-collapse:collapse;margin-top:12px;font-size:15px")}>
        <thead><tr>{["الصنف", "المصدر", "الوزن المسلّم", "تكلفة الشراء الفعلية"].map((h) => <th key={h} style={css("text-align:start;border-bottom:1px solid #16211F;padding:6px")}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td style={css("padding:6px")}>{r.name}</td><td>{r.source}</td><td>{kg(r.kg)}</td><td>{sar(r.cost)}</td></tr>)}</tbody>
      </table>
      <p style={css("margin:12px 0 0")}>تكلفة السمك (سعر الشراء كما هو): <strong>{sar(n.purchase_cost)}</strong></p>
      <p style={css("margin:4px 0 0")}>رسوم الخدمة: <strong>{sar(n.service_fee || 0)}</strong></p>
      <p style={css("margin:4px 0 0;font-size:18px")}>الإجمالي المستحق: <strong>{sar(n.due)}</strong> · المدفوع: {sar(n.collected)} · المتبقي: <strong>{sar(Math.max(n.due - n.collected, 0))}</strong></p>
      {n.rejected_kg > 0 && <p style={css("margin:4px 0 0")}>مرفوض عند الاستلام: {kg(n.rejected_kg)} (غير محسوب)</p>}
      <p style={css("margin:16px 0 0;font-size:13px")}>هذا كشف طلب وليس فاتورة ضريبية.</p>
    </div>
  );
}

function DeliveryCard({ n, act, onPrint, printing }) {
  const pay = useForm({ amount: "", method: "", date: today() });
  const remaining = Math.max(round(n.due - n.collected), 0);
  return (
    <article {...(printing ? { "data-printing": "1" } : {})} style={{ ...card, display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={css("display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center")}>
        <strong style={css("font-size:17px")}>{n.restaurant_name}</strong>{badge(NEED_STATUS[n.status], statusColor[n.status])}{badge(PAY[n.payment_status][0], PAY[n.payment_status][1])}
        <button type="button" onClick={onPrint} style={{ ...small, marginInlineStart: "auto" }}>طباعة الكشف</button>
      </div>
      <p style={muted}>التسليم {n.date} · {n.delivery_time}{n.delivery_window ? " (المتفق " + n.delivery_window + ")" : ""} · السداد: {n.payment_terms || "لم يُتفق"}</p>
      {n.lines.map((l) => (
        <div key={l.id} style={css("background:#FBFCFB;border:1px solid #EDF2EE;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px")}>
          <div style={css("display:flex;flex-wrap:wrap;gap:4px 14px;font-size:15px")}><strong>{lineName(l)}</strong><span>مطلوب {kg(l.kg)}</span><span>مسلّم {kg(l.delivered_kg)}</span>{l.kg - l.delivered_kg > 0 && <span style={css("color:#A54B4B")}>نقص {kg(round(l.kg - l.delivered_kg))}</span>}</div>
          {l.allocations.map((a) => <Deliver key={a.id + a.delivered_kg} a={a} act={act} />)}
          {!l.allocations.length && <p style={muted}>لم يُوزّع عليه شيء بعد.</p>}
        </div>
      ))}
      <p style={css("margin:0;font-size:15px")}>تكلفة السمك {sar(n.purchase_cost)} + رسوم {sar(n.service_fee || 0)} = <strong>المستحق {sar(n.due)}</strong> · المدفوع {sar(n.collected)} · <strong style={css("color:" + (remaining ? "#A54B4B" : "#2F6666"))}>المتبقي {sar(remaining)}</strong></p>
      {n.payments.map((p) => <div key={p.id} style={css("display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:14px")}><span>{p.paid_on}</span><strong>{sar(p.amount)}</strong><span>{p.method}</span><button type="button" onClick={() => act("/api/admin/payments/" + p.id + "/delete", "حذف هذه الدفعة؟")} style={{ ...small, ...danger, marginInlineStart: "auto" }}>حذف</button></div>)}
      <form onSubmit={(ev) => { ev.preventDefault(); const a = num(pay.f.amount); if (!(a > 0) || !pay.f.method) return pay.setMsg("اكتب المبلغ واختر الطريقة."); pay.run(() => act("/api/admin/needs/" + n.id + "/payments", null, { amount: a, method: pay.f.method, paid_on: pay.f.date, note: "" }), true); }} style={grid}>
        <label style={label}>دفعة (ر.س)<input inputMode="decimal" dir="ltr" value={pay.f.amount} onChange={pay.set("amount")} style={input} /></label>
        <label style={label}>الطريقة<Select value={pay.f.method} onChange={pay.set("method")} options={PAY_METHODS} /></label>
        <label style={label}>التاريخ<input type="date" value={pay.f.date} onChange={pay.set("date")} style={input} /></label>
        <button type="submit" disabled={pay.busy} style={small}>سجّل الدفعة</button>
      </form>
      {pay.msg && <p role="alert" style={errorText}>{pay.msg}</p>}
      {printing && <Statement n={n} />}
    </article>
  );
}

export function Delivery({ needs, act }) {
  const active = needs.filter((n) => n.status !== "new" && n.status !== "cancelled");
  const dates = [...new Set(active.map((n) => n.date))].sort();
  const [date, setDate] = useState("");
  const [printId, setPrintId] = useState(null);
  useEffect(() => {
    if (!printId) return;
    const done = () => setPrintId(null);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 80);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); };
  }, [printId]);
  const shown = active.filter((n) => !date || n.date === date);
  return (
    <div style={css("display:flex;flex-direction:column;gap:12px")}>
      <div data-noprint="1" style={css("display:flex;flex-wrap:wrap;gap:10px;align-items:center")}><H>التسليم والتحصيل</H><DateFilter dates={dates} value={date} onChange={setDate} /></div>
      {shown.map((n) => <DeliveryCard key={n.id} n={n} act={act} printing={printId === n.id} onPrint={() => setPrintId(n.id)} />)}
      {active.length === 0 && <p style={{ ...card, ...muted, textAlign: "center" }}>لا توجد طلبات مؤكدة بعد.</p>}
    </div>
  );
}

/* ══ 4. week summary ══ */
export function Summary({ act }) {
  const [r, setR] = useState(null), [exp, setExp] = useState([]), [log, setLog] = useState([]), [error, setError] = useState("");
  const e = useForm({ date: today(), category: "", amount: "", note: "" });
  const load = async () => {
    try {
      const [a, b, c] = await Promise.all(["/api/admin/report", "/api/admin/expenses", "/api/admin/audit"].map(getJson));
      if ([a, b, c].some((x) => x.status === 401)) return toLogin();
      if (a.ok) setR(a.data); if (b.ok) setExp(b.data); if (c.ok) setLog(c.data);
      if (!a.ok) setError("تعذّر تحميل الملخص.");
    } catch { setError("تعذّر الاتصال."); }
  };
  useEffect(() => { load(); }, []);
  const doAct = async (...args) => { const x = await act(...args); await load(); return x; };
  if (error) return <p role="alert" style={errorText}>{error}</p>;
  if (!r) return <p style={muted}>لحظة…</p>;
  const tile = ([k, v, hint]) => <div key={k} style={css("background:#F4F7F5;border-radius:12px;padding:10px 12px")}><div style={css("font-size:13px;color:#546965")}>{k}</div><strong style={css("font-size:18px")}>{v}</strong>{hint && <div style={css("font-size:12px;color:#8B9A95")}>{hint}</div>}</div>;
  const group = (title, rows) => <div style={card}><strong>{title}</strong><div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,130px),1fr));gap:8px;margin-top:8px")}>{rows.map(tile)}</div></div>;
  return (
    <div data-print="1" style={css("display:flex;flex-direction:column;gap:12px")}>
      <H>ملخص الأسبوع</H>
      <p style={muted}>التسجيلات ليست مبيعات، والتحصيل ليس ربحًا: تكلفة السمك تُمرَّر للمطعم كما هي. ونتيجة أسبوع واحد ليست إثباتًا نهائيًا للجدوى.</p>
      {group("الكميات", [["المطلوب", kg(r.requested_kg)], ["المسلّم", kg(r.delivered_kg)], ["نسبة التغطية", r.coverage_pct + "%"], ["النقص", kg(r.shortage_kg)], ["مرفوض بالفحص", kg(r.rejected_kg)], ["مرفوض عند الاستلام", kg(r.rejected_at_delivery_kg)]])}
      {group("المطاعم والطلبات", [["الطلبات", r.needs], ["الملغاة", r.cancelled], ["مطاعم طلبت", r.restaurants], ["أعادت الطلب", r.reordering_restaurants]])}
      {group("المال", [["تكلفة شراء السمك", sar(r.cost_to_restaurants), "تُحاسب على المطاعم كما هي"], ["رسوم الخدمة", sar(r.service_fees)], ["المستحق على المطاعم", sar(r.due)], ["المحصّل", sar(r.collected)], ["المتبقي", sar(r.outstanding)], ["تكاليف التشغيل", sar(r.operating_costs)], ["الرسوم ناقص التشغيل", sar(r.estimated_margin), "تقدير قبل أي تكاليف أخرى"]])}
      {group("مستحقات الموردين", [["لها موعد", r.supplier_batches], ["دُفعت في وقتها", r.supplier_paid_on_time], ["متأخرة", r.supplier_paid_late], ["لم تُدفع", r.supplier_unpaid]])}
      <div style={card}>
        <strong>تكاليف التشغيل</strong>
        <form onSubmit={(ev) => { ev.preventDefault(); const a = num(e.f.amount); if (!e.f.category || !(a > 0)) return e.setMsg("اختر البند واكتب المبلغ."); e.run(() => doAct("/api/admin/expenses", null, { date: e.f.date, category: e.f.category, amount: a, note: e.f.note.trim() }), true); }} style={{ ...grid, marginTop: "8px" }}>
          <label style={label}>التاريخ<input type="date" value={e.f.date} onChange={e.set("date")} style={input} /></label>
          <label style={label}>البند<Select value={e.f.category} onChange={e.set("category")} options={EXPENSE_CATS} /></label>
          <label style={label}>المبلغ (ر.س)<input inputMode="decimal" dir="ltr" value={e.f.amount} onChange={e.set("amount")} style={input} /></label>
          <label style={label}>ملاحظة<input value={e.f.note} onChange={e.set("note")} maxLength={LIMITS.note} style={input} /></label>
          <button type="submit" disabled={e.busy} style={small}>أضف</button>
        </form>
        {e.msg && <p role="alert" style={errorText}>{e.msg}</p>}
        {exp.map((x) => <div key={x.id} style={css("display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:6px 0;border-top:1px solid #EDF2EE;font-size:15px")}><span>{x.date}</span><strong>{x.category}</strong><span>{sar(x.amount)}</span><span style={muted}>{x.note}</span><button type="button" onClick={() => doAct("/api/admin/expenses/" + x.id + "/delete", "حذف هذا البند؟")} style={{ ...small, ...danger, marginInlineStart: "auto" }}>حذف</button></div>)}
      </div>
      <details style={card}>
        <summary style={css("cursor:pointer;font-weight:700;min-height:44px;display:flex;align-items:center")}>سجل التعديلات ({log.length})</summary>
        {log.map((x, i) => <p key={i} style={css("margin:4px 0 0;font-size:14px")}><span dir="ltr" className="mono" style={muted}>{fmtDate(x.at)}</span> · {x.action}</p>)}
      </details>
      <button type="button" onClick={() => window.print()} style={{ ...ghost, alignSelf: "flex-start" }}>طباعة الملخص</button>
    </div>
  );
}


