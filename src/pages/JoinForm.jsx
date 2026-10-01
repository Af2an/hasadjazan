import { useRef, useState } from "react";
import { X, CheckCircle } from "@phosphor-icons/react";
import { css } from "../lib/css.js";
import { postJson, normPhone, toNumber } from "../lib/api.js";
import { SPECIES, YESNO, SUBSTITUTE, SOURCING, OTHER_SOURCING, PHONE_RE, LIMITS } from "../../shared/constants.js";

const HEADER = 72;
const blank = () => ({ f: {}, species: [], sourcing: [], extra: "", tried: false, error: "", failed: false, website: "" });

export const chip = (on) => css("min-height:52px;width:100%;padding:10px 14px;border-radius:14px;cursor:pointer;font-size:16px;text-align:start;font-weight:" + (on ? 700 : 500) + ";border:1.5px solid " + (on ? "#2F6666" : "#B9C7C0") + ";background:" + (on ? "#EFF4F0" : "#FFFFFF") + ";color:#16211F;box-shadow:" + (on ? "inset 0 0 0 1px #2F6666" : "none"));
export const inputStyle = (bad, extra) => css("width:100%;min-height:52px;padding:12px 14px;background:#FFFFFF;border-radius:14px;font-size:17px;color:#16211F;border:" + (bad ? "2px solid #A54B4B" : "1.5px solid #B9C7C0") + ";" + (extra || ""));
export const errStyle = css("font-size:16px;color:#A54B4B");
export const labelStyle = css("font-weight:600;font-size:17px");
export const hint = css("font-weight:400;color:#546965;font-size:16px");
const fieldset = css("border:0;margin:0;padding:0;min-width:0;display:flex;flex-direction:column;gap:8px");
// two columns only when the options are short and the screen has room; never a smaller font
const cols = (min) => css("display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%," + min + "px),1fr));gap:8px");
const mark = (on) => <span aria-hidden="true" style={css("width:22px;height:22px;flex:none;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:15px;border:2px solid " + (on ? "#2F6666" : "#8B9A95") + ";background:" + (on ? "#2F6666" : "#FFFFFF") + ";color:#FFFFFF")}>{on ? "✓" : ""}</span>;

const num = (v) => toNumber(v);
function validate(s) {
  const f = s.f, e = {};
  if (!String(f.restaurant_name || "").trim()) e.restaurant_name = "اكتب اسم المطعم";
  if (!String(f.phone || "").trim()) e.phone = "اكتب رقم واتساب المسؤول";
  else if (!PHONE_RE.test(normPhone(f.phone))) e.phone = "اكتب رقمًا يبدأ بـ 05 ويتكون من 10 أرقام";
  if (!String(f.city || "").trim()) e.city = "اكتب المدينة";
  if (!String(f.district || "").trim()) e.district = "اكتب الحي";
  if (String(f.map_link || "").trim() && !/^https?:\/\/\S+$/i.test(f.map_link.trim())) e.map_link = "الرابط يبدأ بـ https://";
  if (!s.species.length) e.species = "اختر صنفًا واحدًا على الأقل";
  const from = num(f.kg_from), to = num(f.kg_to);
  if (!(from > 0) || !(to > 0)) e.kg = "اكتب رقمين أكبر من صفر";
  else if (from > to) e.kg = "الرقم الأول لا يتجاوز الرقم الثاني";
  if (!s.sourcing.length) e.sourcing = "اختر طريقة واحدة على الأقل";
  else if (s.sourcing.includes(OTHER_SOURCING) && !String(f.sourcing_other || "").trim()) e.sourcing = "اكتب الطريقة الأخرى";
  if (!f.substitute) e.substitute = "اختر إجابة";
  if (!f.wants_contact) e.wants_contact = "اختر إجابة";
  if (!f.consent) e.consent = "الموافقة مطلوبة لحفظ تسجيلك";
  return e;
}
const ORDER = ["restaurant_name", "phone", "city", "district", "map_link", "species", "kg", "sourcing", "substitute", "wants_contact", "consent"];

