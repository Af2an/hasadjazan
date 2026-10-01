import { useState } from "react";
import { MoonStars, SunHorizon, X, CheckCircle } from "@phosphor-icons/react";
import { css } from "../lib/css.js";
import { postJson, normPhone } from "../lib/api.js";
import { REGIONS, SPECIES, NEED, YESNO, DELIVERY, KIND, SHOP_KIND, PHONE_RE, LIMITS } from "../../shared/constants.js";

const QUALITY = ["السمك طازج وخالٍ من علامات التلف.", "الصنف مطابق لما تم عرضه.", "الكمية والوزن مطابقان عند الاستلام.", "السمك محفوظ بطريقة مناسبة حتى الاستلام.", "يتم الإفصاح الصحيح عن مصدر الكمية.", "يحق لحصاد جازان رفض الجزء غير المطابق عند الفحص."];
const HEADER = 76;
const blank = () => ({ f: {}, species: [], extras: [], extra: "", quality: false, qualityOpen: false, tried: false, error: "", website: "" });

const tab = (on) => css("min-height:48px;border-radius:999px;border:0;cursor:pointer;font-size:16px;font-weight:" + (on ? 700 : 500) + ";background:" + (on ? "#2F6666" : "transparent") + ";color:" + (on ? "#FFFFFF" : "#16211F"));
const chip = (on) => css("min-height:46px;padding:10px 18px;border-radius:999px;cursor:pointer;font-size:15px;font-weight:" + (on ? 700 : 500) + ";border:1.5px solid " + (on ? "#2F6666" : "#DCE5DF") + ";background:" + (on ? "#2F6666" : "#FFFFFF") + ";color:" + (on ? "#FFFFFF" : "#16211F"));
export const inputStyle = (bad, extra) => css("width:100%;min-height:52px;padding:12px 14px;background:#FBFCFB;border-radius:14px;font-size:16px;color:#16211F;border:" + (bad ? "1.5px solid #A54B4B" : "1px solid #DCE5DF") + ";" + (extra || ""));
const errStyle = css("font-size:14px;color:#A54B4B");
const labelStyle = css("font-weight:700;font-size:16px");
const fieldset = css("border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:10px");

function validate(type, s) {
  const f = s.f, e = {}, rest = type === "restaurant";
  const need = rest ? ["restaurant_name", "contact_name", "phone", "city"] : ["name", "phone"];
  if (!rest && f.kind === SHOP_KIND) need.push("shop_name");
  need.forEach((k) => { if (!String(f[k] || "").trim()) e[k] = "هذا الحقل مطلوب"; });
  if (f.phone && !PHONE_RE.test(normPhone(f.phone))) e.phone = "اكتب رقمًا يبدأ بـ 05 ويتكون من 10 أرقام";
  if (rest && !f.region) e.region = "اختر المنطقة";
  if (rest && !f.need) e.need = "اختر إجابة";
  if (!rest && !f.kind) e.kind = "اختر إجابة";
  if (!f.trial) e.trial = "اختر إجابة";
  if (!rest && !f.delivery) e.delivery = "اختر إجابة";
  if (!s.species.length && !s.extras.length) e.species = "اختر صنفًا واحدًا على الأقل";
  if (!rest && !s.quality) e.quality = "الموافقة على إقرار الجودة مطلوبة";
  return e;
}

