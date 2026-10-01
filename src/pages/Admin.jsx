import { useCallback, useEffect, useState } from "react";
import { css } from "../lib/css.js";
import { getJson, postJson, toNumber, normPhone } from "../lib/api.js";
import { fmtDate, kg, yes, toLogin, primary, ghost, soft, small, danger, input, card, label, grid, muted, errorText, Select } from "../lib/admin-ui.jsx";
import { YESNO, SUBSTITUTE, FOLLOW, PAY_TERMS, LIMITS, PHONE_RE } from "../../shared/constants.js";
import { Orders, Suppliers, Purchase, Delivery, Summary } from "./Ops.jsx";

const pill = (on) => css("flex:none;white-space:nowrap;min-height:40px;padding:6px 14px;border-radius:999px;border:none;cursor:pointer;font-size:14px;font-weight:" + (on ? 700 : 500) + ";background:" + (on ? "#AEBA3C" : "rgba(255,255,255,0.08)") + ";color:" + (on ? "#16211F" : "#FFFFFF"));
const splitList = (s) => [...new Set(String(s || "").split(/[،,]/).map((x) => x.trim().slice(0, LIMITS.species)).filter(Boolean))];

/* Rows of a restaurant record: current questions first, older form answers only when present. */
const list = (a) => (a || []).join("، ");
const restaurantRows = (r) => [
  ["اسم المطعم", r.restaurant_name], ["واتساب المسؤول", r.phone], ["المدينة", r.city], ["الحي", r.district], ["رابط الموقع", r.map_link],
  ["الأصناف", list(r.species)], ["الاحتياج اليومي", r.kg_from == null ? "" : kg(r.kg_from) + " إلى " + kg(r.kg_to)],
  ["طريقة التأمين الحالية", list(r.sourcing) + (r.sourcing_other ? " (" + r.sourcing_other + ")" : "")],
  ["الاستكمال من محل", r.substitute_answer || yes(r.accepts_substitute)], ["يرغب بالتواصل", yes(r.trial_interest)], ["سؤال أو ملاحظة", r.note],
  ["وقت الموافقة", r.consent_at ? fmtDate(r.consent_at) : ""], ["تم التحقق", r.verified_at ? fmtDate(r.verified_at) : ""]
].filter((x) => x[1] != null && x[1] !== "");

