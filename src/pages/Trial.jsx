import { useEffect, useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { css } from "../lib/css.js";
import { getJson, postJson, normPhone, toNumber } from "../lib/api.js";
import { PHONE_RE, LIMITS } from "../../shared/constants.js";
import { PageHeader } from "./Privacy.jsx";
import { inputStyle } from "./JoinForm.jsx";

const kg = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " كجم"; // no line break between the number and its unit
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { return d; } };
const labelStyle = css("font-weight:700;font-size:16px");
const errStyle = css("font-size:14px;color:#A54B4B");
const card = css("background:#FFFFFF;border-radius:24px;padding:clamp(20px,5vw,32px);box-shadow:0 1px 2px rgba(22,33,31,.06),0 12px 32px rgba(22,33,31,.06)");
const sendErrors = (status) => (status === 429 ? "محاولات كثيرة، حاول بعد قليل." : status === 400 ? "راجع البيانات وحاول مرة ثانية." : status === 404 ? "هذا الاحتياج لم يعد متاحًا." : "تعذّر الإرسال الآن. حاول مرة ثانية.");

export function DemandHeader({ d, greeting }) {
  return (
    <div style={card}>
      <span style={css("display:inline-block;background:#AEBA3C;color:#16211F;font-weight:700;font-size:14px;border-radius:999px;padding:4px 14px")}>احتياج حصاد جازان للتجربة</span>
      {greeting && <p style={css("margin:12px 0 0;font-size:17px;font-weight:700")}>{greeting}</p>}
      <h1 style={css("font-size:clamp(26px,5.5vw,34px);font-weight:800;margin:12px 0 0;line-height:1.35")}>{d.title}</h1>
      <dl style={css("margin:16px 0 0")}>
        {[["التاريخ", fmtDate(d.date)], ["مكان الاستلام", d.pickup_location], ["وقت الاستلام", d.pickup_window]].map(([k, v]) => (
          <div key={k} style={css("display:grid;grid-template-columns:minmax(110px,34%) 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #EDF2EE;font-size:15px")}><dt style={css("color:#546965")}>{k}</dt><dd style={css("margin:0;font-weight:700")}>{v}</dd></div>
        ))}
      </dl>
      <p style={css("margin:14px 0 0;font-size:14px;color:#546965")}>احتياج مجمّع بدون أسماء المطاعم. وقت الاستلام تحدده حصاد جازان.</p>
    </div>
  );
}