export default function JoinForm({ type, setType, onDone }) {
  const [s, setS] = useState(blank);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [shownType, setShownType] = useState(type);

  // Switching between the two forms starts from a clean form.
  if (shownType !== type) { setShownType(type); setS(blank()); setDone(false); }

  const rest = type === "restaurant", f = s.f;
  const e = s.tried ? validate(type, s) : {};
  const patch = (p) => setS((st) => ({ ...st, ...p }));
  const setF = (k, v) => setS((st) => ({ ...st, f: { ...st.f, [k]: v }, error: "" }));

  const addExtra = () => {
    const v = s.extra.trim().slice(0, LIMITS.species);
    if (!v) return;
    setS((st) => ({
      ...st,
      extras: st.extras.includes(v) || SPECIES.includes(v) ? st.extras : st.extras.concat(v),
      species: SPECIES.includes(v) && !st.species.includes(v) ? st.species.concat(v) : st.species,
      extra: "", error: ""
    }));
  };

  const focusFirstError = (errs) => {
    const k = ["kind", "restaurant_name", "contact_name", "name", "shop_name", "phone", "region", "city"].find((x) => errs[x]);
    const el = k && document.getElementById(k === "region" ? "hj-region" : k === "city" ? "hj-city" : k);
    if (el) { el.focus({ preventScroll: true }); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER - 40, behavior: "smooth" }); }
  };

  const send = async () => {
    const errs = validate(type, s);
    if (Object.keys(errs).length) { patch({ tried: true, error: "راجع الحقول المطلوبة." }); focusFirstError(errs); return; }
    const species = s.species.concat(s.extras), note = (f.note || "").trim();
    const body = rest
      ? { type: "restaurant", restaurant_name: f.restaurant_name.trim(), contact_name: f.contact_name.trim(), phone: normPhone(f.phone), region: f.region, city: f.city.trim(), need: f.need, species, trial: f.trial, note, website: s.website }
      : { type: "fish", kind: f.kind, name: f.name.trim(), shop_name: f.kind === SHOP_KIND ? f.shop_name.trim() : null, phone: normPhone(f.phone), species, trial: f.trial, delivery: f.delivery, quality: true, note, website: s.website };
    setSending(true); patch({ error: "" });
    try {
      const r = await postJson("/api/submit", body);
      setSending(false);
      if (r.ok) { setS(blank()); setDone(true); onDone(); return; }
      patch({ error: r.status === 429 ? "محاولات كثيرة، حاول بعد قليل." : r.status === 400 ? "راجع البيانات وحاول مرة ثانية." : "تعذّر الإرسال الآن. حاول مرة ثانية أو تواصل معنا عبر واتساب." });
    } catch {
      setSending(false);
      patch({ error: "تعذّر الاتصال. تأكد من الإنترنت وحاول مرة ثانية." });
    }
  };

  const group = (key, title, opts) => (
    <fieldset key={key} style={fieldset}>
      <legend style={css("font-weight:700;font-size:16px;padding:0;margin-bottom:10px")}>{title}</legend>
      <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
        {opts.map((o) => <button key={o} type="button" aria-pressed={f[key] === o} onClick={() => setF(key, o)} style={chip(f[key] === o)}>{o}</button>)}
      </div>
      <span role="alert" style={errStyle}>{e[key] || ""}</span>
    </fieldset>
  );

  const field = (id, label, o = {}) => (
    <div key={id} style={css("display:flex;flex-direction:column;gap:6px")}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <input id={id} name={id} type={o.type || "text"} inputMode={o.inputMode || "text"} autoComplete={o.auto || "off"} dir={o.dir || "rtl"} placeholder={o.placeholder || ""} value={f[id] || ""} onChange={(ev) => setF(id, ev.target.value)} aria-invalid={!!e[id]} maxLength={o.max || LIMITS.name} style={inputStyle(!!e[id], o.extra)} />
      <span role="alert" style={errStyle}>{e[id] || ""}</span>
    </div>
  );
  const phone = field("phone", "رقم الجوال أو واتساب", { type: "tel", inputMode: "tel", dir: "ltr", auto: "tel", placeholder: "05XXXXXXXX", max: 16, extra: "text-align:right" });

  return (
    <section id="join" style={css("scroll-margin-top:72px;background:#EEF2DA")}>
      <div style={css("max-width:680px;margin:0 auto;padding:clamp(56px,8vw,88px) 16px")}>
        <div role="tablist" aria-label="نوع التسجيل" style={css("display:grid;grid-template-columns:1fr 1fr;gap:4px;background:#FFFFFF;border-radius:999px;padding:5px;box-shadow:inset 0 0 0 1px #DCE5DF;margin-bottom:24px")}>
          <button type="button" role="tab" aria-selected={rest} onClick={() => setType("restaurant")} style={tab(rest)}>أنا مطعم</button>
          <button type="button" role="tab" aria-selected={!rest} onClick={() => setType("fish")} style={tab(!rest)}>لدي أسماك</button>
        </div>

        {!done ? (
          <div style={css("background:#FFFFFF;border-radius:24px;padding:clamp(20px,5vw,36px);box-shadow:0 1px 2px rgba(22,33,31,.06),0 12px 32px rgba(22,33,31,.06);display:flex;flex-direction:column;gap:24px")}>
            <div style={css("display:flex;flex-direction:column;gap:8px")}>
              <h2 style={css("font-size:clamp(26px,5.5vw,34px);font-weight:800;margin:0;line-height:1.35")}>{rest ? "عرّفنا على مطعمك" : "عرّفنا على نشاطك"}</h2>
              <p style={css("margin:0;font-size:15px;color:#546965;white-space:pre-line;text-wrap:pretty")}>{rest ? "نجمع هذه المعلومات لفهم احتياج المطاعم وتجهيز تجربة حصاد جازان الأولى، والتواصل مع المهتمين بالتجربة." : "حصاد جازان تجمع احتياجات المطاعم وتحوّلها إلى احتياج مجمّع. إذا كان عندك جزء من الكمية، تقدر تعرض الكمية المتوفرة لديك وسعرك.\nالاستلام في التجربة التشغيلية مستقبلًا يكون في حراج جازان، وفي الوقت الذي تحدده حصاد جازان مسبقًا."}</p>
              {rest && (
                <div style={css("display:flex;align-items:center;gap:12px;background:#EEF2DA;border-radius:16px;padding:12px 14px;margin-top:4px")}>
                  <MoonStars weight="duotone" size={26} aria-hidden="true" style={css("flex:none;color:#2F6666")} />
                  <strong style={css("font-size:16px;font-weight:800;line-height:1.5")}>نستلم احتياجك في المساء وتستلمه في الصباح</strong>
                  <SunHorizon weight="duotone" size={26} color="#7D8A2A" aria-hidden="true" style={css("flex:none;margin-inline-start:auto")} />
                </div>
              )}
            </div>

            <form noValidate onSubmit={(ev) => { ev.preventDefault(); if (!sending) send(); }} style={css("display:flex;flex-direction:column;gap:22px")}>
              {!rest && group("kind", "صياد أو محل أسماك", KIND)}

              {rest
                ? [field("restaurant_name", "اسم المطعم", { auto: "organization" }), field("contact_name", "اسم المسؤول", { auto: "name" }), phone]
                : [field("name", "الاسم", { auto: "name" }), f.kind === SHOP_KIND ? field("shop_name", "اسم المحل", { auto: "organization" }) : null, phone]}

              <div className="hp" aria-hidden="true">
                <label htmlFor="hj-website">الموقع</label>
                <input id="hj-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={s.website} onChange={(ev) => patch({ website: ev.target.value })} />
              </div>

              {rest && (
                <>
                  <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px")}>
                    <div style={css("display:flex;flex-direction:column;gap:6px")}>
                      <label htmlFor="hj-region" style={labelStyle}>المنطقة</label>
                      <select id="hj-region" value={f.region || ""} onChange={(ev) => setF("region", ev.target.value)} aria-invalid={!!e.region} style={inputStyle(!!e.region, "appearance:auto")}>
                        <option value="">اختر المنطقة</option>
                        {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <span role="alert" style={errStyle}>{e.region || ""}</span>
                    </div>
                    <div style={css("display:flex;flex-direction:column;gap:6px")}>
                      <label htmlFor="hj-city" style={labelStyle}>المدينة</label>
                      <input id="hj-city" autoComplete="address-level2" value={f.city || ""} onChange={(ev) => setF("city", ev.target.value)} placeholder="مثل أبوعريش" maxLength={LIMITS.city} aria-invalid={!!e.city} style={inputStyle(!!e.city)} />
                      <span role="alert" style={errStyle}>{e.city || ""}</span>
                    </div>
                  </div>
                  {!!f.region && f.region !== "جازان" && (
                    <p style={css("margin:-8px 0 0;font-size:14px;color:#2F6666;background:#EFF4F0;border-radius:12px;padding:12px 14px")}>نسجل مطعمك الحين، والتجربة الأولى في منطقة جازان ونتواصل معك أول ما نوصل منطقتك</p>
                  )}
                  {group("need", "كم يبلغ احتياجك المعتاد في الطلب الواحد؟", NEED)}
                </>
              )}

              <fieldset style={fieldset}>
                <legend style={css("font-weight:700;font-size:16px;padding:0;margin-bottom:4px")}>{rest ? "عرّفنا على أصنافك" : "الأصناف المتوفرة عادة"}</legend>
                <span style={css("font-size:14px;color:#546965")}>اختر كل ما يناسبك</span>
                <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
                  {SPECIES.map((n) => {
                    const on = s.species.includes(n);
                    return <button key={n} type="button" aria-pressed={on} onClick={() => setS((st) => ({ ...st, species: on ? st.species.filter((x) => x !== n) : st.species.concat(n), error: "" }))} style={chip(on)}>{n}</button>;
                  })}
                  {s.extras.map((x) => (
                    <button key={x} type="button" aria-label={"حذف " + x} onClick={() => setS((st) => ({ ...st, extras: st.extras.filter((y) => y !== x) }))} style={css("min-height:44px;padding:8px 14px;border-radius:999px;cursor:pointer;font-size:15px;font-weight:700;border:1.5px solid #2F6666;background:#2F6666;color:#FFFFFF;display:inline-flex;align-items:center;gap:6px")}>{x} <X weight="duotone" aria-hidden="true" /></button>
                  ))}
                </div>
                <div style={css("display:flex;gap:8px")}>
                  <input value={s.extra} onChange={(ev) => patch({ extra: ev.target.value })} onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); addExtra(); } }} maxLength={LIMITS.species} aria-label="صنف آخر" placeholder="صنف آخر" style={css("flex:1;min-width:0;font-size:16px;min-height:50px;padding:12px 14px;border-radius:14px;border:1px solid #DCE5DF;background:#FBFCFB;color:#16211F")} />
                  <button type="button" onClick={addExtra} className="hv-soft" style={css("flex:none;border:1.5px solid #2F6666;background:#FFFFFF;color:#2F6666;border-radius:999px;padding:0 18px;font-weight:700;font-size:15px;cursor:pointer;min-height:50px")}>إضافة</button>
                </div>
                <span role="alert" style={errStyle}>{e.species || ""}</span>
              </fieldset>

              {group("trial", "عندك استعداد لتجربة حصاد جازان؟", YESNO)}
              {!rest && group("delivery", "هل تستطيع التسليم في حراج جازان في الوقت الذي تحدده حصاد جازان مسبقًا؟", DELIVERY)}

              {!rest && (
                <div style={css("display:flex;flex-direction:column;gap:12px;background:#F4F7F5;border-radius:16px;padding:18px")}>
                  <h3 style={css("font-size:18px;font-weight:800;margin:0")}>إقرار جودة حصاد جازان</h3>
                  <button type="button" aria-expanded={s.qualityOpen} onClick={() => patch({ qualityOpen: !s.qualityOpen })} className="hv-soft" style={css("align-self:flex-start;border:1.5px solid #2F6666;background:#FFFFFF;color:#2F6666;border-radius:999px;padding:8px 18px;min-height:44px;font-weight:700;font-size:15px;cursor:pointer")}>{s.qualityOpen ? "إخفاء الإقرار" : "عرض إقرار الجودة"}</button>
                  {s.qualityOpen && (
                    <ol style={css("margin:0;padding:0 20px 0 0;display:flex;flex-direction:column;gap:6px;font-size:15px")}>
                      {QUALITY.map((q) => <li key={q}>{q}</li>)}
                    </ol>
                  )}
                  <label style={css("display:flex;align-items:center;gap:12px;cursor:pointer;min-height:44px")}>
                    <input type="checkbox" checked={s.quality} onChange={(ev) => patch({ quality: ev.target.checked, error: "" })} style={css("width:24px;height:24px;accent-color:#2F6666;margin:0;flex:none")} />
                    <span style={css("font-weight:700")}>أوافق على إقرار جودة حصاد جازان</span>
                  </label>
                  <span role="alert" style={errStyle}>{e.quality || ""}</span>
                </div>
              )}

              <div style={css("display:flex;flex-direction:column;gap:6px")}>
                <label htmlFor="hj-note" style={labelStyle}>{rest ? "عندك ملاحظة أو شيء تتمنى حصاد جازان تساعدك فيه؟" : "عندك ملاحظة أو اقتراح؟ اكتبها لنا وتبشر بدراستها"} <span style={css("font-weight:400;color:#546965;font-size:14px")}>(اختياري)</span></label>
                <textarea id="hj-note" value={f.note || ""} onChange={(ev) => setF("note", ev.target.value)} rows={3} maxLength={LIMITS.note} style={css("font-size:16px;padding:12px 14px;border-radius:14px;border:1px solid #DCE5DF;background:#FBFCFB;color:#16211F;resize:vertical;min-height:96px")}></textarea>
              </div>

              <p role="alert" style={css("margin:0;font-size:15px;font-weight:700;color:#A54B4B")}>{s.error}</p>
              <button type="submit" disabled={sending} className="hv-teal" style={css("background:#2F6666;color:#FFFFFF;border:0;border-radius:999px;padding:16px;min-height:56px;font-size:17px;font-weight:700;cursor:pointer")}>{sending ? "جارٍ الإرسال…" : "إرسال"}</button>
              <p style={css("margin:0;font-size:13px;color:#546965;text-wrap:pretty")}>بإرسالك النموذج أنت توافق على استخدام بياناتك لتجهيز تجربة حصاد جازان والتواصل معك بشأنها وفق <a href="/privacy">سياسة الخصوصية</a></p>
            </form>
          </div>
        ) : (
          <div role="status" style={css("background:#FFFFFF;border-radius:24px;padding:clamp(24px,6vw,44px);box-shadow:0 12px 32px rgba(22,33,31,.06);display:flex;flex-direction:column;gap:14px;align-items:flex-start")}>
            <CheckCircle weight="duotone" size={56} color="#7D8A2A" aria-hidden="true" />
            <h2 style={css("font-size:clamp(26px,5.5vw,34px);font-weight:800;margin:0")}>شكرًا، وصلتنا بياناتك</h2>
            <p style={css("margin:0;color:#546965")}>{rest ? "نراجع احتياج مطعمك، ونتواصل معك إذا كنت من المهتمين بالتجربة." : "نراجع بياناتك، ونتواصل معك إذا كنت من المهتمين بالتجربة."}</p>
            <button type="button" onClick={() => { setS(blank()); setDone(false); }} className="hv-soft" style={css("border:1.5px solid #2F6666;background:#FFFFFF;color:#2F6666;border-radius:999px;padding:12px 24px;min-height:48px;font-weight:700;font-size:15px;cursor:pointer")}>إرسال نموذج آخر</button>
          </div>
        )}
      </div>
    </section>
  );
}