/* CSV export. Excel opens it with Arabic intact (BOM); cells a spreadsheet would run as a formula get an apostrophe. */
const csvCell = (v) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
// A phone is exactly 05 and eight digits (checked on the server), so ="…" is safe and keeps the leading zero.
const csvPhone = (v) => (PHONE_RE.test(String(v || "")) ? '"=""' + v + '"""' : csvCell(v));
function exportCsv(name, rows) {
  const lines = [Object.keys(rows[0]).map(csvCell).join(",")].concat(rows.map((r) => Object.entries(r).map(([k, v]) => (k === "الجوال" ? csvPhone(v) : csvCell(v))).join(",")));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = name + "-" + new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const restaurantCsv = (rows) => exportCsv("restaurants", rows.map((r) => ({
  "تاريخ التسجيل": fmtDate(r.created_at), "اسم المطعم": r.restaurant_name, "الجوال": r.phone, "المدينة": r.city, "الحي": r.district, "رابط الموقع": r.map_link,
  "الأصناف": list(r.species), "من (كجم)": r.kg_from, "إلى (كجم)": r.kg_to, "طريقة التأمين": list(r.sourcing), "طريقة أخرى": r.sourcing_other,
  "الاستكمال من محل": r.substitute_answer, "يرغب بالتواصل": yes(r.trial_interest), "ملاحظة": r.note, "تم التحقق": r.verified_at ? "نعم" : "لا"
})));

function RestaurantEdit({ r, csrf, onSaved, onCancel }) {
  const [f, setF] = useState({ restaurant_name: r.restaurant_name || "", phone: r.phone || "", city: r.city || "", district: r.district || "", map_link: r.map_link || "",
    species: list(r.species), kg_from: r.kg_from == null ? "" : String(r.kg_from), kg_to: r.kg_to == null ? "" : String(r.kg_to),
    substitute: r.substitute_answer || "", wants_contact: r.trial_interest == null ? "" : r.trial_interest ? "نعم" : "لا", note: r.note || "" });
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: typeof v === "string" ? v : v.target.value })); setError(""); };
  const save = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const body = { restaurant_name: f.restaurant_name.trim(), phone: normPhone(f.phone), city: f.city.trim(), district: f.district.trim(), map_link: f.map_link.trim(),
      species: splitList(f.species), kg_from: toNumber(f.kg_from), kg_to: toNumber(f.kg_to), sourcing: r.sourcing && r.sourcing.length ? r.sourcing : ["طريقة أخرى"],
      sourcing_other: r.sourcing && r.sourcing.length ? r.sourcing_other || "" : "غير محدد", substitute: f.substitute, wants_contact: f.wants_contact, note: f.note.trim() };
    if (!body.restaurant_name || !body.city || !body.district || !body.species.length || !body.substitute || !body.wants_contact) return setError("أكمل الحقول المطلوبة.");
    if (!PHONE_RE.test(body.phone)) return setError("الجوال يبدأ بـ 05 ويتكون من 10 أرقام.");
    if (!(body.kg_from > 0) || !(body.kg_to >= body.kg_from)) return setError("نطاق الكمية غير صحيح.");
    setBusy(true);
    try {
      const res = await postJson("/api/admin/leads/restaurant/" + r.id + "/update", body, csrf);
      setBusy(false);
      if (res.status === 401) return toLogin();
      if (res.status === 409) return setError("هذا الجوال مستخدم في سجل آخر.");
      if (!res.ok) return setError("تعذّر الحفظ. راجع البيانات.");
      onSaved();
    } catch { setBusy(false); setError("تعذّر الاتصال."); }
  };
  const text = (k, l, o = {}) => <label style={label}>{l}<input value={f[k]} onChange={set(k)} maxLength={o.max || LIMITS.name} dir={o.dir} inputMode={o.inputMode} style={input} /></label>;
  return (
    <form onSubmit={save} style={css("margin-top:14px;display:flex;flex-direction:column;gap:12px")}>
      <div style={grid}>
        {text("restaurant_name", "اسم المطعم")}{text("phone", "الجوال", { max: 16, dir: "ltr", inputMode: "tel" })}{text("city", "المدينة", { max: LIMITS.city })}{text("district", "الحي", { max: LIMITS.district })}
        {text("kg_from", "من (كجم)", { max: 10, dir: "ltr", inputMode: "decimal" })}{text("kg_to", "إلى (كجم)", { max: 10, dir: "ltr", inputMode: "decimal" })}
        <label style={label}>الاستكمال من محل<Select value={f.substitute} onChange={set("substitute")} options={SUBSTITUTE} /></label>
        <label style={label}>يرغب بالتواصل<Select value={f.wants_contact} onChange={set("wants_contact")} options={YESNO} /></label>
      </div>
      {text("map_link", "رابط الموقع", { max: LIMITS.url, dir: "ltr" })}
      {text("species", "الأصناف (افصل بينها بفاصلة)", { max: 400 })}
      {text("note", "ملاحظة", { max: LIMITS.note })}
      {error && <p role="alert" style={errorText}>{error}</p>}
      <div style={css("display:flex;gap:10px")}><button type="submit" disabled={busy} style={primary}>{busy ? "لحظة…" : "حفظ"}</button><button type="button" onClick={onCancel} style={ghost}>تراجع</button></div>
    </form>
  );
}

function FollowUp({ r, act }) {
  const [f, setF] = useState({ follow_status: r.follow_status || "جديد", admin_note: r.admin_note || "" });
  const [msg, setMsg] = useState("");
  const save = async (ev) => { ev.preventDefault(); const x = await act("/api/admin/restaurants/" + r.id + "/follow", null, f); setMsg(x && x.ok ? "تم الحفظ." : "تعذّر الحفظ."); };
  return (
    <form onSubmit={save} style={css("margin-top:14px;display:flex;flex-direction:column;gap:8px;background:#F4F7F5;border-radius:14px;padding:14px")}>
      <strong>المتابعة</strong>
      <label style={label}>حالة المتابعة<Select value={f.follow_status} onChange={(v) => setF((x) => ({ ...x, follow_status: v }))} options={FOLLOW} /></label>
      <label style={label}>ملاحظات الإدارة<textarea rows={2} value={f.admin_note} onChange={(ev) => setF((x) => ({ ...x, admin_note: ev.target.value }))} maxLength={LIMITS.note} style={{ ...input, resize: "vertical" }}></textarea></label>
      <div style={css("display:flex;gap:10px;align-items:center")}><button type="submit" style={small}>حفظ المتابعة</button>{msg && <span style={muted}>{msg}</span>}</div>
    </form>
  );
}

