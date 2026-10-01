import { useCallback, useEffect, useState } from "react";
import { css } from "../lib/css.js";
import { useTheme, ThemeToggle } from "../lib/theme.jsx";
import { getJson, postJson, toNumber } from "../lib/api.js";
import { SPECIES, LIMITS, PICKUP_LOCATION } from "../../shared/constants.js";
import logo from "../assets/logo-h.png";
import logoWhite from "../assets/logo-h-white.png";

const fmtDate = (d) => { try { return new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return d; } };
const kg = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " كجم";
const yes = (b) => (b ? "نعم" : "لا");
const toLogin = () => window.location.replace("/admin/login");

const pill = (on) => css("min-height:40px;padding:6px 16px;border-radius:999px;border:none;cursor:pointer;font-size:14px;font-weight:" + (on ? 700 : 500) + ";background:" + (on ? "#AEBA3C" : "rgba(255,255,255,0.08)") + ";color:" + (on ? "#16211F" : "#FFFFFF"));
const primary = css("min-height:48px;padding:10px 22px;background:#2F6666;color:#FFFFFF;border:none;border-radius:999px;font-size:15px;font-weight:700;cursor:pointer");
const ghost = css("min-height:44px;padding:8px 18px;background:transparent;border:1px solid #DCE5DF;border-radius:999px;font-size:15px;cursor:pointer;color:#16211F");
const soft = css("min-height:44px;display:inline-flex;align-items:center;padding:8px 18px;background:#EFF4F0;color:#2F6666;border:none;border-radius:999px;font-size:15px;font-weight:700;text-decoration:none;cursor:pointer");
const input = css("min-height:48px;padding:10px 14px;background:#FBFCFB;border:1px solid #DCE5DF;border-radius:14px;font-size:16px;color:#16211F;min-width:0");
const card = css("background:#FFFFFF;border:1px solid #DCE5DF;border-radius:16px;padding:20px");
const th = css("text-align:start;padding:8px 10px;font-size:13px;color:#546965;font-weight:600;border-bottom:1px solid #DCE5DF");
const td = css("padding:10px;border-bottom:1px solid #EDF2EE;font-size:15px");

/* Rows shown in a lead's record: label → value, all rendered as plain text. */
const leadRows = (lead) => (lead.type === "fish"
  ? [["النشاط", lead.kind], ["الاسم", lead.name], ["اسم المحل", lead.shop_name], ["الجوال / واتساب", lead.phone], ["الأصناف", (lead.species || []).join("، ")], ["مستعد للتجربة", yes(lead.trial_interest)], ["التسليم في حراج جازان", lead.delivery_answer], ["إقرار الجودة", lead.quality_accepted ? "موافق" : ""], ["ملاحظة", lead.note]]
  : [["اسم المطعم", lead.restaurant_name], ["اسم المسؤول", lead.contact_name], ["الجوال / واتساب", lead.phone], ["المنطقة", lead.region], ["المدينة", lead.city], ["الاحتياج المعتاد في الطلب", lead.need_range], ["الأصناف", (lead.species || []).join("، ")], ["مستعد للتجربة", yes(lead.trial_interest)], ["ملاحظة", lead.note]]
).filter((r) => r[1] != null && r[1] !== "");

