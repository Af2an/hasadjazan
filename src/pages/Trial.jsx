import { useEffect, useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { css } from "../lib/css.js";
import { getJson, postJson, normPhone, toNumber } from "../lib/api.js";
import { PHONE_RE, LIMITS } from "../../shared/constants.js";
import { PageHeader } from "./Privacy.jsx";
import { inputStyle } from "./JoinForm.jsx";

const kg = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " كجم";
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { return d; } };
const labelStyle = css("font-weight:700;font-size:16px");
const errStyle = css("font-size:14px;color:#A54B4B");
const blank = () => ({ name: "", phone: "", quantity: "", price: "", note: "", website: "" });

function OfferForm({ token, item, onClose, onSent }) {
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (ev) => { setF((x) => ({ ...x, [k]: ev.target.value })); setError(""); };

  const qty = toNumber(f.quantity), price = toNumber(f.price);
  const e = {};
  if (!f.name.trim()) e.name = "هذا الحقل مطلوب";
  if (!PHONE_RE.test(normPhone(f.phone))) e.phone = "اكتب رقمًا يبدأ بـ 05 ويتكون من 10 أرقام";
  if (!(qty > 0 && qty <= LIMITS.kg)) e.quantity = "اكتب الكمية بالكيلو";
  if (!(price > 0 && price <= LIMITS.price)) e.price = "اكتب سعر الكيلو";
  const show = tried ? e : {};

  const submit = async (ev) => {
    ev.preventDefault();
    if (sending) return;
    if (Object.keys(e).length) { setTried(true); setError("راجع الحقول المطلوبة."); return; }
    setSending(true); setError("");
    try {
      const r = await postJson("/api/trial/" + token + "/offers", { item_id: item.id, name: f.name.trim(), phone: normPhone(f.phone), quantity_kg: qty, price_per_kg: price, note: f.note.trim(), website: f.website });
      setSending(false);
      if (r.ok) return onSent();
      setError(r.status === 429 ? "محاولات كثيرة، حاول بعد قليل." : r.status === 400 ? "راجع البيانات وحاول مرة ثانية." : r.status === 404 ? "هذا الاحتياج لم يعد متاحًا." : "تعذّر الإرسال الآن. حاول مرة ثانية.");
    } catch {
      setSending(false);
      setError("تعذّر الاتصال. تأكد من الإنترنت وحاول مرة ثانية.");
    }
  };

  const input = (id, label, o = {}) => (
    <div style={css("display:flex;flex-direction:column;gap:6px")}>
      <label htmlFor={"of-" + id} style={labelStyle}>{label}</label>
      <input id={"of-" + id} type={o.type || "text"} inputMode={o.inputMode || "text"} autoComplete={o.auto || "off"} dir={o.dir || "rtl"} placeholder={o.placeholder || ""} value={f[id]} onChange={set(id)} aria-invalid={!!show[id]} maxLength={o.max || LIMITS.name} style={inputStyle(!!show[id], o.extra)} />
      <span role="alert" style={errStyle}>{show[id] || ""}</span>
    </div>
  );

  return (
    <form noValidate onSubmit={submit} style={css("display:flex;flex-direction:column;gap:16px;background:#F4F7F5;border-radius:16px;padding:18px;margin-top:6px")}>
      <strong style={css("font-size:17px;font-weight:800")}>عرض كمية: {item.species}</strong>
      {input("name", "الاسم", { auto: "name" })}
      {input("phone", "رقم الجوال أو واتساب", { type: "tel", inputMode: "tel", dir: "ltr", auto: "tel", placeholder: "05XXXXXXXX", max: 16, extra: "text-align:right" })}
      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:16px")}>
        {input("quantity", "الكمية المتوفرة (كجم)", { inputMode: "decimal", dir: "ltr", max: 9, extra: "text-align:right" })}
        {input("price", "سعر الكيلو (ر.س)", { inputMode: "decimal", dir: "ltr", max: 9, extra: "text-align:right" })}
      </div>
      <div className="hp" aria-hidden="true">
        <label htmlFor="of-website">الموقع</label>
        <input id="of-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
      </div>
      <div style={css("display:flex;flex-direction:column;gap:6px")}>
        <label htmlFor="of-note" style={labelStyle}>ملاحظة <span style={css("font-weight:400;color:#546965;font-size:14px")}>(اختياري)</span></label>
        <textarea id="of-note" value={f.note} onChange={set("note")} rows={2} maxLength={LIMITS.note} style={css("font-size:16px;padding:12px 14px;border-radius:14px;border:1px solid #DCE5DF;background:#FBFCFB;color:#16211F;resize:vertical;min-height:72px")}></textarea>
      </div>
      <p role="alert" style={css("margin:0;font-size:15px;font-weight:700;color:#A54B4B")}>{error}</p>
      <div style={css("display:flex;flex-wrap:wrap;gap:10px")}>
        <button type="submit" disabled={sending} className="hv-teal" style={css("flex:1;background:#2F6666;color:#FFFFFF;border:0;border-radius:999px;padding:14px 24px;min-height:52px;font-size:16px;font-weight:700;cursor:pointer")}>{sending ? "جارٍ الإرسال…" : "أرسل العرض"}</button>
        <button type="button" onClick={onClose} style={css("background:transparent;border:1px solid #DCE5DF;border-radius:999px;padding:14px 22px;min-height:52px;font-size:15px;cursor:pointer;color:#16211F")}>إلغاء</button>
      </div>
      <p style={css("margin:0;font-size:13px;color:#546965;text-wrap:pretty")}>إرسال العرض لا يعني اعتماده. تراجعه حصاد جازان وتتواصل معك. بإرسالك أنت توافق على <a href="/privacy">سياسة الخصوصية</a></p>
    </form>
  );
}