function Agreement({ r, act }) {
  const [f, setF] = useState({ fee_terms: r.fee_terms || "", payment_terms: r.payment_terms || "", order_cutoff: r.order_cutoff || "", delivery_window: r.delivery_window || "", shortage_policy: r.shortage_policy || "", rejection_policy: r.rejection_policy || "", sometimes_cases: r.sometimes_cases || "" });
  const [msg, setMsg] = useState("");
  const set = (k) => (ev) => setF((x) => ({ ...x, [k]: typeof ev === "string" ? ev : ev.target.value }));
  const save = async (ev) => {
    ev.preventDefault();
    if (!f.payment_terms) return setMsg("اختر طريقة السداد.");
    const x = await act("/api/admin/restaurants/" + r.id + "/agreement", null, f);
    setMsg(x && x.ok ? "تم حفظ الاتفاق." : "تعذّر الحفظ.");
  };
  const area = (k, l, ph) => <label style={label}>{l}<textarea rows={2} value={f[k]} onChange={set(k)} maxLength={300} placeholder={ph} style={{ ...input, resize: "vertical" }}></textarea></label>;
  return (
    <form onSubmit={save} style={css("margin-top:14px;display:flex;flex-direction:column;gap:8px;background:#EEF2DA;border-radius:14px;padding:14px")}>
      <strong>الاتفاق مع المطعم {r.agreed_at ? "· آخر تحديث " + fmtDate(r.agreed_at) : "· لم يُسجّل بعد"}</strong>
      {area("fee_terms", "اتفاق التكلفة ورسوم الخدمة", "مثل: سعر الشراء الفعلي + رسوم ثابتة لكل طلب")}
      <label style={label}>السداد<Select value={f.payment_terms} onChange={set("payment_terms")} options={PAY_TERMS} /></label>
      <label style={label}>آخر وقت لإرسال الطلب<input value={f.order_cutoff} onChange={set("order_cutoff")} maxLength={80} placeholder="مثل: قبل 9 مساءً لليوم التالي" style={input} /></label>
      <label style={label}>موعد التسليم المتفق<input value={f.delivery_window} onChange={set("delivery_window")} maxLength={80} placeholder="مثل: من 6 إلى 8 صباحًا" style={input} /></label>
      {area("shortage_policy", "سياسة النقص", "مثل: يُحاسب على المسلّم فقط")}
      {area("rejection_policy", "سياسة الرفض عند الاستلام", "مثل: يُرفض غير المطابق ويُخصم")}
      {r.substitute_answer === "أحيانًا" && area("sometimes_cases", "أجاب «أحيانًا»: الحالات المقبولة للشراء من المحلات", "مثل: إذا نقص الهامور فقط. بدونها لا يُوزّع عليه سمك من محل")}
      <div style={css("display:flex;gap:10px;align-items:center")}><button type="submit" style={small}>حفظ الاتفاق</button>{msg && <span style={muted}>{msg}</span>}</div>
    </form>
  );
}

