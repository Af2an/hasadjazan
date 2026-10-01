import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, X } from "@phosphor-icons/react";
import { css } from "../lib/css.js";
import { getJson, postJson, toNumber } from "../lib/api.js";
import { SPECIES, DELIVERY_TIMES, NEED_STATUS, LIMITS } from "../../shared/constants.js";
import { PageHeader } from "./Privacy.jsx";
import { chip, inputStyle, errStyle, labelStyle, hint } from "./JoinForm.jsx";
import { WHATSAPP, WHATSAPP_SHOWN } from "./Home.jsx";

const day = (offset) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
const card = css("background:#FFFFFF;border-radius:22px;padding:clamp(18px,5vw,28px);box-shadow:0 12px 32px rgba(22,33,31,.06)");
const step = css("width:44px;height:48px;flex:none;border-radius:12px;border:1.5px solid #B9C7C0;background:#FFFFFF;font-size:22px;font-weight:700;cursor:pointer;color:#16211F");

// The order is a list of { species, kg }: tap a species to add it, then type or step its kilos.
function validate(f, items) {
  const e = {};
  if (!f.date || f.date < day(0)) e.date = "اختر تاريخًا من اليوم فصاعدًا";
  if (!f.delivery_location.trim()) e.delivery_location = "اكتب موقع التسليم";
  if (!f.delivery_time) e.delivery_time = "اختر وقت التسليم";
  if (!items.length) e.items = "اختر صنفًا واحدًا على الأقل";
  else if (items.some((x) => !(toNumber(x.kg) > 0))) e.items = "اكتب الكيلو لكل صنف اخترته";
  return e;
}