export default function Trial({ token }) {
  const [state, setState] = useState({ status: "loading", demand: null });
  const [open, setOpen] = useState(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = "حصاد جازان | احتياج التجربة";
    let alive = true;
    getJson("/api/trial/" + token)
      .then((r) => { if (alive) setState(r.ok ? { status: "ok", demand: r.data } : { status: r.status === 404 ? "missing" : "error", demand: null }); })
      .catch(() => { if (alive) setState({ status: "error", demand: null }); });
    return () => { alive = false; };
  }, [token]);

  const d = state.demand;
  const card = css("background:#FFFFFF;border-radius:24px;padding:clamp(20px,5vw,32px);box-shadow:0 1px 2px rgba(22,33,31,.06),0 12px 32px rgba(22,33,31,.06)");

  return (
    <div dir="rtl" lang="ar" style={css("min-height:100vh;background:#EEF2DA;color:#16211F;font-size:16px;line-height:1.8")}>
      <PageHeader maxWidth={680} />
      <main style={css("max-width:680px;margin:0 auto;padding:clamp(28px,6vw,56px) 16px 80px;display:flex;flex-direction:column;gap:18px")}>
        {state.status === "loading" && <p style={css("margin:0;color:#546965")}>لحظة…</p>}
        {state.status === "missing" && (
          <div style={card}><h1 style={css("font-size:26px;font-weight:800;margin:0 0 8px")}>هذا الرابط غير متاح</h1><p style={css("margin:0;color:#546965")}>قد يكون الاحتياج انتهى أو أُلغي الرابط. تواصل مع حصاد جازان للحصول على رابط جديد.</p></div>
        )}
        {state.status === "error" && (
          <div style={card}><p role="alert" style={css("margin:0;font-weight:700;color:#A54B4B")}>تعذّر تحميل الاحتياج الآن. حاول مرة ثانية بعد قليل.</p></div>
        )}

        {d && (
          <>
            <div style={card}>
              <span style={css("display:inline-block;background:#AEBA3C;color:#16211F;font-weight:700;font-size:14px;border-radius:999px;padding:4px 14px")}>احتياج حصاد جازان للتجربة</span>
              <h1 style={css("font-size:clamp(26px,5.5vw,34px);font-weight:800;margin:12px 0 0;line-height:1.35")}>{d.title}</h1>
              <dl style={css("margin:16px 0 0")}>
                {[["التاريخ", fmtDate(d.date)], ["مكان الاستلام", d.pickup_location], ["وقت الاستلام", d.pickup_window]].map(([k, v]) => (
                  <div key={k} style={css("display:grid;grid-template-columns:minmax(110px,34%) 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #EDF2EE;font-size:15px")}><dt style={css("color:#546965")}>{k}</dt><dd style={css("margin:0;font-weight:700")}>{v}</dd></div>
                ))}
              </dl>
              <p style={css("margin:14px 0 0;font-size:14px;color:#546965")}>احتياج مجمّع بدون أسماء المطاعم. وقت الاستلام تحدده حصاد جازان.</p>
            </div>

            {sent && (
              <div role="status" style={{ ...card, display: "flex", alignItems: "center", gap: "14px" }}>
                <CheckCircle weight="duotone" size={44} color="#7D8A2A" aria-hidden="true" style={css("flex:none")} />
                <div><strong style={css("font-size:18px;font-weight:800")}>وصلنا عرضك</strong><p style={css("margin:0;color:#546965;font-size:15px")}>نراجعه ونتواصل معك. المتبقي يتحدّث بعد اعتماد حصاد جازان.</p></div>
              </div>
            )}

            {d.items.map((it) => {
              const pct = it.required_kg > 0 ? Math.min(100, Math.round((it.counted_kg / it.required_kg) * 100)) : 0;
              const covered = it.remaining_kg <= 0;
              return (
                <div key={it.id} style={{ ...card, display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:12px")}>
                    <strong style={css("font-size:22px;font-weight:800")}>{it.species}</strong>
                    <span style={css("color:#546965;font-size:15px")}>المطلوب <strong style={css("color:#16211F")} dir="ltr">{kg(it.required_kg)}</strong></span>
                  </div>
                  <div aria-hidden="true" style={css("height:10px;background:#E3ECE6;border-radius:10px;overflow:hidden")}><div style={css("height:100%;width:" + pct + "%;background:#2F6666;border-radius:10px")}></div></div>
                  <div style={css("display:flex;justify-content:space-between;gap:12px;font-size:15px")}>
                    <span style={css("color:#546965")}>المحتسب ضمن التغطية <strong style={css("color:#16211F")} dir="ltr">{kg(it.counted_kg)}</strong></span>
                    <span style={css("color:#546965")}>المتبقي <strong style={css("color:#2F6666")} dir="ltr">{kg(it.remaining_kg)}</strong></span>
                  </div>
                  {covered ? (
                    <span style={css("font-size:15px;font-weight:700;color:#7D8A2A")}>اكتملت تغطية هذا الصنف</span>
                  ) : open === it.id ? (
                    <OfferForm token={token} item={it} onClose={() => setOpen(null)} onSent={() => { setOpen(null); setSent(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                  ) : (
                    <button type="button" onClick={() => { setOpen(it.id); setSent(false); }} className="hv-teal" style={css("align-self:flex-start;background:#2F6666;color:#FFFFFF;border:0;border-radius:999px;padding:12px 28px;min-height:50px;font-size:16px;font-weight:700;cursor:pointer")}>لدي كمية</button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