function RestaurantDialog({ r, csrf, onClose, onChanged, act }) {
  const [editing, setEditing] = useState(false), [copied, setCopied] = useState(false);
  const link = r.order_token ? window.location.origin + "/r/" + r.order_token : "";
  const api = "/api/admin/restaurants/" + r.id;
  const wa = (text) => "https://wa.me/966" + String(r.phone || "").replace(/^0/, "") + "?text=" + encodeURIComponent(text);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link stays selectable */ } };
  return (
    <>
      <div onClick={onClose} style={css("position:fixed;inset:0;z-index:20;background:rgba(22,33,31,0.5)")}></div>
      <section role="dialog" aria-modal="true" aria-label="سجل المطعم" style={css("position:fixed;z-index:21;top:4vh;inset-inline:max(12px, calc(50% - 380px));max-height:92vh;overflow:auto;background:#FFFFFF;border-radius:20px;padding:22px;box-shadow:0 20px 60px rgba(22,33,31,0.25)")}>
        <p style={muted}>مطعم · سجّل في {fmtDate(r.created_at)}</p>
        <h2 style={css("margin:6px 0 0;font-size:22px;font-weight:700")}>{r.restaurant_name}</h2>
        {editing ? <RestaurantEdit r={r} csrf={csrf} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} /> : (
          <>
            <dl style={css("margin:12px 0 0")}>
              {restaurantRows(r).map(([k, v]) => <div key={k} style={css("display:grid;grid-template-columns:minmax(110px,36%) 1fr;gap:10px;padding:9px 0;border-bottom:1px solid #EDF2EE;font-size:15px")}><dt style={css("color:#546965")}>{k}</dt><dd style={css("margin:0;font-weight:600;overflow-wrap:anywhere")}>{v}</dd></div>)}
            </dl>
            <FollowUp key={"f" + r.follow_status + r.admin_note} r={r} act={act} />
            {r.trial_interest !== false && <Agreement key={"a" + r.agreed_at + r.sometimes_cases} r={r} act={act} />}
            <details style={css("margin-top:14px;background:#F4F7F5;border-radius:14px;padding:14px")}>
              <summary style={css("cursor:pointer;font-weight:700")}>رابط الطلب الخاص (اختياري)</summary>
              <span style={muted}>أنشئه بعد التحقق من المطعم بالتواصل معه. من يملك الرابط يرسل احتياجًا باسم المطعم، لذلك راجع كل طلب قبل التنفيذ، وألغِ الرابط عند أي شك.</span>
              {link ? (
                <>
                  <input readOnly dir="ltr" aria-label="الرابط" value={link} onFocus={(ev) => ev.target.select()} className="mono" style={{ ...input, fontSize: "13px" }} />
                  <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
                    <button type="button" onClick={copy} style={small}>{copied ? "تم النسخ" : "نسخ الرابط"}</button>
                    <a href={wa("هذا رابط إرسال احتياج مطعمكم من السمك: " + link)} target="_blank" rel="noopener noreferrer" style={{ ...small, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>إرساله عبر واتساب</a>
                    <button type="button" onClick={() => act(api + "/link", "الرابط الجديد يوقف القديم فورًا. متابعة؟")} style={small}>رابط جديد</button>
                    <button type="button" onClick={() => act(api + "/unlink", "إلغاء الرابط يمنع المطعم من إرسال احتياج. متابعة؟")} style={{ ...small, ...danger }}>إلغاء الرابط</button>
                  </div>
                </>
              ) : <button type="button" onClick={() => act(api + "/link", "تأكدت من المطعم بالتواصل معه؟ سيُنشأ رابط احتياجه.")} style={{ ...soft, alignSelf: "flex-start" }}>تم التحقق: أنشئ الرابط</button>}
            </details>
            <div style={css("margin-top:16px;display:flex;flex-wrap:wrap;gap:8px")}>
              {r.trial_interest === false ? <span style={{ ...muted, alignSelf: "center" }}>اختار عدم التواصل</span> : <a href={wa("السلام عليكم، معك فريق تجربة توريد السمك بخصوص تسجيل " + r.restaurant_name + ".")} target="_blank" rel="noopener noreferrer" style={{ ...soft }}>فتح واتساب (بدون إرسال تلقائي)</a>}
              <button type="button" onClick={() => setEditing(true)} style={ghost}>تعديل</button>
              <button type="button" onClick={async () => { if (await act("/api/admin/leads/restaurant/" + r.id + "/delete", "سيُحذف هذا المطعم وكل احتياجاته نهائيًا. متابعة؟")) onClose(); }} style={{ ...ghost, ...danger }}>حذف</button>
              <button type="button" onClick={onClose} style={{ ...ghost, marginInlineStart: "auto" }}>إغلاق</button>
            </div>
          </>
        )}
      </section>
    </>
  );
}