function LeadDialog({ lead, onClose }) {
  const isFish = lead.type === "fish";
  return (
    <>
      <div data-noprint="1" onClick={onClose} style={css("position:fixed;inset:0;z-index:20;background:rgba(22,33,31,0.5)")}></div>
      <section data-print="1" role="dialog" aria-modal="true" aria-label="السجل" style={css("position:fixed;z-index:21;top:5vh;inset-inline:max(16px, calc(50% - 360px));max-height:90vh;overflow:auto;background:#FFFFFF;border-radius:20px;padding:28px;box-shadow:0 20px 60px rgba(22,33,31,0.25)")}>
        <div style={css("display:flex;align-items:center;gap:12px")}>
          <img src={logo} alt="حصاد جازان" className="only-light" style={css("height:32px;width:auto")} /><img src={logoWhite} alt="حصاد جازان" className="only-dark" style={css("height:32px;width:auto")} />
          <span style={css("margin-inline-start:auto;font-size:14px;color:#546965")}>{(isFish ? "صاحب أسماك" : "مطعم") + " · " + fmtDate(lead.created_at)}</span>
        </div>
        <h2 style={css("margin:18px 0 0;font-size:24px;font-weight:700")}>{isFish ? lead.shop_name || lead.name : lead.restaurant_name}</h2>
        <dl style={css("margin:16px 0 0")}>
          {leadRows(lead).map(([k, v]) => (
            <div key={k} style={css("display:grid;grid-template-columns:minmax(120px, 34%) 1fr;gap:12px;padding:12px 0;border-bottom:1px solid #EDF2EE;font-size:15px")}><dt style={css("color:#546965")}>{k}</dt><dd style={css("margin:0;font-weight:600;white-space:pre-line;overflow-wrap:anywhere")}>{v}</dd></div>
          ))}
        </dl>
        <div data-noprint="1" style={css("margin-top:20px;display:flex;flex-wrap:wrap;gap:10px")}>
          <button type="button" onClick={() => window.print()} style={primary}>طباعة / حفظ PDF</button>
          <a href={"https://wa.me/966" + String(lead.phone || "").replace(/^0/, "")} target="_blank" rel="noopener noreferrer" style={soft}>واتساب</a>
          <button type="button" onClick={onClose} style={{ ...ghost, marginInlineStart: "auto" }}>إغلاق</button>
        </div>
      </section>
    </>
  );
}