export default function Order({ token }) {
  const [view, setView] = useState({ status: "loading" });
  const [f, setF] = useState({ date: day(1), delivery_location: "", delivery_time: "", note: "" });
  const [items, setItems] = useState([]);
  const [extra, setExtra] = useState("");
  const [tried, setTried] = useState(false), [sending, setSending] = useState(false), [error, setError] = useState(""), [failed, setFailed] = useState(false), [sent, setSent] = useState("");
  const inFlight = useRef(false);

  const load = useCallback(async (keepForm) => {
    try {
      const r = await getJson("/api/r/" + encodeURIComponent(token));
      if (r.status === 404) return setView({ status: "missing" });
      if (!r.ok) return setView({ status: "error" });
      setView({ status: "ok", ...r.data });
      if (!keepForm) setF((x) => ({ ...x, delivery_location: x.delivery_location || r.data.location }));
    } catch { setView({ status: "error" }); }
  }, [token]);
  useEffect(() => { document.title = "إرسال طلب"; load(); }, [load]);

  const e = tried ? validate(f, items) : {};
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: typeof v === "string" ? v : v.target.value })); setError(""); };
  const has = (name) => items.some((x) => x.species === name);
  const toggle = (name) => { setItems((xs) => (xs.some((x) => x.species === name) ? xs.filter((x) => x.species !== name) : xs.concat({ species: name, kg: "" }))); setError(""); };
  const setKg = (name, kg) => { setItems((xs) => xs.map((x) => (x.species === name ? { ...x, kg } : x))); setError(""); };
  const bump = (name, d) => setKg(name, String(Math.max((toNumber(items.find((x) => x.species === name).kg) || 0) + d, 0)));
  const addExtra = () => { const v = extra.trim().slice(0, LIMITS.species); if (v && !has(v)) setItems((xs) => xs.concat({ species: v, kg: "" })); setExtra(""); };
  // the previous order, merged per species
  const repeatLast = (n) => {
    const m = new Map();
    for (const l of n.lines) m.set(l.species, (m.get(l.species) || 0) + l.kg);
    setItems([...m].map(([species, kg]) => ({ species, kg: String(kg) })));
    setError("");
  };

  const send = async (ev) => {
    ev.preventDefault();
    if (inFlight.current) return;
    const errs = validate(f, items);
    if (Object.keys(errs).length) { setTried(true); setError("راجع الحقول المعلّمة باللون الأحمر."); return; }
    inFlight.current = true; setSending(true); setError("");
    let msg = "";
    try {
      const r = await postJson("/api/r/" + encodeURIComponent(token) + "/needs", { date: f.date, delivery_location: f.delivery_location.trim(), delivery_time: f.delivery_time, note: f.note.trim(), lines: items.map((x) => ({ species: x.species, spec: "", kg: toNumber(x.kg) })) });
      if (r.ok) { setSent(f.date); setItems([]); setTried(false); setFailed(false); setF((x) => ({ ...x, note: "" })); load(true); window.scrollTo({ top: 0, behavior: "smooth" }); }
      else msg = r.status === 404 ? "هذا الرابط لم يعد متاحًا. كلمنا على واتساب لنرسل لك رابطًا جديدًا." : r.status === 429 ? "محاولات كثيرة خلال وقت قصير. انتظر دقائق ثم حاول مرة ثانية." : r.status === 400 ? "راجع البيانات ثم حاول مرة ثانية." : "ما قدرنا نحفظ الطلب الآن. بياناتك ما زالت هنا، اضغط «حاول مرة ثانية».";
    } catch { msg = "ما وصلنا الطلب بسبب الاتصال. بياناتك ما زالت هنا، تأكد من الإنترنت واضغط «حاول مرة ثانية»."; }
    inFlight.current = false; setSending(false);
    if (msg) { setError(msg); setFailed(true); }
  };

  const shell = (children) => (
    <div dir="rtl" lang="ar" style={css("min-height:100vh;background:#EEF2DA;color:#16211F;font-size:17px;line-height:1.8")}>
      <PageHeader maxWidth={640} />
      <main style={css("max-width:640px;margin:0 auto;padding:clamp(20px,5vw,40px) 16px 64px;display:flex;flex-direction:column;gap:16px")}>{children}</main>
    </div>
  );
  if (view.status === "loading") return shell(<p style={css("margin:0")}>لحظة…</p>);
  if (view.status !== "ok") return shell(
    <div style={card}>
      <h1 style={css("font-size:24px;margin:0 0 8px")}>{view.status === "missing" ? "هذا الرابط غير متاح" : "تعذّر فتح الصفحة"}</h1>
      <p style={css("margin:0;color:#546965")}>{view.status === "missing" ? "قد يكون الرابط أُلغي. كلمنا على واتساب لنرسل لك رابطًا جديدًا: " : "تأكد من الإنترنت وأعد تحميل الصفحة، أو كلمنا على واتساب: "}<a href={"https://wa.me/" + WHATSAPP} dir="ltr">{WHATSAPP_SHOWN}</a></p>
    </div>
  );

  // usual species first, then the rest of the list
  const choices = [...new Set((view.usual_species || []).concat(SPECIES))];
  const total = items.reduce((s, x) => s + (toNumber(x.kg) || 0), 0);

  return shell(
    <>
      <div>
        <h1 style={css("font-size:clamp(24px,5vw,30px);font-weight:700;margin:0;line-height:1.4")}>طلب {view.restaurant_name}</h1>
        <p style={css("margin:4px 0 0;font-size:16px;color:#546965")}>اختر الأصناف واكتب الكيلو، ونراجع طلبك ونؤكده معك قبل الشراء.</p>
        {(view.order_cutoff || view.delivery_window) && <p style={css("margin:8px 0 0;font-size:16px;font-weight:600;background:#FFFFFF;border-radius:12px;padding:10px 12px")}>{view.order_cutoff ? "أرسل طلبك " + view.order_cutoff + "." : ""}{view.delivery_window ? " موعد التسليم: " + view.delivery_window + "." : ""}</p>}
      </div>
      {sent && (
        <div role="status" style={{ ...card, display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <CheckCircle size={36} color="#7D8A2A" aria-hidden="true" style={css("flex:none")} />
          <p style={css("margin:0;font-size:17px")}>وصلنا طلبك ليوم {sent}. نراجعه ونتواصل معك لتأكيده.</p>
        </div>
      )}
      <form noValidate onSubmit={send} style={{ ...card, display: "flex", flexDirection: "column", gap: "18px" }}>
        <fieldset style={css("border:0;margin:0;padding:0;min-width:0;display:flex;flex-direction:column;gap:10px")}>
          <legend id="o-items" style={css("font-weight:600;font-size:17px;padding:0;margin-bottom:4px")}>وش تحتاج؟</legend>
          {view.needs.length > 0 && items.length === 0 && <button type="button" onClick={() => repeatLast(view.needs[0])} className="hv-teal" style={css("min-height:52px;border:0;background:#2F6666;color:#FFFFFF;border-radius:14px;font-weight:700;font-size:17px;cursor:pointer")}>نفس طلبي السابق</button>}
          <span style={hint}>اضغط على الصنف، ثم اكتب الكيلو.</span>
          <div style={css("display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,130px),1fr));gap:8px")}>
            {choices.map((s) => <button key={s} type="button" aria-pressed={has(s)} onClick={() => toggle(s)} style={chip(has(s))}>{has(s) ? "✓ " : ""}{s}</button>)}
          </div>
          <div style={css("display:flex;gap:8px")}>
            <input value={extra} onChange={(ev) => setExtra(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); addExtra(); } }} maxLength={LIMITS.species} aria-label="صنف آخر" placeholder="صنف غير موجود" style={inputStyle(false, "flex:1;min-width:0")} />
            <button type="button" onClick={addExtra} className="hv-soft" style={css("flex:none;border:1.5px solid #2F6666;background:#FFFFFF;color:#2F6666;border-radius:14px;padding:0 18px;font-weight:700;font-size:16px;cursor:pointer;min-height:52px")}>إضافة</button>
          </div>
          {items.length > 0 && (
            <div style={css("display:flex;flex-direction:column;gap:8px;background:#F4F7F5;border-radius:16px;padding:12px")}>
              {items.map((x) => (
                <div key={x.species} style={css("display:flex;flex-wrap:wrap;align-items:center;gap:6px")}>
                  <strong style={css("flex:1 1 80px;font-size:17px")}>{x.species}</strong>
                  <span style={css("display:flex;align-items:center;gap:6px;flex:none;margin-inline-start:auto")}>
                  <button type="button" aria-label={"أنقص كيلو " + x.species} onClick={() => bump(x.species, -1)} style={step}>−</button>
                  <input aria-label={"كيلو " + x.species} inputMode="decimal" dir="ltr" maxLength={8} placeholder="كجم" value={x.kg} onChange={(ev) => setKg(x.species, ev.target.value)} style={inputStyle(tried && !(toNumber(x.kg) > 0), "width:64px;flex:none;text-align:center;padding:8px 4px")} />
                  <button type="button" aria-label={"زد كيلو " + x.species} onClick={() => bump(x.species, 1)} style={step}>+</button>
                  <button type="button" aria-label={"حذف " + x.species} onClick={() => toggle(x.species)} style={css("width:36px;height:48px;flex:none;border:0;background:transparent;color:#A54B4B;cursor:pointer;padding:0")}><X size={20} aria-hidden="true" /></button>
                  </span>
                </div>
              ))}
              <p style={css("margin:0;font-size:16px;color:#546965")}>المجموع: <strong style={css("color:#16211F")}>{Math.round(total * 100) / 100} كجم</strong></p>
            </div>
          )}
          <span role="alert" style={errStyle}>{e.items || ""}</span>
        </fieldset>

        <fieldset style={css("border:0;margin:0;padding:0;min-width:0;display:flex;flex-direction:column;gap:8px")}>
          <legend id="o-time" style={css("font-weight:600;font-size:17px;padding:0;margin-bottom:6px")}>وقت التسليم</legend>
          <div role="radiogroup" aria-labelledby="o-time" style={css("display:grid;grid-template-columns:1fr 1fr;gap:8px")}>{DELIVERY_TIMES.map((t) => <button key={t} type="button" role="radio" aria-checked={f.delivery_time === t} onClick={() => set("delivery_time")(t)} style={chip(f.delivery_time === t)}>{t}</button>)}</div>
          <span role="alert" style={errStyle}>{e.delivery_time || ""}</span>
        </fieldset>

        <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:12px")}>
          <div style={css("display:flex;flex-direction:column;gap:6px")}>
            <label htmlFor="o-date" style={labelStyle}>تاريخ التسليم</label>
            <input id="o-date" type="date" min={day(0)} value={f.date} onChange={set("date")} aria-invalid={!!e.date} style={inputStyle(!!e.date)} />
            <span role="alert" style={errStyle}>{e.date || ""}</span>
          </div>
          <div style={css("display:flex;flex-direction:column;gap:6px")}>
            <label htmlFor="o-loc" style={labelStyle}>موقع التسليم</label>
            <input id="o-loc" value={f.delivery_location} onChange={set("delivery_location")} maxLength={LIMITS.location} aria-invalid={!!e.delivery_location} style={inputStyle(!!e.delivery_location)} />
            <span role="alert" style={errStyle}>{e.delivery_location || ""}</span>
          </div>
        </div>
        <div style={css("display:flex;flex-direction:column;gap:6px")}>
          <label htmlFor="o-note" style={labelStyle}>ملاحظة <span style={hint}>(اختياري)</span></label>
          <textarea id="o-note" rows={2} value={f.note} onChange={set("note")} maxLength={LIMITS.note} style={inputStyle(false, "resize:vertical;min-height:72px")}></textarea>
        </div>
        <p style={css("margin:0;font-size:16px;color:#2B3D3A;background:#EEF2DA;border-radius:12px;padding:10px 12px")}>الاستكمال من محلات الأسماك عند النقص: <strong>{view.substitute_answer === "أحيانًا" ? "أحيانًا، حسب ما اتفقنا عليه" : view.accepts_substitute ? "نعم" : "لا"}</strong>. ولتغييره كلمنا على واتساب.</p>
        <p role="alert" style={css("margin:0;font-size:16px;font-weight:700;color:#A54B4B")}>{error}</p>
        <button type="submit" disabled={sending} aria-busy={sending} className="hv-teal" style={css("background:#2F6666;color:#FFFFFF;border:0;border-radius:999px;min-height:56px;font-size:18px;font-weight:700;cursor:pointer;opacity:" + (sending ? 0.7 : 1))}>{sending ? "جارٍ الحفظ…" : failed ? "حاول مرة ثانية" : "أرسل الطلب"}</button>
      </form>

      {view.needs.length > 0 && (
        <div style={card}>
          <h2 style={css("font-size:20px;margin:0 0 8px")}>طلباتك الأخيرة</h2>
          {view.needs.map((n, i) => (
            <div key={i} style={css("padding:8px 0;border-top:1px solid #EDF2EE;font-size:16px")}>
              <strong>{n.date}</strong> · {n.delivery_time} · <span style={css("color:#2F6666;font-weight:600")}>{NEED_STATUS[n.status]}</span>
              <div style={css("color:#546965")}>{n.lines.map((l) => l.species + " " + l.kg + " كجم").join("، ")}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