// One sheet for every species: the fish owner fills quantity and price only
// for what he has, and sends once. With `identity` false (personal link) there
// is no name or phone to type.
export function OfferSheet({ url, items, identity, mine = [], onSent }) {
  const [rows, setRows] = useState({});
  const [who, setWho] = useState({ name: "", phone: "", note: "", website: "" });
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const setRow = (id, k) => (ev) => { setRows((r) => ({ ...r, [id]: { ...r[id], [k]: ev.target.value } })); setError(""); };
  const setW = (k) => (ev) => { setWho((w) => ({ ...w, [k]: ev.target.value })); setError(""); };

  const open = items.filter((it) => it.remaining_kg > 0);
  const filled = open.map((it) => ({ it, q: (rows[it.id] || {}).q || "", p: (rows[it.id] || {}).p || "" })).filter((x) => x.q.trim() || x.p.trim());
  const rowBad = (x) => { const q = toNumber(x.q), p = toNumber(x.p); return !(q > 0 && q <= LIMITS.kg) || !(p > 0 && p <= LIMITS.price); };
  const e = {};
  if (identity && !who.name.trim()) e.name = "هذا الحقل مطلوب";
  if (identity && !PHONE_RE.test(normPhone(who.phone))) e.phone = "اكتب رقمًا يبدأ بـ 05 ويتكون من 10 أرقام";
  const show = tried ? e : {};

  const submit = async (ev) => {
    ev.preventDefault();
    if (sending) return;
    setTried(true);
    if (!filled.length) return setError("اكتب الكمية والسعر لصنف واحد على الأقل.");
    if (filled.some(rowBad)) return setError("كل صنف تعبّيه يحتاج الكمية وسعر الكيلو معًا.");
    if (Object.keys(e).length) return setError("راجع الحقول المطلوبة.");
    const body = { items: filled.map((x) => ({ item_id: x.it.id, quantity_kg: toNumber(x.q), price_per_kg: toNumber(x.p) })), note: who.note.trim(), website: who.website };
    if (identity) { body.name = who.name.trim(); body.phone = normPhone(who.phone); }
    setSending(true); setError("");
    try {
      const r = await postJson(url, body);
      setSending(false);
      if (r.ok) { setRows({}); setTried(false); return onSent(); }
      setError(sendErrors(r.status));
    } catch {
      setSending(false);
      setError("تعذّر الاتصال. تأكد من الإنترنت وحاول مرة ثانية.");
    }
  };

  const small = (bad) => inputStyle(bad, "text-align:right;min-height:48px");
  return (
    <form noValidate onSubmit={submit} style={css("display:flex;flex-direction:column;gap:18px")}>
      {items.map((it) => {
        const pct = it.required_kg > 0 ? Math.min(100, Math.round((it.counted_kg / it.required_kg) * 100)) : 0;
        const covered = it.remaining_kg <= 0;
        const r = rows[it.id] || {};
        const sent = mine.filter((m) => m.item_id === it.id);
        const bad = tried && (r.q || r.p) && rowBad({ q: r.q || "", p: r.p || "" });
        return (
          <div key={it.id} style={{ ...card, display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:12px")}>
              <strong style={css("font-size:22px;font-weight:800")}>{it.species}</strong>
              <span style={css("color:#546965;font-size:15px")}>المطلوب <strong style={css("color:#16211F")}>{kg(it.required_kg)}</strong></span>
            </div>
            <div aria-hidden="true" style={css("height:10px;background:#E3ECE6;border-radius:10px;overflow:hidden")}><div style={css("height:100%;width:" + pct + "%;background:#2F6666;border-radius:10px")}></div></div>
            <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;font-size:15px")}>
              <span style={css("color:#546965")}>المحتسب ضمن التغطية <strong style={css("color:#16211F")}>{kg(it.counted_kg)}</strong></span>
              <span style={css("color:#546965")}>المتبقي <strong style={css("color:#2F6666")}>{kg(it.remaining_kg)}</strong></span>
            </div>
            {sent.length > 0 && (
              <p style={css("margin:0;font-size:14px;color:#546965;background:#EFF4F0;border-radius:12px;padding:10px 12px")}>
                عرضك المرسل: {sent.map((m, i) => <span key={i}>{i > 0 && " · "}<strong>{kg(m.quantity_kg)}</strong>{m.counted ? " (محتسب)" : " (قيد المراجعة)"}</span>)}
              </p>
            )}
            {covered ? (
              <span style={css("font-size:15px;font-weight:700;color:#7D8A2A")}>اكتملت تغطية هذا الصنف</span>
            ) : (
              <div style={css("display:grid;grid-template-columns:1fr 1fr;gap:12px")}>
                <div style={css("display:flex;flex-direction:column;gap:6px")}>
                  <label htmlFor={"q-" + it.id} style={css("font-weight:700;font-size:14px")}>المتوفر عندك (كجم)</label>
                  <input id={"q-" + it.id} inputMode="decimal" dir="ltr" maxLength={9} value={r.q || ""} onChange={setRow(it.id, "q")} aria-invalid={!!bad} style={small(bad)} />
                </div>
                <div style={css("display:flex;flex-direction:column;gap:6px")}>
                  <label htmlFor={"p-" + it.id} style={css("font-weight:700;font-size:14px")}>سعر الكيلو (ر.س)</label>
                  <input id={"p-" + it.id} inputMode="decimal" dir="ltr" maxLength={9} value={r.p || ""} onChange={setRow(it.id, "p")} aria-invalid={!!bad} style={small(bad)} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {open.length > 0 && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={css("margin:0;font-size:15px;color:#546965")}>عبّي فقط الأصناف المتوفرة عندك واترك الباقي فاضي.</p>
          {identity && (
            <>
              <div style={css("display:flex;flex-direction:column;gap:6px")}>
                <label htmlFor="of-name" style={labelStyle}>الاسم</label>
                <input id="of-name" autoComplete="name" maxLength={LIMITS.name} value={who.name} onChange={setW("name")} aria-invalid={!!show.name} style={inputStyle(!!show.name)} />
                <span role="alert" style={errStyle}>{show.name || ""}</span>
              </div>
              <div style={css("display:flex;flex-direction:column;gap:6px")}>
                <label htmlFor="of-phone" style={labelStyle}>رقم الجوال أو واتساب</label>
                <input id="of-phone" type="tel" inputMode="tel" dir="ltr" autoComplete="tel" placeholder="05XXXXXXXX" maxLength={16} value={who.phone} onChange={setW("phone")} aria-invalid={!!show.phone} style={inputStyle(!!show.phone, "text-align:right")} />
                <span role="alert" style={errStyle}>{show.phone || ""}</span>
              </div>
            </>
          )}
          <div className="hp" aria-hidden="true">
            <label htmlFor="of-website">الموقع</label>
            <input id="of-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={who.website} onChange={setW("website")} />
          </div>
          <div style={css("display:flex;flex-direction:column;gap:6px")}>
            <label htmlFor="of-note" style={labelStyle}>ملاحظة <span style={css("font-weight:400;color:#546965;font-size:14px")}>(اختياري)</span></label>
            <textarea id="of-note" value={who.note} onChange={setW("note")} rows={2} maxLength={LIMITS.note} style={css("font-size:16px;padding:12px 14px;border-radius:14px;border:1px solid #DCE5DF;background:#FBFCFB;color:#16211F;resize:vertical;min-height:72px")}></textarea>
          </div>
          <p role="alert" style={css("margin:0;font-size:15px;font-weight:700;color:#A54B4B")}>{error}</p>
          <button type="submit" disabled={sending} className="hv-teal" style={css("background:#2F6666;color:#FFFFFF;border:0;border-radius:999px;padding:16px;min-height:56px;font-size:17px;font-weight:700;cursor:pointer")}>{sending ? "جارٍ الإرسال…" : "أرسل المتوفر عندي"}</button>
          <p style={css("margin:0;font-size:13px;color:#546965;text-wrap:pretty")}>إرسال العرض لا يعني اعتماده. تراجعه حصاد جازان وتتواصل معك، والمتبقي يتحدّث بعد الاعتماد. بإرسالك أنت توافق على <a href="/privacy">سياسة الخصوصية</a></p>
        </div>
      )}
    </form>
  );
}

export function SentNotice() {
  return (
    <div role="status" style={{ ...card, display: "flex", alignItems: "center", gap: "14px" }}>
      <CheckCircle weight="duotone" size={44} aria-hidden="true" style={css("flex:none;color:#7D8A2A")} />
      <div><strong style={css("font-size:18px;font-weight:800")}>وصلنا عرضك</strong><p style={css("margin:0;color:#546965;font-size:15px")}>نراجعه ونتواصل معك. المتبقي يتحدّث بعد اعتماد حصاد جازان.</p></div>
    </div>
  );
}

export function Shell({ children }) {
  return (
    <div dir="rtl" lang="ar" style={css("min-height:100vh;background:#EEF2DA;color:#16211F;font-size:16px;line-height:1.8")}>
      <PageHeader maxWidth={680} />
      <main style={css("max-width:680px;margin:0 auto;padding:clamp(28px,6vw,56px) 16px 80px;display:flex;flex-direction:column;gap:18px")}>{children}</main>
    </div>
  );
}

export const Message = ({ title, children, alert }) => (
  <div style={card}>
    {title && <h1 style={css("font-size:26px;font-weight:800;margin:0 0 8px")}>{title}</h1>}
    <p role={alert ? "alert" : undefined} style={css("margin:0;" + (alert ? "font-weight:700;color:#A54B4B" : "color:#546965"))}>{children}</p>
  </div>
);

// Loads a page of this kind and reloads it after a successful submission.
export function useRemote(url) {
  const [state, setState] = useState({ status: "loading", data: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    getJson(url)
      .then((r) => { if (alive) setState(r.ok ? { status: "ok", data: r.data } : { status: r.status === 404 ? "missing" : "error", data: null }); })
      .catch(() => { if (alive) setState({ status: "error", data: null }); });
    return () => { alive = false; };
  }, [url, version]);
  return [state, () => setVersion((v) => v + 1)];
}

export default function Trial({ token }) {
  const [state, reload] = useRemote("/api/trial/" + token);
  const [sent, setSent] = useState(false);
  useEffect(() => { document.title = "حصاد جازان | احتياج التجربة"; }, []);
  const d = state.data;

  return (
    <Shell>
      {state.status === "loading" && <p style={css("margin:0;color:#546965")}>لحظة…</p>}
      {state.status === "missing" && <Message title="هذا الرابط غير متاح">قد يكون الاحتياج انتهى أو أُلغي الرابط. تواصل مع حصاد جازان للحصول على رابط جديد.</Message>}
      {state.status === "error" && <Message alert>تعذّر تحميل الاحتياج الآن. حاول مرة ثانية بعد قليل.</Message>}
      {d && (
        <>
          <DemandHeader d={d} />
          {sent && <SentNotice />}
          <OfferSheet url={"/api/trial/" + token + "/offers"} items={d.items} identity onSent={() => { setSent(true); reload(); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        </>
      )}
    </Shell>
  );
}
