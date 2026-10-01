import { useCallback, useEffect, useState } from "react";
import { css } from "../lib/css.js";
import { getJson, postJson, toNumber } from "../lib/api.js";
import { SPECIES, LIMITS } from "../../shared/constants.js";
import logo from "../assets/logo-h.png";

// Order summary for one restaurant: composed by the admin, saved in the admin
// panel, printed or saved as PDF, and handed over outside the site. It is never
// shown to the public; it is a summary, not a tax invoice.

const input = css("min-height:48px;padding:10px 14px;background:#FBFCFB;border:1px solid #DCE5DF;border-radius:14px;font-size:16px;color:#16211F;min-width:0");
const card = css("background:#FFFFFF;border:1px solid #DCE5DF;border-radius:16px;padding:20px");
const primary = css("min-height:48px;padding:10px 22px;background:#2F6666;color:#FFFFFF;border:none;border-radius:999px;font-size:15px;font-weight:700;cursor:pointer");
const soft = css("min-height:44px;display:inline-flex;align-items:center;padding:8px 18px;background:#EFF4F0;color:#2F6666;border:none;border-radius:999px;font-size:15px;font-weight:700;cursor:pointer");
const ghost = css("min-height:44px;padding:8px 18px;background:transparent;border:1px solid #DCE5DF;border-radius:999px;font-size:15px;cursor:pointer;color:#16211F");
const label = css("display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600;flex:1 1 180px;min-width:0");
const small = css("min-height:38px;padding:6px 14px;background:transparent;border:1px solid #DCE5DF;border-radius:999px;font-size:13px;cursor:pointer;color:#16211F");
const th = css("text-align:start;padding:8px 10px;font-size:13px;color:#546965;font-weight:600;border-bottom:1px solid #DCE5DF");
const td = css("padding:10px;border-bottom:1px solid #EDF2EE;font-size:15px;vertical-align:top");

const sar = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
const kg = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " كجم";
const num = (v) => { const n = toNumber(v); return n > 0 ? n : 0; };
const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
const fmtDay = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { return d; } };
const blankLine = () => ({ species: "", kg: "", price: "", source: "حراج جازان" });

const blankForm = () => ({ restaurant: "", date: tomorrow(), service: "", transport: "", note: "" });
const totalOf = (x) => x.lines.reduce((a, l) => a + l.kg * l.price, 0) + x.service_fee + x.transport_fee;

