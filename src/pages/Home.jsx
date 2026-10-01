import { useEffect, useState } from "react";
import { List, X, WhatsappLogo } from "@phosphor-icons/react";
import { css } from "../lib/css.js";
import JoinForm from "./JoinForm.jsx";
import mark from "../assets/mark.png";

export const WHATSAPP = "966563036154";
export const WHATSAPP_SHOWN = "056 303 6154";
const HEADER = 72;
const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER, behavior: "smooth" });
};

const STEPS = [
  ["عرّفنا على احتياجك", "تسجّل اهتمامك، ونتواصل معك بالواتساب إذا رغبت."],
  ["نرتّب التجربة معك", "نتفق على الاحتياج والتكلفة والتسليم قبل البداية."],
  ["نؤمّن طلبك ونوصّله", "ترسل طلبك مساءً، ونتولى الشراء والفحص والتوصيل المبرد صباحًا حسب الاتفاق."]
];

const section = "scroll-margin-top:" + HEADER + "px;max-width:760px;margin:0 auto;padding:clamp(36px,6vw,64px) 16px 0";
const h2 = css("font-size:clamp(24px,4vw,32px);font-weight:700;margin:0 0 16px;line-height:1.4");

export default function Home() {
  const [menu, setMenu] = useState(false);
  const [shared, setShared] = useState(false);
  const share = async () => {
    const url = window.location.origin + "/";
    try { if (navigator.share) await navigator.share({ url }); else { await navigator.clipboard.writeText(url); setShared(true); } } catch { /* cancelled */ }
  };
  // jumping to the form also moves keyboard focus into it
  const go = (id) => (ev) => { ev.preventDefault(); setMenu(false); scrollToId(id); if (id === "join") { const el = document.getElementById("hj-restaurant_name"); if (el) el.focus({ preventScroll: true }); } };
  useEffect(() => {
    if (!menu) return;
    const onKey = (ev) => { if (ev.key === "Escape") setMenu(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);
  const nav = [["how", "كيف نشتغل؟"], ["contact", "تواصل معنا"]];
  const navLink = css("display:inline-flex;align-items:center;min-height:44px;padding:0 14px;color:#16211F;text-decoration:none;font-size:16px;font-weight:500;border-radius:999px;white-space:nowrap");

  return (
    <div dir="rtl" style={css("min-height:100vh;background:#FBFCFB;color:#16211F;font-size:17px;line-height:1.85;overflow-x:clip")}>
      <a href="#join" onClick={go("join")} className="skip">انتقل إلى التسجيل</a>
      <header style={css("position:sticky;top:0;z-index:40;background:#E3ECE6;box-shadow:0 1px 0 #CBD9D0;padding-top:env(safe-area-inset-top)")}>
        <div style={css("max-width:1040px;margin:0 auto;min-height:60px;padding:8px 16px;display:flex;align-items:center;gap:8px")}>
          <a href="#top" onClick={go("top")} aria-label="الرئيسية" style={css("display:flex;flex:none")}><img src={mark} alt="الشعار" style={css("height:44px;width:auto;display:block")} /></a>
          <nav aria-label="روابط الصفحة" className="hj-nav" style={css("display:flex;gap:2px;margin-inline-start:auto")}>
            {nav.map(([id, t]) => <a key={id} href={"#" + id} onClick={go(id)} className="hv-nav" style={navLink}>{t}</a>)}
          </nav>
          <a href="#join" onClick={go("join")} className="hv-teal hj-cta" style={css("display:inline-flex;align-items:center;min-height:44px;padding:0 20px;text-decoration:none;background:#2F6666;color:#FFFFFF;font-weight:700;border-radius:999px;font-size:16px;white-space:nowrap")}>سجّل اهتمامك</a>
          <button type="button" className="hj-phone hv-nav" aria-label={menu ? "إغلاق القائمة" : "القائمة"} aria-expanded={menu} aria-controls="hj-menu" onClick={() => setMenu(!menu)} style={css("margin-inline-start:auto;width:44px;height:44px;flex:none;border:0;border-radius:50%;background:transparent;color:#16211F;display:inline-flex;align-items:center;justify-content:center;cursor:pointer")}>{menu ? <X size={24} aria-hidden="true" /> : <List size={24} aria-hidden="true" />}</button>
        </div>
        {menu && (
          <div id="hj-menu" className="hj-phone" style={css("display:flex;flex-direction:column;padding:6px 16px 12px;border-top:1px solid #CBD9D0")}>
            {nav.concat([["join", "سجّل اهتمامك"]]).map(([id, t]) => <a key={id} href={"#" + id} onClick={go(id)} className="hv-nav" style={css("display:flex;align-items:center;min-height:48px;padding:0 12px;border-radius:12px;color:#16211F;text-decoration:none;font-size:17px;font-weight:600")}>{t}</a>)}
          </div>
        )}
      </header>

      <main id="top">
        <section className="hj-hero rise" style={css("background:radial-gradient(ellipse 70% 55% at 50% 30%,rgba(174,186,60,.18),rgba(174,186,60,0) 70%),#FBFCFB")}>
          <div style={css("max-width:620px;margin:0 auto;padding:clamp(40px,8vw,88px) 16px clamp(28px,5vw,48px);display:flex;flex-direction:column;align-items:center;text-align:center;gap:18px")}>
            <span style={css("display:inline-flex;align-items:center;background:#AEBA3C;color:#16211F;font-weight:700;font-size:17px;border-radius:14px;padding:8px 18px")}>من جازان لأبوعريش</span>
            <h1 style={css("font-size:clamp(30px,6.4vw,50px);line-height:1.35;font-weight:700;margin:0;text-wrap:balance")}>تروح الحراج كل صباح عشان تؤمّن سمك مطعمك؟</h1>
            <p style={css("margin:0;font-size:clamp(17px,2.4vw,20px);color:#2B3D3A;text-wrap:pretty")}>قل لنا احتياجك، ونتولى الشراء والفحص والوزن والتجميع والتوصيل المبرد.</p>
            <a href="#join" onClick={go("join")} className="hv-teal" style={css("width:100%;max-width:380px;min-height:56px;display:inline-flex;align-items:center;justify-content:center;background:#2F6666;color:#FFFFFF;border-radius:999px;font-weight:700;font-size:18px;text-decoration:none")}>عرّفنا على احتياج مطعمك</a>
          </div>
        </section>

        <section id="how" aria-labelledby="how-t" style={css(section)}>
          <h2 id="how-t" style={h2}>كيف نشتغل؟</h2>
          <ol style={css("list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px")}>
            {STEPS.map(([t, d], i) => (
              <li key={t} style={css("display:flex;gap:14px;align-items:flex-start;background:#FFFFFF;border-radius:18px;padding:16px;box-shadow:inset 0 0 0 1px #DCE5DF")}>
                <span aria-hidden="true" style={css("width:40px;height:40px;flex:none;border-radius:12px;background:#AEBA3C;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px")}>{i + 1}</span>
                <div><strong style={css("font-size:18px;font-weight:700")}>{t}</strong><p style={css("margin:2px 0 0;font-size:16px;color:#546965")}>{d}</p></div>
              </li>
            ))}
          </ol>
          <p style={css("margin:14px 0 0;font-size:16px;color:#2B3D3A;background:#EEF2DA;border-radius:14px;padding:12px 14px")}>نتفق معك على تفاصيل التكلفة قبل بدء التجربة.</p>
        </section>

        <JoinForm onDone={() => scrollToId("join")} />

        <section id="contact" style={css(section + ";padding-bottom:clamp(40px,6vw,64px)")}>
          <h2 style={h2}>تواصل معنا وشارك الصفحة</h2>
          <a href={"https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent("السلام عليكم، عندي استفسار عن توريد السمك لمطعمي.")} target="_blank" rel="noopener noreferrer" className="hv-teal" style={css("display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:10px 24px;background:#2F6666;color:#FFFFFF;border-radius:999px;text-decoration:none;font-weight:700;font-size:17px")}><WhatsappLogo size={24} aria-hidden="true" />كلمنا على واتساب <span dir="ltr" style={css("font-weight:500")}>{WHATSAPP_SHOWN}</span></a>
          <button type="button" onClick={share} className="hv-soft" style={css("margin-top:10px;display:inline-flex;align-items:center;min-height:52px;padding:10px 22px;background:#FFFFFF;color:#2F6666;border:1.5px solid #2F6666;border-radius:999px;font-weight:700;font-size:17px;cursor:pointer")}>{shared ? "تم نسخ الرابط" : "شارك الصفحة مع مطعم تعرفه"}</button>
        </section>
      </main>

      <footer style={css("background:#16211F;color:#C2D3CF")}>
        <div style={css("max-width:1040px;margin:0 auto;padding:24px 16px calc(24px + env(safe-area-inset-bottom));display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;font-size:16px")}>
          <span style={css("display:inline-flex;background:#FFFFFF;border-radius:12px;padding:6px")}><img src={mark} alt="الشعار" style={css("height:32px;width:auto;display:block")} /></span>
          <span style={css("flex:1")}></span>
          <a href="/privacy" style={css("color:#FFFFFF")}>سياسة الخصوصية</a>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