export default function JoinForm({ onDone }) {
  const [s, setS] = useState(blank);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);
  const f = s.f, e = s.tried ? validate(s) : {};
  const patch = (p) => setS((st) => ({ ...st, ...p }));
  const setF = (k, v) => setS((st) => ({ ...st, f: { ...st.f, [k]: v }, error: "" }));
  const toggle = (k, v) => setS((st) => ({ ...st, [k]: st[k].includes(v) ? st[k].filter((x) => x !== v) : st[k].concat(v), error: "" }));

  const addExtra = () => {
    const v = s.extra.trim().slice(0, LIMITS.species);
    if (v) setS((st) => ({ ...st, species: st.species.includes(v) ? st.species : st.species.concat(v), extra: "", error: "" }));
  };

  const send = async () => {
    if (inFlight.current) return;
    const errs = validate(s);
    if (Object.keys(errs).length) {
      patch({ tried: true, error: "راجع الحقول المعلّمة باللون الأحمر." });
      const el = document.getElementById("hj-" + ORDER.find((k) => errs[k]));
      if (el) { el.focus({ preventScroll: true }); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER - 40, behavior: "smooth" }); }
      return;
    }
    const other = s.sourcing.includes(OTHER_SOURCING);
    const body = {
      restaurant_name: f.restaurant_name.trim(), phone: normPhone(f.phone), city: f.city.trim(), district: f.district.trim(), map_link: (f.map_link || "").trim(),
      species: s.species, kg_from: num(f.kg_from), kg_to: num(f.kg_to), sourcing: s.sourcing, sourcing_other: other ? f.sourcing_other.trim() : "",
      substitute: f.substitute, wants_contact: f.wants_contact, note: (f.note || "").trim(), consent: true, website: s.website
    };
    inFlight.current = true;
    setSending(true); patch({ error: "" });
    let error = "";
    try {
      const r = await postJson("/api/submit", body);
      // Success is shown only once the server confirms the record is saved.
      if (r.ok) { setS(blank()); setDone(true); onDone(); }
      else error = r.status === 409 ? "هذا الرقم مسجّل عندنا بصفة أخرى. كلمنا على واتساب ونساعدك." : r.status === 429 ? "محاولات كثيرة خلال وقت قصير. انتظر دقائق ثم حاول مرة ثانية." : r.status === 400 ? "راجع البيانات ثم حاول مرة ثانية." : "ما قدرنا نحفظ التسجيل الآن. بياناتك ما زالت هنا، اضغط «حاول مرة ثانية».";
    } catch {
      error = "ما وصلنا التسجيل بسبب الاتصال. بياناتك ما زالت هنا، تأكد من الإنترنت واضغط «حاول مرة ثانية».";
    }
    inFlight.current = false;
    setSending(false);
    if (error) patch({ error, failed: true });
  };

  const single = (key, title, opts, min) => (
    <fieldset style={fieldset}>
      <legend id={"hj-" + key} tabIndex={-1} style={css("font-weight:600;font-size:17px;padding:0;margin-bottom:6px")}>{title}</legend>
      <div role="radiogroup" aria-labelledby={"hj-" + key} style={cols(min)}>
        {opts.map((x) => <button key={x} type="button" role="radio" aria-checked={f[key] === x} onClick={() => setF(key, x)} style={chip(f[key] === x)}>{x}</button>)}
      </div>
      <span role="alert" style={errStyle}>{e[key] || ""}</span>
    </fieldset>
  );
  const field = (id, label, o = {}) => (
    <div style={css("display:flex;flex-direction:column;gap:6px;min-width:0")}>
      <label htmlFor={"hj-" + id} style={labelStyle}>{label}{o.optional && <span style={hint}> (اختياري)</span>}</label>
      <input id={"hj-" + id} name={id} type={o.type || "text"} inputMode={o.inputMode || "text"} autoComplete={o.auto || "off"} dir={o.dir || "rtl"} placeholder={o.placeholder || ""} value={f[id] || ""} onChange={(ev) => setF(id, ev.target.value)} aria-invalid={!!(e[o.err || id])} maxLength={o.max || LIMITS.name} style={inputStyle(!!(e[o.err || id]), o.extra)} />
      {!o.err && <span role="alert" style={errStyle}>{e[id] || ""}</span>}
    </div>
  );
  const custom = s.species.filter((x) => !SPECIES.includes(x));

  return (
    <section id="join" style={css("scroll-margin-top:" + HEADER + "px;background:#EEF2DA;margin-top:clamp(36px,6vw,64px)")}>
      <div style={css("max-width:640px;margin:0 auto;padding:clamp(36px,6vw,64px) 16px")}>
        {!done ? (
          <div style={css("background:#FFFFFF;border-radius:24px;padding:clamp(18px,5vw,32px);box-shadow:0 12px 32px rgba(22,33,31,.06);display:flex;flex-direction:column;gap:20px")}>
            <div>
              <h2 style={css("font-size:clamp(24px,5vw,30px);font-weight:700;margin:0;line-height:1.4")}>خلّنا نعرف احتياج مطعمك</h2>
              <p style={css("margin:6px 0 0;font-size:16px;color:#546965")}>سجّل احتياجك المبدئي، وحدد إذا ترغب نتواصل معك لترتيب التجربة.</p>
            </div>
            <form noValidate onSubmit={(ev) => { ev.preventDefault(); send(); }} style={css("display:flex;flex-direction:column;gap:20px")}>
              {field("restaurant_name", "اسم المطعم", { auto: "organization" })}
              {field("phone", "رقم واتساب المسؤول", { type: "tel", inputMode: "tel", dir: "ltr", auto: "tel", placeholder: "05XXXXXXXX", max: 16, extra: "text-align:right" })}
              <div className="hp" aria-hidden="true"><label htmlFor="hj-website">الموقع</label><input id="hj-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={s.website} onChange={(ev) => patch({ website: ev.target.value })} /></div>

              <fieldset style={fieldset}>
                <legend style={css("font-weight:600;font-size:17px;padding:0;margin-bottom:6px")}>الموقع</legend>
                <div style={cols(150)}>{field("city", "المدينة", { auto: "address-level2", max: LIMITS.city })}{field("district", "الحي", { max: LIMITS.district })}</div>
                {field("map_link", "رابط الموقع", { optional: true, type: "url", inputMode: "url", dir: "ltr", max: LIMITS.url, placeholder: "https://maps…", extra: "text-align:right" })}
              </fieldset>

              <fieldset style={fieldset}>
                <legend id="hj-species" tabIndex={-1} style={css("font-weight:600;font-size:17px;padding:0")}>وش أصناف الأسماك اللي تحتاجونها عادة؟</legend>
                <span style={hint}>تقدر تختار أكثر من صنف</span>
                <div style={cols(140)}>
                  {SPECIES.map((n) => { const on = s.species.includes(n); return <button key={n} type="button" aria-pressed={on} onClick={() => toggle("species", n)} style={{ ...chip(on), display: "flex", alignItems: "center", gap: "10px" }}>{mark(on)}{n}</button>; })}
                  {custom.map((n) => <button key={n} type="button" aria-label={"حذف " + n} onClick={() => toggle("species", n)} style={{ ...chip(true), display: "flex", alignItems: "center", gap: "10px" }}>{mark(true)}<span style={css("flex:1")}>{n}</span><X size={18} aria-hidden="true" /></button>)}
                </div>
                <div style={css("display:flex;gap:8px")}>
                  <input value={s.extra} onChange={(ev) => patch({ extra: ev.target.value })} onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); addExtra(); } }} maxLength={LIMITS.species} aria-label="صنف آخر" placeholder="صنف آخر" style={inputStyle(false, "flex:1;min-width:0")} />
                  <button type="button" onClick={addExtra} className="hv-soft" style={css("flex:none;border:1.5px solid #2F6666;background:#FFFFFF;color:#2F6666;border-radius:14px;padding:0 18px;font-weight:700;font-size:16px;cursor:pointer;min-height:52px")}>إضافة</button>
                </div>
                <span role="alert" style={errStyle}>{e.species || ""}</span>
              </fieldset>

              <fieldset style={fieldset}>
                <legend id="hj-kg" tabIndex={-1} style={css("font-weight:600;font-size:17px;padding:0;margin-bottom:6px")}>كم يتراوح احتياجكم من الأسماك يوميًا تقريبًا؟</legend>
                <div style={css("display:grid;grid-template-columns:1fr 1fr;gap:10px")}>
                  {field("kg_from", "من (كجم)", { inputMode: "decimal", dir: "ltr", max: 10, extra: "text-align:right", err: "kg" })}
                  {field("kg_to", "إلى (كجم)", { inputMode: "decimal", dir: "ltr", max: 10, extra: "text-align:right", err: "kg" })}
                </div>
                <span role="alert" style={errStyle}>{e.kg || ""}</span>
              </fieldset>

              <fieldset style={fieldset}>
                <legend id="hj-sourcing" tabIndex={-1} style={css("font-weight:600;font-size:17px;padding:0")}>كيف تأمّنون احتياجكم من الأسماك حاليًا؟</legend>
                <span style={hint}>تقدر تختار أكثر من طريقة</span>
                <div style={cols(220)}>
                  {SOURCING.map((n) => { const on = s.sourcing.includes(n); return <button key={n} type="button" aria-pressed={on} onClick={() => toggle("sourcing", n)} style={{ ...chip(on), display: "flex", alignItems: "center", gap: "10px" }}>{mark(on)}{n}</button>; })}
                </div>
                {s.sourcing.includes(OTHER_SOURCING) && <input aria-label="الطريقة الأخرى" placeholder="اكتب الطريقة باختصار" value={f.sourcing_other || ""} onChange={(ev) => setF("sourcing_other", ev.target.value)} maxLength={LIMITS.other} style={inputStyle(!!e.sourcing && !String(f.sourcing_other || "").trim())} />}
                <span role="alert" style={errStyle}>{e.sourcing || ""}</span>
              </fieldset>

              {single("substitute", "إذا ما اكتملت الكمية من الحراج، هل تقبلون نكمل المتبقي من نفس الصنف من محل أسماك طازجة؟", SUBSTITUTE, 90)}
              {single("wants_contact", "هل ترغب نتواصل معك لترتيب تجربة؟", YESNO, 120)}

              <div style={css("display:flex;flex-direction:column;gap:6px")}>
                <label htmlFor="hj-note" style={labelStyle}>عندك سؤال أو ملاحظة؟ <span style={hint}>— اختياري</span></label>
                <span style={hint}>اكتبها، وأبشر بدراستها</span>
                <textarea id="hj-note" rows={3} value={f.note || ""} onChange={(ev) => setF("note", ev.target.value)} maxLength={LIMITS.note} placeholder="اكتب سؤالك أو ملاحظتك هنا…" style={inputStyle(false, "resize:vertical;min-height:96px")}></textarea>
              </div>

              <div>
                <label style={css("display:flex;align-items:flex-start;gap:12px;cursor:pointer;font-size:16px")}>
                  <input id="hj-consent" type="checkbox" checked={!!f.consent} onChange={(ev) => setF("consent", ev.target.checked)} aria-invalid={!!e.consent} style={css("width:24px;height:24px;margin:2px 0 0;flex:none;accent-color:#2F6666")} />
                  <span>أوافق على استخدام بياناتي لتنظيم التجربة والتواصل معي إذا رغبت، وفق <a href="/privacy">سياسة الخصوصية</a></span>
                </label>
                <span role="alert" style={errStyle}>{e.consent || ""}</span>
              </div>

              <p role="alert" style={css("margin:0;font-size:16px;font-weight:700;color:#A54B4B")}>{s.error}</p>
              <button type="submit" disabled={sending} aria-busy={sending} className="hv-teal" style={css("background:#2F6666;color:#FFFFFF;border:0;border-radius:999px;padding:14px;min-height:56px;font-size:18px;font-weight:700;cursor:pointer;opacity:" + (sending ? 0.7 : 1))}>{sending ? "جارٍ الحفظ…" : s.failed ? "حاول مرة ثانية" : "سجّل اهتمامك"}</button>
              <p style={css("margin:0;font-size:16px;color:#546965;text-align:center")}>التسجيل لإبداء الاهتمام ولا يلزمك بطلب أو دفع</p>
            </form>
          </div>
        ) : (
          <div role="status" style={css("background:#FFFFFF;border-radius:24px;padding:clamp(22px,6vw,40px);display:flex;flex-direction:column;gap:12px;align-items:flex-start")}>
            <CheckCircle size={52} color="#7D8A2A" aria-hidden="true" />
            <h2 style={css("font-size:clamp(24px,5vw,30px);font-weight:700;margin:0")}>تم تسجيل اهتمامك</h2>
            <p style={css("margin:0;font-size:17px;color:#2B3D3A")}>شكرًا لك. إذا اخترت أن نتواصل معك، نكلمك عبر واتساب لترتيب التجربة.</p>
          </div>
        )}
      </div>
    </section>
  );
}