export default function OrderSummary({ restaurants, csrf, onExpired }) {
  const [f, setF] = useState(blankForm);
  const [lines, setLines] = useState([blankLine()]);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [status, setStatus] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getJson("/api/admin/summaries");
      if (r.status === 401) return onExpired();
      if (r.ok) setSaved(r.data);
    } catch { /* the form still works without the list */ }
  }, [onExpired]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (ev) => setF((x) => ({ ...x, [k]: ev.target.value }));
  const setLine = (i, k) => (ev) => setLines((list) => list.map((x, j) => (j === i ? { ...x, [k]: ev.target.value } : x)));

  const rows = lines.map((l) => ({ ...l, species: l.species.trim(), source: l.source.trim(), w: num(l.kg), p: num(l.price) })).filter((l) => l.species && l.w > 0);
  const weight = rows.reduce((a, l) => a + l.w, 0);
  const fish = rows.reduce((a, l) => a + l.w * l.p, 0);
  const service = num(f.service), transport = num(f.transport);
  const total = fish + service + transport;
  const allIn = weight > 0 ? total / weight : 0;
  const ready = !!f.restaurant.trim() && rows.length > 0;

  const asText = () => [
    "حصاد جازان | ملخص طلب",
    "المطعم: " + f.restaurant.trim(),
    "التاريخ: " + fmtDay(f.date),
    "",
    ...rows.map((l) => "• " + l.species + ": " + kg(l.w) + " × " + sar(l.p) + " = " + sar(l.w * l.p) + (l.source ? "\n  المصدر: " + l.source : "")),
    "",
    "مجموع الأسماك: " + sar(fish) + " (" + kg(weight) + ")",
    "رسوم الخدمة: " + sar(service),
    "النقل: " + sar(transport),
    "الإجمالي: " + sar(total),
    "سعر الكيلو شاملًا الخدمة والنقل: " + sar(allIn),
    ...(f.note.trim() ? ["", f.note.trim()] : []),
    "",
    "هذا ملخص طلب وليس فاتورة ضريبية."
  ].join("\n");
  const reset = () => { setF(blankForm()); setLines([blankLine()]); setCurrentId(null); setStatus({ text: "", bad: false }); };
  const openSaved = (x) => {
    setF({ restaurant: x.restaurant_name, date: x.date, service: x.service_fee ? String(x.service_fee) : "", transport: x.transport_fee ? String(x.transport_fee) : "", note: x.note || "" });
    setLines(x.lines.map((l) => ({ species: l.species, kg: String(l.kg), price: String(l.price), source: l.source || "" })));
    setCurrentId(x.id); setStatus({ text: "", bad: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const save = async () => {
    if (busy || !ready) return;
    setBusy(true);
    const body = { restaurant_name: f.restaurant.trim(), date: f.date, lines: rows.map((l) => ({ species: l.species, kg: l.w, price: l.p, source: l.source })), service_fee: service, transport_fee: transport, note: f.note.trim() };
    try {
      const r = await postJson(currentId ? "/api/admin/summaries/" + currentId + "/update" : "/api/admin/summaries", body, csrf);
      setBusy(false);
      if (r.status === 401) return onExpired();
      if (!r.ok) return setStatus({ text: "تعذّر الحفظ. راجع البيانات.", bad: true });
      const wasNew = !currentId;
      if (wasNew) reset();
      setStatus({ text: wasNew ? "تم الحفظ. ستجده في القائمة تحت." : "تم حفظ التعديل.", bad: false });
      load();
    } catch { setBusy(false); setStatus({ text: "تعذّر الاتصال.", bad: true }); }
  };
  const remove = async (x) => {
    if (!window.confirm("حذف ملخص " + x.restaurant_name + " بتاريخ " + x.date + " نهائيًا. متابعة؟")) return;
    try {
      const r = await postJson("/api/admin/summaries/" + x.id + "/delete", {}, csrf);
      if (r.status === 401) return onExpired();
      if (x.id === currentId) reset();
      load();
    } catch { setStatus({ text: "تعذّر الاتصال.", bad: true }); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(asText()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ } };

  return (
    <div style={css("display:flex;flex-direction:column;gap:14px")}>
      <div data-noprint="1" style={{ ...card, display: "flex", flexDirection: "column", gap: "14px" }}>
        <h2 style={css("margin:0;font-size:20px;font-weight:700")}>{currentId ? "تعديل ملخص محفوظ" : "ملخص طلب لمطعم"}</h2>
        <p style={css("margin:0;font-size:14px;color:#546965")}>تعبّيه وتحفظه في اللوحة، ثم تطبعه أو ترسله للمطعم. يظهر لكم فقط ولا يظهر للزوار.</p>
        <div style={css("display:flex;flex-wrap:wrap;gap:12px")}>
          <label style={label}>المطعم
            <input list="os-restaurants" value={f.restaurant} maxLength={LIMITS.name} placeholder="اختر أو اكتب الاسم" onChange={set("restaurant")} style={input} />
            <datalist id="os-restaurants">{restaurants.map((r) => <option key={r.id} value={r.restaurant_name} />)}</datalist>
          </label>
          <label style={label}>التاريخ<input type="date" value={f.date} onChange={set("date")} style={input} /></label>
        </div>

        <datalist id="os-species">{SPECIES.map((n) => <option key={n} value={n} />)}</datalist>
        <div style={css("display:flex;flex-direction:column;gap:10px")}>
          {lines.map((x, i) => (
            <div key={i} style={css("display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding-bottom:10px;border-bottom:1px solid #EDF2EE")}>
              <input list="os-species" aria-label="الصنف" placeholder="الصنف" value={x.species} maxLength={LIMITS.species} onChange={setLine(i, "species")} style={{ ...input, flex: "2 1 150px" }} />
              <input aria-label="الوزن بالكيلو" placeholder="الوزن (كجم)" inputMode="decimal" dir="ltr" value={x.kg} maxLength={9} onChange={setLine(i, "kg")} style={{ ...input, flex: "1 1 110px", textAlign: "right" }} />
              <input aria-label="سعر الكيلو في الحراج" placeholder="سعر الكيلو (ر.س)" inputMode="decimal" dir="ltr" value={x.price} maxLength={9} onChange={setLine(i, "price")} style={{ ...input, flex: "1 1 130px", textAlign: "right" }} />
              <input aria-label="المصدر" placeholder="المصدر" value={x.source} maxLength={80} onChange={setLine(i, "source")} style={{ ...input, flex: "2 1 150px" }} />
              {lines.length > 1 && <button type="button" onClick={() => setLines((list) => list.filter((y, j) => j !== i))} style={ghost}>حذف</button>}
            </div>
          ))}
          {lines.length < LIMITS.demandItems && <button type="button" onClick={() => setLines((list) => list.concat(blankLine()))} style={{ ...soft, alignSelf: "flex-start" }}>+ صنف</button>}
        </div>

        <div style={css("display:flex;flex-wrap:wrap;gap:12px")}>
          <label style={label}>رسوم الخدمة (ر.س)<input inputMode="decimal" dir="ltr" value={f.service} maxLength={9} onChange={set("service")} style={{ ...input, textAlign: "right" }} /></label>
          <label style={label}>النقل (ر.س)<input inputMode="decimal" dir="ltr" value={f.transport} maxLength={9} onChange={set("transport")} style={{ ...input, textAlign: "right" }} /></label>
        </div>
        <label style={label}>ملاحظة (اختياري)<textarea value={f.note} onChange={set("note")} rows={2} maxLength={LIMITS.note} style={{ ...input, resize: "vertical" }}></textarea></label>
        <div style={css("display:flex;flex-wrap:wrap;gap:10px")}>
          <button type="button" disabled={!ready || busy} onClick={save} style={{ ...primary, opacity: ready ? 1 : 0.5 }}>{busy ? "لحظة…" : currentId ? "حفظ التعديل" : "حفظ في اللوحة"}</button>
          <button type="button" disabled={!ready} onClick={() => window.print()} style={{ ...soft, opacity: ready ? 1 : 0.5 }}>طباعة / حفظ PDF</button>
          <button type="button" disabled={!ready} onClick={copy} style={{ ...soft, opacity: ready ? 1 : 0.5 }}>{copied ? "تم النسخ" : "نسخ كنص للواتساب"}</button>
          {(currentId || rows.length > 0 || f.restaurant) && <button type="button" onClick={reset} style={{ ...ghost, marginInlineStart: "auto" }}>ملخص جديد</button>}
        </div>
        {status.text && <p role={status.bad ? "alert" : "status"} style={css("margin:0;font-size:14px;font-weight:700;color:" + (status.bad ? "#A54B4B" : "#2F6666"))}>{status.text}</p>}
        {!ready && <p style={css("margin:0;font-size:14px;color:#546965")}>اكتب اسم المطعم وصنفًا واحدًا على الأقل بوزنه.</p>}
      </div>

      {/* the sheet that gets printed */}
      <section data-print="1" style={{ ...card, display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={css("display:flex;align-items:center;gap:12px")}>
          <img src={logo} alt="حصاد جازان" className="only-light" style={css("height:34px;width:auto")} />
          <strong className="only-dark" style={css("font-size:20px")}>حصاد جازان</strong>
          <strong style={css("margin-inline-start:auto;font-size:20px;font-weight:800")}>ملخص طلب</strong>
        </div>
        <div style={css("display:flex;flex-wrap:wrap;gap:6px 24px;font-size:15px;color:#546965")}>
          <span>المطعم: <strong style={css("color:#16211F;overflow-wrap:anywhere")}>{f.restaurant.trim() || "—"}</strong></span>
          <span>التاريخ: <strong style={css("color:#16211F")}>{fmtDay(f.date)}</strong></span>
        </div>
        <table style={css("width:100%;border-collapse:collapse")}>
          <thead><tr><th style={th}>الصنف</th><th style={th}>الوزن</th><th style={th}>سعر الكيلو</th><th style={th}>المجموع</th></tr></thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={i}>
                <td style={td}><strong>{l.species}</strong>{l.source && <div style={css("font-size:13px;color:#546965")}>المصدر: {l.source}</div>}</td>
                <td style={td}>{kg(l.w)}</td><td style={td}>{sar(l.p)}</td><td style={{ ...td, fontWeight: 700 }}>{sar(l.w * l.p)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td style={{ ...td, color: "var(--t-546965, #546965)" }} colSpan={4}>لا توجد أصناف بعد.</td></tr>}
          </tbody>
        </table>
        <dl style={css("margin:0;display:flex;flex-direction:column;gap:6px;font-size:15px")}>
          {[["مجموع الأسماك (" + kg(weight) + ")", sar(fish)], ["رسوم الخدمة", sar(service)], ["النقل", sar(transport)]].map(([k, v]) => (
            <div key={k} style={css("display:flex;justify-content:space-between;gap:12px")}><dt style={css("color:#546965")}>{k}</dt><dd style={css("margin:0;font-weight:600")}>{v}</dd></div>
          ))}
          <div style={css("display:flex;justify-content:space-between;gap:12px;padding-top:10px;border-top:1px solid #DCE5DF;font-size:18px")}><dt style={css("font-weight:800")}>الإجمالي</dt><dd style={css("margin:0;font-weight:800")}>{sar(total)}</dd></div>
          <div style={css("display:flex;justify-content:space-between;gap:12px")}><dt style={css("color:#546965")}>سعر الكيلو شاملًا الخدمة والنقل</dt><dd style={css("margin:0;font-weight:700;color:#2F6666")}>{sar(allIn)}</dd></div>
        </dl>
        {f.note.trim() && <p style={css("margin:0;font-size:14px;white-space:pre-line;overflow-wrap:anywhere")}>{f.note.trim()}</p>}
        <p style={css("margin:0;font-size:12px;color:#546965")}>سعر الكيلو هو سعر الحراج يوم التوريد. هذا ملخص طلب وليس فاتورة ضريبية.</p>
      </section>

      <div data-noprint="1" style={{ ...card, display: "flex", flexDirection: "column", gap: "10px" }}>
        <h2 style={css("margin:0;font-size:18px;font-weight:700")}>الملخصات المحفوظة ({saved.length})</h2>
        {saved.length === 0 && <p style={css("margin:0;font-size:14px;color:#546965")}>لا يوجد ملخص محفوظ بعد.</p>}
        {saved.map((x) => (
          <div key={x.id} style={css("display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:12px 14px;background:#FBFCFB;border:1px solid " + (x.id === currentId ? "#2F6666" : "#EDF2EE") + ";border-radius:14px;font-size:15px")}>
            <strong style={css("overflow-wrap:anywhere")}>{x.restaurant_name}</strong>
            <span dir="ltr" style={css("color:#546965;font-size:14px")}>{x.date}</span>
            <span style={css("color:#546965;font-size:14px")}>{x.lines.map((l) => l.species).join("، ")}</span>
            <strong style={css("margin-inline-start:auto;color:#2F6666")}>{sar(totalOf(x))}</strong>
            <button type="button" onClick={() => openSaved(x)} style={small}>فتح</button>
            <button type="button" onClick={() => remove(x)} style={{ ...small, color: "var(--t-A54B4B, #A54B4B)", borderColor: "var(--s-E5CFCF, #E5CFCF)" }}>حذف</button>
          </div>
        ))}
      </div>
    </div>
  );
}