export default function Admin() {
  const [csrf, setCsrf] = useState("");
  const [tab, setTab] = useState("restaurants");
  const [data, setData] = useState({ leads: { restaurants: [], fish: [] }, needs: [], batches: [], supplierOrders: [] });
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [l, n, b, s] = await Promise.all(["/api/admin/leads", "/api/admin/needs", "/api/admin/batches", "/api/admin/supplier-orders"].map(getJson));
      if ([l, n, b, s].some((r) => r.status === 401)) return toLogin();
      if (![l, n, b, s].every((r) => r.ok)) return setError("تعذّر تحميل البيانات.");
      setData({ leads: l.data, needs: n.data, batches: b.data, supplierOrders: s.data }); setError("");
    } catch { setError("تعذّر الاتصال."); }
  }, []);

  useEffect(() => {
    document.title = "الإدارة";
    document.body.classList.add("admin-body");
    getJson("/api/admin/session").then((r) => { if (!r.ok) return toLogin(); setCsrf(r.data.csrf); load(); }).catch(() => setError("تعذّر الاتصال."));
    return () => document.body.classList.remove("admin-body");
  }, [load]);

  // Every admin change goes through here: POST with the CSRF token, then a fresh load.
  const act = async (url, confirmText, body = {}) => {
    if (confirmText && !window.confirm(confirmText)) return false;
    try {
      const r = await postJson(url, body, csrf);
      if (r.status === 401) { toLogin(); return false; }
      await load();
      return r;
    } catch { setError("تعذّر الاتصال."); return false; }
  };
  const logout = async () => { try { await postJson("/api/admin/logout", {}, csrf); } catch { /* leaving anyway */ } toLogin(); };

  if (!csrf) return <div dir="rtl" style={css("min-height:100vh;background:#16211F;color:#FFFFFF;display:flex;align-items:center;justify-content:center")}>{error || "لحظة…"}</div>;

  const restaurants = data.leads.restaurants;
  const newNeeds = data.needs.filter((n) => n.status === "new").length;
  const openSupplier = data.supplierOrders.filter((x) => x.status === "requested").length;
  const toInspect = data.batches.filter((b) => b.accepted_kg == null).length;
  const tabs = [["restaurants", "١ المطاعم (" + restaurants.length + ")"], ["needs", "٢ الطلبات" + (newNeeds ? " (" + newNeeds + " جديد)" : "")], ["suppliers", "٣ الموردون" + (openSupplier ? " (" + openSupplier + ")" : "")], ["purchase", "٤ الشراء والتوزيع" + (toInspect ? " (" + toInspect + ")" : "")], ["delivery", "٥ التسليم والتحصيل"], ["summary", "٦ ملخص الأسبوع"]];
  const open = openId && restaurants.find((r) => r.id === openId);

  return (
    <div dir="rtl" lang="ar" style={css("min-height:100vh")}>
      <header data-noprint="1" style={css("position:sticky;top:0;z-index:10;background:#16211F")}>
        <div style={css("max-width:1120px;margin:0 auto;padding:10px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px")}>
          <strong style={css("font-size:17px;color:#FFFFFF")}>الإدارة</strong>
          <div role="tablist" style={css("display:flex;gap:6px;overflow-x:auto;flex-wrap:nowrap;max-width:100%;order:3;flex-basis:100%;padding-bottom:2px")}>{tabs.map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={pill(tab === id)}>{l}</button>)}</div>
          <button type="button" onClick={logout} style={css("margin-inline-start:auto;min-height:40px;padding:6px 16px;background:transparent;color:#FFFFFF;border:1px solid #4F6B66;border-radius:999px;font-size:14px;cursor:pointer")}>خروج</button>
        </div>
      </header>
      <main style={css("max-width:1120px;margin:0 auto;padding:16px")}>
        {error && <p role="alert" style={css("margin:0 0 12px;padding:10px 14px;background:#F6EDED;border-radius:12px;font-size:14px;color:#A54B4B")}>{error}</p>}
        {tab === "needs" && <Orders needs={data.needs} restaurants={restaurants} act={act} />}
        {tab === "suppliers" && <Suppliers suppliers={data.leads.fish} orders={data.supplierOrders} act={act} />}
        {tab === "purchase" && <Purchase needs={data.needs} batches={data.batches} suppliers={data.leads.fish} act={act} />}
        {tab === "delivery" && <Delivery needs={data.needs} act={act} />}
        {tab === "summary" && <Summary act={act} />}
        {tab === "restaurants" && (
          <div style={css("display:flex;flex-direction:column;gap:10px")}>
            {restaurants.length > 0 && <button type="button" onClick={() => restaurantCsv(restaurants)} style={{ ...soft, alignSelf: "flex-start" }}>تصدير القائمة (CSV)</button>}
            {restaurants.map((r) => (
              <button key={r.id} type="button" onClick={() => setOpenId(r.id)} className="hv-row" style={{ ...card, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 14px", textAlign: "start", cursor: "pointer", color: "var(--t-16211F, #16211F)", padding: "14px 16px" }}>
                <strong style={css("font-size:17px")}>{r.restaurant_name}</strong>
                <span style={css("font-size:14px;color:#546965")}>{[r.city, r.district].filter(Boolean).join(" · ") || r.location}</span>
                <span dir="ltr" className="mono" style={css("font-size:14px;color:#546965")}>{r.phone}</span>
                <span style={css("font-size:13px;font-weight:700;color:" + (r.accepts_substitute ? "#2F6666" : "#A54B4B"))}>{r.substitute_answer ? "المحلات: " + r.substitute_answer : ""}</span>
                <span style={css("margin-inline-start:auto;font-size:13px;font-weight:700;color:" + (r.trial_interest === false ? "#8B9A95" : "#2F6666"))}>{r.trial_interest === false ? "لا يرغب بالتواصل" : r.follow_status || "جديد"}</span>
              </button>
            ))}
            {restaurants.length === 0 && <p style={{ ...card, ...muted, textAlign: "center" }}>لا يوجد مطاعم مسجلة بعد.</p>}
          </div>
        )}
      </main>
      {open && <RestaurantDialog key={open.id} r={open} csrf={csrf} act={act} onChanged={load} onClose={() => setOpenId(null)} />}
    </div>
  );
}