function DemandForm({ csrf, onCreated, onExpired }) {
  const blankItem = () => ({ species: "", kg: "" });
  const [f, setF] = useState({ title: "", date: "", window: "" });
  const [items, setItems] = useState([blankItem()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setItem = (i, k) => (ev) => setItems((list) => list.map((x, j) => (j === i ? { ...x, [k]: ev.target.value } : x)));

  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const rows = items.map((x) => ({ species: x.species.trim(), required_kg: toNumber(x.kg) })).filter((x) => x.species || x.required_kg);
    const names = rows.map((x) => x.species);
    if (!f.date || !f.window.trim() || !rows.length || rows.some((x) => !x.species || !(x.required_kg > 0)) || new Set(names).size !== names.length) {
      setError("أكمل التاريخ ونافذة الوقت، وصنفًا واحدًا على الأقل بكمية صحيحة، بدون تكرار الصنف.");
      return;
    }
    setBusy(true); setError("");
    const body = { date: f.date, pickup_window: f.window.trim(), items: rows };
    if (f.title.trim()) body.title = f.title.trim();
    try {
      const r = await postJson("/api/admin/demands", body, csrf);
      setBusy(false);
      if (r.status === 401) return onExpired();
      if (!r.ok) return setError("تعذّر إنشاء الاحتياج. راجع البيانات.");
      setF({ title: "", date: "", window: "" }); setItems([blankItem()]);
      onCreated();
    } catch {
      setBusy(false); setError("تعذّر الاتصال.");
    }
  };

  const label = css("display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600;flex:1 1 180px;min-width:0");
  return (
    <form onSubmit={submit} style={{ ...card, display: "flex", flexDirection: "column", gap: "14px" }}>
      <h2 style={css("margin:0;font-size:20px;font-weight:700")}>إنشاء احتياج مجمّع للتجربة</h2>
      <div style={css("display:flex;flex-wrap:wrap;gap:12px")}>
        <label style={label}>التاريخ<input type="date" value={f.date} onChange={(ev) => setF({ ...f, date: ev.target.value })} style={input} /></label>
        <label style={label}>نافذة الوقت<input value={f.window} maxLength={LIMITS.window} placeholder="مثل 5:30 – 6:30 صباحًا" onChange={(ev) => setF({ ...f, window: ev.target.value })} style={input} /></label>
        <label style={label}>مكان الاستلام<input value={PICKUP_LOCATION} readOnly style={{ ...input, background: "var(--s-F4F7F5, #F4F7F5)", color: "var(--t-546965, #546965)" }} /></label>
      </div>
      <label style={label}>العنوان (اختياري)<input value={f.title} maxLength={LIMITS.title} placeholder="احتياج حصاد جازان للتجربة" onChange={(ev) => setF({ ...f, title: ev.target.value })} style={input} /></label>
      <datalist id="ad-species">{SPECIES.map((n) => <option key={n} value={n} />)}</datalist>
      <div style={css("display:flex;flex-direction:column;gap:8px")}>
        {items.map((x, i) => (
          <div key={i} style={css("display:flex;flex-wrap:wrap;gap:8px;align-items:center")}>
            <input list="ad-species" aria-label="الصنف" placeholder="الصنف" value={x.species} maxLength={LIMITS.species} onChange={setItem(i, "species")} style={{ ...input, flex: "2 1 160px" }} />
            <input aria-label="المطلوب بالكيلو" placeholder="المطلوب (كجم)" inputMode="decimal" dir="ltr" value={x.kg} maxLength={9} onChange={setItem(i, "kg")} style={{ ...input, flex: "1 1 120px", textAlign: "right" }} />
            {items.length > 1 && <button type="button" onClick={() => setItems((list) => list.filter((y, j) => j !== i))} style={ghost}>حذف</button>}
          </div>
        ))}
        {items.length < LIMITS.demandItems && <button type="button" onClick={() => setItems((list) => list.concat(blankItem()))} style={{ ...soft, alignSelf: "flex-start" }}>+ صنف</button>}
      </div>
      {error && <p role="alert" style={css("margin:0;font-size:14px;font-weight:700;color:#A54B4B")}>{error}</p>}
      <button type="submit" disabled={busy} style={{ ...primary, alignSelf: "flex-start" }}>{busy ? "لحظة…" : "إنشاء الاحتياج والرابط"}</button>
    </form>
  );
}

function Demand({ d, printing, onPrint, onRevoke, onCount }) {
  const link = window.location.origin + "/trial/" + d.public_token;
  const active = d.status === "active";
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable: the link stays selectable */ } };
  const printAttr = printing ? { "data-print": "1" } : {};

  return (
    <article {...printAttr} style={{ ...card, display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={css("display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px")}>
        <img src={logo} alt="حصاد جازان" className="only-light" style={css("height:28px;width:auto")} /><img src={logoWhite} alt="حصاد جازان" className="only-dark" style={css("height:28px;width:auto")} />
        <h3 style={css("margin:0;font-size:19px;font-weight:700")}>{d.title}</h3>
        <span style={css("padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;" + (active ? "background:#EFF4F0;color:#2F6666" : "background:#F6EDED;color:#A54B4B"))}>{active ? "الرابط فعّال" : "الرابط ملغى"}</span>
      </div>
      <div style={css("display:flex;flex-wrap:wrap;gap:6px 22px;font-size:15px;color:#546965")}>
        <span>التاريخ: <strong style={css("color:#16211F")} dir="ltr">{d.demand_date}</strong></span>
        <span>مكان الاستلام: <strong style={css("color:#16211F")}>{d.pickup_location}</strong></span>
        <span>نافذة الوقت: <strong style={css("color:#16211F")}>{d.pickup_window}</strong></span>
      </div>

      <table style={css("width:100%;border-collapse:collapse")}>
        <thead><tr><th style={th}>الصنف</th><th style={th}>المطلوب</th><th style={th}>المحتسب ضمن التغطية</th><th style={th}>المتبقي</th></tr></thead>
        <tbody>
          {d.items.map((it) => (
            <tr key={it.id}><td style={{ ...td, fontWeight: 700 }}>{it.species}</td><td style={td} dir="ltr">{kg(it.required_kg)}</td><td style={td} dir="ltr">{kg(it.counted_kg)}</td><td style={{ ...td, fontWeight: 700, color: "var(--t-2F6666, #2F6666)" }} dir="ltr">{kg(it.remaining_kg)}</td></tr>
          ))}
        </tbody>
      </table>

      <div data-noprint="1" style={css("display:flex;flex-direction:column;gap:14px")}>
        {active && (
          <div style={css("display:flex;flex-wrap:wrap;align-items:center;gap:8px")}>
            <input readOnly dir="ltr" aria-label="رابط أصحاب الأسماك" value={link} onFocus={(ev) => ev.target.select()} className="mono" style={{ ...input, flex: "1 1 260px", fontSize: "13px" }} />
            <button type="button" onClick={copy} style={soft}>{copied ? "تم النسخ" : "نسخ الرابط"}</button>
          </div>
        )}

        {d.items.some((it) => it.offers.length) ? (
          <div style={css("display:flex;flex-direction:column;gap:8px")}>
            <strong style={css("font-size:16px")}>العروض الواردة</strong>
            {d.items.flatMap((it) => it.offers.map((o) => (
              <div key={o.id} style={css("display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;padding:12px 14px;background:#FBFCFB;border:1px solid #EDF2EE;border-radius:14px;font-size:15px")}>
                <span style={css("padding:3px 10px;border-radius:999px;background:#EFF4F0;color:#2F6666;font-size:12px;font-weight:700")}>{it.species}</span>
                <strong style={css("overflow-wrap:anywhere")}>{o.name}</strong>
                <a href={"https://wa.me/966" + o.phone.replace(/^0/, "")} target="_blank" rel="noopener noreferrer" dir="ltr" className="mono" style={css("font-size:14px")}>{o.phone}</a>
                <span dir="ltr">{kg(o.quantity_kg)}</span>
                <span style={css("color:#546965")}>سعر الكيلو: <span dir="ltr">{o.price_per_kg}</span> ر.س</span>
                {o.note && <span style={css("flex-basis:100%;color:#546965;white-space:pre-line;overflow-wrap:anywhere")}>{o.note}</span>}
                <span style={css("margin-inline-start:auto")}>
                  {o.counted
                    ? <span style={css("font-size:13px;font-weight:700;color:#7D8A2A")}>محتسب ضمن التغطية</span>
                    : <button type="button" onClick={() => onCount(o.id)} style={{ ...primary, minHeight: "42px", padding: "8px 18px", fontSize: "14px" }}>احتساب ضمن التغطية</button>}
                </span>
              </div>
            )))}
          </div>
        ) : <p style={css("margin:0;font-size:14px;color:#546965")}>لا توجد عروض بعد.</p>}

        <div style={css("display:flex;flex-wrap:wrap;gap:10px")}>
          <button type="button" onClick={onPrint} style={primary}>طباعة احتياج اليوم / حفظ PDF</button>
          {active && <button type="button" onClick={onRevoke} style={{ ...ghost, marginInlineStart: "auto", color: "var(--t-A54B4B, #A54B4B)", borderColor: "var(--s-E5CFCF, #E5CFCF)" }}>إلغاء الرابط</button>}
        </div>
      </div>
    </article>
  );
}

export default function Admin() {
  const [csrf, setCsrf] = useState(null);
  const [leads, setLeads] = useState({ restaurants: [], fish: [] });
  const [demands, setDemands] = useState([]);
  const [tab, setTab] = useState("restaurant");
  const [open, setOpen] = useState(null);
  const [printId, setPrintId] = useState(null);
  const [error, setError] = useState("");
  const theme = useTheme();

  const load = useCallback(async () => {
    try {
      const [l, d] = await Promise.all([getJson("/api/admin/leads"), getJson("/api/admin/demands")]);
      if (l.status === 401 || d.status === 401) return toLogin();
      if (!l.ok || !d.ok) return setError("تعذّر تحميل البيانات.");
      setLeads(l.data); setDemands(d.data); setError("");
    } catch { setError("تعذّر الاتصال."); }
  }, []);

  useEffect(() => {
    document.title = "حصاد جازان | الإدارة";
    document.body.classList.add("admin-body");
    getJson("/api/admin/session")
      .then((r) => { if (!r.ok) return toLogin(); setCsrf(r.data.csrf); load(); })
      .catch(() => setError("تعذّر الاتصال."));
    return () => document.body.classList.remove("admin-body");
  }, [load]);

  // Print one demand: mark it, let the browser paint, then open the print dialog.
  useEffect(() => {
    if (!printId) return;
    const done = () => setPrintId(null);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 50);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); };
  }, [printId]);

  const act = async (url, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      const r = await postJson(url, {}, csrf);
      if (r.status === 401) return toLogin();
      if (!r.ok) setError("تعذّر تنفيذ العملية.");
      load();
    } catch { setError("تعذّر الاتصال."); }
  };
  const logout = async () => { try { await postJson("/api/admin/logout", {}, csrf); } catch { /* leaving anyway */ } toLogin(); };

  if (!csrf) return <div dir="rtl" style={css("min-height:100vh;background:#16211F;color:#FFFFFF;display:flex;align-items:center;justify-content:center")}>{error || "لحظة…"}</div>;

  const restaurants = leads.restaurants.map((r) => ({ ...r, type: "restaurant" }));
  const fish = leads.fish.map((r) => ({ ...r, type: "fish" }));
  const lists = { restaurant: restaurants, fish, trial: restaurants.concat(fish).filter((r) => r.trial_interest).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) };
  const tabs = [["restaurant", "المطاعم", restaurants.length], ["fish", "أصحاب الأسماك", fish.length], ["trial", "المستعدون للتجربة", lists.trial.length], ["demands", "احتياج التجربة", demands.length]];
  const rows = lists[tab] || [];

  return (
    <div dir="rtl" lang="ar" style={css("min-height:100vh")}>
      <header data-noprint="1" style={css("position:sticky;top:0;z-index:10;background:#16211F")}>
        <div style={css("max-width:1120px;margin:0 auto;padding:12px 20px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px")}>
          <img src={logoWhite} alt="حصاد جازان" style={css("height:30px;width:auto")} />
          <div role="tablist" style={css("display:flex;flex-wrap:wrap;gap:6px")}>
            {tabs.map(([id, label, n]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={pill(tab === id)}>{label + " (" + n + ")"}</button>)}
          </div>
          <span style={css("margin-inline-start:auto")}></span>
          <ThemeToggle theme={theme} onDark />
          <button type="button" onClick={logout} style={css("min-height:40px;padding:6px 16px;background:transparent;color:#FFFFFF;border:1px solid #4F6B66;border-radius:999px;font-size:14px;cursor:pointer")}>خروج</button>
        </div>
      </header>

      <main style={css("max-width:1120px;margin:0 auto;padding:20px")}>
        {error && <p data-noprint="1" role="alert" style={css("margin:0 0 14px;padding:10px 14px;background:#F6EDED;border-radius:12px;font-size:14px;color:#A54B4B")}>{error}</p>}

        {tab !== "demands" ? (
          <div data-noprint="1" style={css("display:flex;flex-direction:column;gap:10px")}>
            {rows.map((r) => {
              const isFish = r.type === "fish";
              return (
                <button key={r.type + r.id} type="button" onClick={() => setOpen(r)} className="hv-row" style={css("display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px;width:100%;padding:16px 18px;background:#FFFFFF;border:1px solid #DCE5DF;border-radius:16px;text-align:start;cursor:pointer;color:#16211F")}>
                  <span style={css("padding:3px 10px;border-radius:999px;background:#EFF4F0;color:#2F6666;font-size:12px;font-weight:700")}>{isFish ? r.kind : "مطعم"}</span>
                  <span style={css("font-size:17px;font-weight:700;overflow-wrap:anywhere")}>{isFish ? (r.shop_name ? r.shop_name + " · " + r.name : r.name) : r.restaurant_name + " · " + r.contact_name}</span>
                  <span dir="ltr" className="mono" style={css("font-size:14px;color:#546965")}>{r.phone}</span>
                  <span style={css("font-size:14px;color:#546965")}>{isFish ? (r.species || []).join("، ") : [r.region, r.city, r.need_range].filter(Boolean).join(" · ")}</span>
                  <span style={css("margin-inline-start:auto;font-size:13px;font-weight:700;color:" + (r.trial_interest ? "#2F6666" : "#8B9A95"))}>{r.trial_interest ? "مستعد للتجربة" : "غير مستعد"}</span>
                  <span dir="ltr" className="mono" style={css("font-size:13px;color:#8B9A95")}>{fmtDate(r.created_at)}</span>
                </button>
              );
            })}
            {rows.length === 0 && <p style={css("margin:0;padding:24px;background:#FFFFFF;border:1px dashed #C6D3CC;border-radius:16px;color:#546965;text-align:center")}>لا توجد ردود في هذا القسم.</p>}
          </div>
        ) : (
          <div style={css("display:flex;flex-direction:column;gap:14px")}>
            <div data-noprint="1"><DemandForm csrf={csrf} onCreated={load} onExpired={toLogin} /></div>
            {demands.map((d) => (
              <Demand key={d.id} d={d} printing={printId === d.id} onPrint={() => setPrintId(d.id)}
                onRevoke={() => act("/api/admin/demands/" + d.id + "/revoke", "إلغاء الرابط يمنع أصحاب الأسماك من فتحه. متابعة؟")}
                onCount={(id) => act("/api/admin/offers/" + id + "/count", "احتساب هذا العرض ضمن التغطية يحدّث المتبقي. متابعة؟")} />
            ))}
            {demands.length === 0 && <p data-noprint="1" style={css("margin:0;padding:24px;background:#FFFFFF;border:1px dashed #C6D3CC;border-radius:16px;color:#546965;text-align:center")}>لا يوجد احتياج تجريبي بعد.</p>}
          </div>
        )}
      </main>

      {open && <LeadDialog lead={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
