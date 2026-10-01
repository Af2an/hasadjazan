import { useCallback, useEffect, useRef, useState } from "react";
import { PersonSimpleWalk, Snowflake, SealCheck, CalendarCheck, PhoneDisconnect, Fish, CheckCircle, List, X, WhatsappLogo, EnvelopeSimple, InstagramLogo, TiktokLogo, XLogo } from "@phosphor-icons/react";
import { css } from "../lib/css.js";
import { useTheme, ThemeToggle } from "../lib/theme.jsx";
import JoinForm from "./JoinForm.jsx";
import logo from "../assets/logo-h.png";
import logoWhite from "../assets/logo-h-white.png";
import mark from "../assets/mark.png";

const HEADER = 76;
const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER, behavior: "smooth" });
};

const WHY = [
  [PersonSimpleWalk, "ما تروح الحراج", "نروح عنك للحراج ونتواصل مع أصحاب الأسماك وأنت في مطعمك"],
  [Snowflake, "ننقله مبرّد لين بابك", "من الحراج لمطعمك بسيارة مبرّدة تحافظ على جودة السمك"],
  [SealCheck, "مفحوص قبل يوصلك", "نفحص كل كمية عند الاستلام ونرفض اللي ما يطابق"],
  [CalendarCheck, "يوميًا معاك وحسب احتياجك", "تطلب الكمية اللي تحتاجها كل يوم بدون التزام بكميات كبيرة"],
  [PhoneDisconnect, "طلب واحد بدل عشر مكالمات", "ترسل احتياجك مرة وحدة ونتولى التنسيق"],
  [Fish, "ندعم صيادين السمك", "نشتري من صيادين الأسماك بالحراج ومحلات بيع أسماك محلية عند عدم التوفر"]
];
const HOW_R = ["المطعم يحدد احتياجه", "حصاد جازان تجمع الاحتياجات", "نحوّلها إلى احتياج مجمّع", "نقيس إمكانية تغطيته من شبكة أصحاب الأسماك"];
const HOW_F = ["يسجّل نشاطه", "يشوف الاحتياج المجمّع", "يقدّم كميته وسعره", "يسلّم في حراج جازان ويستلم مستحقاته"];

/* ── the illustrative phone screens ── */
const screen = css("display:flex;flex-direction:column;gap:7px;height:100%");
const screenTitle = css("font-size:15px;font-weight:800");
const Chip = ({ on, children }) => <span style={css("padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700;" + (on ? "background:#2F6666;color:#FFFFFF" : "background:#FFFFFF;color:#16211F;box-shadow:inset 0 0 0 1px #DCE5DF"))}>{children}</span>;
const Row = ({ a, b }) => <div style={css("display:flex;justify-content:space-between;align-items:center;gap:8px;background:#FFFFFF;border-radius:14px;padding:8px 10px;box-shadow:inset 0 0 0 1px #E3ECE6;font-size:13px")}><span style={css("font-weight:700")}>{a}</span><span style={css("color:#546965")}>{b}</span></div>;
const Bar = ({ name, kg, pct }) => <div style={css("display:flex;flex-direction:column;gap:4px")}><div style={css("display:flex;justify-content:space-between;font-size:14px")}><strong>{name}</strong><span style={css("color:#546965")}>{kg} كجم</span></div><div style={css("height:10px;background:#E3ECE6;border-radius:10px;overflow:hidden")}><div style={css("height:100%;width:" + pct + "%;background:#2F6666;border-radius:10px")}></div></div></div>;
const Box = ({ label, children }) => <div style={css("display:flex;flex-direction:column;gap:4px")}><span style={css("font-size:12px;font-weight:700;color:#546965")}>{label}</span><div style={css("background:#FFFFFF;border-radius:12px;padding:8px 10px;box-shadow:inset 0 0 0 1px #DCE5DF;font-size:14px")}>{children}</div></div>;
const Cta = ({ children }) => <div style={css("margin-top:auto;background:#2F6666;color:#FFFFFF;border-radius:999px;padding:10px;text-align:center;font-weight:700;font-size:14px")}>{children}</div>;
const Check = ({ children }) => <div style={css("display:flex;align-items:center;gap:10px;background:#FFFFFF;border-radius:14px;padding:12px;box-shadow:inset 0 0 0 1px #E3ECE6;font-size:14px;font-weight:700")}><CheckCircle weight="duotone" size={22} color="#7D8A2A" aria-hidden="true" />{children}</div>;

const SCREENS = {
  r0: <div style={screen}><strong style={screenTitle}>وش تحتاج بكرة؟</strong><div style={css("display:flex;flex-wrap:wrap;gap:6px")}><Chip on>هامور</Chip><Chip on>بياض</Chip><Chip>قاروص</Chip><Chip>ضيرك</Chip><Chip on>شعور سوالي</Chip><Chip>دنيس</Chip></div><span style={css("font-size:12px;font-weight:700;color:#546965;margin-top:4px")}>الكمية المعتادة</span><div style={css("display:flex;flex-wrap:wrap;gap:6px")}><Chip>أقل من 29 كجم</Chip><Chip on>30–60 كجم</Chip></div><Cta>إرسال الاحتياج</Cta></div>,
  r1: <div style={screen}><strong style={screenTitle}>احتياجات اليوم</strong><Row a="مطعم في جيزان" b="هامور · بياض" /><Row a="مطعم في صبيا" b="شعور سوالي" /><Row a="مطعم في أبوعريش" b="هامور · قاروص" /><Row a="مطعم في صامطة" b="بياض" /><span style={css("font-size:12px;color:#546965;text-align:center")}>تتجمع طول اليوم</span></div>,
  r2: <div style={screen}><strong style={screenTitle}>الاحتياج المجمّع</strong><Bar name="هامور" kg="120" pct="100" /><Bar name="بياض" kg="85" pct="71" /><Bar name="شعور سوالي" kg="60" pct="50" /><Bar name="قاروص" kg="40" pct="33" /><span style={css("font-size:12px;color:#546965")}>طلب شراء واحد بدل عشرة</span></div>,
  r3: <div style={screen}><strong style={screenTitle}>نغطيها من الشبكة</strong><Row a="هامور" b="الحراج + صيادين" /><Row a="بياض" b="الحراج" /><Row a="شعور سوالي" b="صيادين محليين" /><div style={css("margin-top:auto;display:flex;align-items:center;gap:10px;background:#EEF2DA;border-radius:14px;padding:12px;font-size:14px;font-weight:700")}><Snowflake weight="duotone" size={22} aria-hidden="true" style={css("flex:none;color:#2F6666")} />وننقله مبرّد لين بابك</div></div>,
  f0: <div style={screen}><strong style={screenTitle}>سجّل نشاطك</strong><div style={css("display:flex;gap:6px")}><Chip on>صياد</Chip><Chip>محل أسماك</Chip></div><Box label="الاسم">علي الحربي</Box><Box label="الجوال"><span dir="ltr">05XXXXXXXX</span></Box><Cta>إرسال</Cta></div>,
  f1: <div style={screen}><strong style={screenTitle}>المطلوب بكرة</strong><Bar name="هامور" kg="120" pct="100" /><Bar name="بياض" kg="85" pct="71" /><Bar name="شعور سوالي" kg="60" pct="50" /><span style={css("font-size:12px;color:#546965")}>احتياج مجمّع بدون أسماء المطاعم</span></div>,
  // V1 shows no prices or amounts, so the price and dues boxes of the reference are left out.
  f2: <div style={screen}><strong style={screenTitle}>قدّم عرضك</strong><Row a="الصنف" b="هامور" /><Box label="الكمية المتوفرة">40 كجم</Box><Cta>أرسل العرض</Cta></div>,
  f3: <div style={screen}><strong style={screenTitle}>التسليم في حراج جازان</strong><Check>تم الاستلام في حراج جازان</Check><Check>اجتاز الفحص</Check></div>
};

function Phone({ isR, step, label }) {
  return (
    <div style={css("position:relative;display:flex;justify-content:center;padding:24px 0")}>
      <div aria-hidden="true" className="hj-glow" style={css("position:absolute;width:300px;max-width:90%;aspect-ratio:1;top:50%;left:50%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(174,186,60,.32),rgba(174,186,60,0) 70%)")}></div>
      <div role="img" aria-label={"شاشة توضيحية: " + label} title="مثال توضيحي" style={css("position:relative;width:220px;aspect-ratio:9/18.5;background:#16211F;border-radius:38px;padding:8px;box-shadow:0 24px 48px rgba(22,33,31,.20),0 0 0 1px #3A4D49;transform:rotate(-5deg)")}>
        <div style={css("position:absolute;top:15px;left:50%;transform:translateX(-50%);width:72px;height:20px;background:#16211F;border-radius:999px;z-index:2")}></div>
        <div style={css("width:100%;height:100%;background:#FBFCFB;border-radius:30px;overflow:hidden;display:flex;flex-direction:column")}>
          <div style={css("padding:42px 12px 8px;display:flex;align-items:center;gap:6px;background:#E3ECE6")}><img src={mark} alt="" style={css("height:22px;width:auto")} /><span style={css("font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0")}>{isR ? "حياك الله مطعم" : "حياك الله علي الحربي"}</span></div>
          <div style={css("flex:1;padding:12px;display:flex;flex-direction:column;min-height:0")}>{SCREENS[(isR ? "r" : "f") + step]}</div>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const [how, setHow] = useState("restaurant");
  const [step, setStep] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [wide, setWide] = useState(() => window.innerWidth >= 900);
  const [reduced] = useState(() => !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const timer = useRef(null), visible = useRef(true), paused = useRef(false);
  const section = useRef(null);

  const restart = useCallback(() => {
    clearInterval(timer.current);
    setCycle((c) => c + 1);
    timer.current = setInterval(() => {
      if (visible.current && !paused.current) { setStep((s) => (s + 1) % 4); setCycle((c) => c + 1); }
    }, 4000);
  }, []);

  useEffect(() => {
    let io;
    if (section.current && "IntersectionObserver" in window) {
      io = new IntersectionObserver((en) => { visible.current = en[0].isIntersecting; if (visible.current) restart(); }, { threshold: 0.3 });
      io.observe(section.current);
    }
    const onResize = () => setWide(window.innerWidth >= 900);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    restart();
    return () => { clearInterval(timer.current); if (io) io.disconnect(); window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize); };
  }, [restart]);

  const isR = how === "restaurant", list = isR ? HOW_R : HOW_F;
  const go = (i) => () => { setStep(i); restart(); };
  // Phones: swipe sideways to move between the steps (right = next, as pages turn in Arabic).
  const touch = useRef(null);
  const onTouchStart = (ev) => { const t = ev.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (ev) => {
    if (!touch.current) return;
    const t = ev.changedTouches[0], dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    setStep((s) => (s + (dx > 0 ? 1 : 3)) % 4);
    restart();
  };
  const pickHow = (h) => () => { if (h !== how) { setHow(h); setStep(0); restart(); } };
  const tab = (on) => css("min-height:46px;border-radius:999px;border:0;cursor:pointer;font-size:15px;font-weight:" + (on ? 700 : 500) + ";background:" + (on ? "#2F6666" : "transparent") + ";color:" + (on ? "#FFFFFF" : "#16211F"));

  const side = (i, s) => {
    const on = i === step;
    const num = <span key="n" style={css("width:40px;height:40px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;transition:background .25s;" + (on ? "background:#AEBA3C;color:#16211F;box-shadow:0 0 0 6px rgba(174,186,60,.25)" : "background:#FFFFFF;color:#2F6666;box-shadow:inset 0 0 0 1.5px #CBD9D0"))}>{"0" + (i + 1)}</span>;
    const text = <span key="t" style={css("flex:0 1 auto;max-width:15em;font-size:" + (on ? 19 : 17) + "px;font-weight:" + (on ? 800 : 700) + ";line-height:1.45;text-align:" + (s === "r" ? "right" : "left") + ";transition:font-size .25s")}>{list[i]}</span>;
    const line = <span key="l" aria-hidden="true" style={css("flex:1 1 40px;min-width:28px;height:0;border-top:2px " + (on ? "solid #2F6666" : "dashed #CBD9D0"))}></span>;
    const dot = <span key="d" aria-hidden="true" style={css("width:12px;height:12px;border-radius:50%;flex:none;background:" + (on ? "#2F6666" : "#CBD9D0"))}></span>;
    return (
      <button key={i} type="button" aria-current={on} onClick={go(i)} style={css("display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;cursor:pointer;padding:8px 0;min-height:56px;font-family:inherit;color:#16211F;transition:opacity .25s;opacity:" + (on ? 1 : 0.55))}>
        {s === "r" ? [num, text, line, dot] : [dot, line, num, text]}
      </button>
    );
  };

  return (
    <section id="how" ref={section} style={css("scroll-margin-top:84px;max-width:1200px;margin:0 auto;padding:clamp(24px,4vw,40px) 20px clamp(56px,8vw,88px)")}>
      <div onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; restart(); }} style={css("display:flex;flex-direction:column;align-items:center;gap:24px;text-align:center")}>
        <h2 style={css("font-size:clamp(28px,4.5vw,42px);font-weight:800;margin:0")}>كيف تعمل حصاد جازان</h2>
        <p style={css("font-size:clamp(16px,2vw,19px);margin:-8px 0 0;max-width:36rem;color:#546965;text-wrap:pretty")}>ننزل عنك للحراج ونبحث عن كمياتك، ونتواصل مع شبكة أصحاب أسماك محليين من الحراج وخارجه</p>
        <div role="tablist" aria-label="اختر" style={css("display:grid;grid-template-columns:1fr 1fr;gap:4px;background:#F4F7F5;border-radius:999px;padding:5px;box-shadow:inset 0 0 0 1px #DCE5DF;width:100%;max-width:380px")}>
          <button type="button" role="tab" aria-selected={isR} onClick={pickHow("restaurant")} style={tab(isR)}>للمطعم</button>
          <button type="button" role="tab" aria-selected={!isR} onClick={pickHow("fish")} style={tab(!isR)}>لصاحب الأسماك</button>
        </div>

        {wide ? (
          <div style={css("display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:0;width:100%")}>
            <div style={css("display:flex;flex-direction:column;gap:clamp(56px,9vw,120px)")}>{[side(0, "r"), side(1, "r")]}</div>
            <Phone isR={isR} step={step} label={list[step]} />
            <div style={css("display:flex;flex-direction:column;gap:clamp(56px,9vw,120px)")}>{[side(2, "l"), side(3, "l")]}</div>
          </div>
        ) : (
          <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={css("display:flex;flex-direction:column;align-items:center;gap:24px;width:100%;touch-action:pan-y")}>
            <div aria-live="polite" style={css("display:flex;align-items:center;gap:12px;background:#2F6666;color:#FFFFFF;border-radius:18px;padding:14px 16px;width:100%;max-width:420px;min-height:64px;text-align:right")}>
              <span style={css("width:36px;height:36px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;background:#AEBA3C;color:#16211F")}>{"0" + (step + 1)}</span>
              <span style={css("flex:1;font-size:17px;font-weight:700;line-height:1.5")}>{list[step]}</span>
            </div>
            <div style={css("display:flex;gap:4px")}>
              {list.map((t, i) => (
                <button key={i} type="button" aria-label={"الخطوة " + (i + 1) + ": " + t} aria-current={i === step} onClick={go(i)} style={css("width:44px;height:44px;border:0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0")}>
                  <span style={css("display:block;height:10px;border-radius:10px;transition:width .25s,background .25s;" + (i === step ? "width:28px;background:#2F6666" : "width:10px;background:#CBD9D0"))}></span>
                </button>
              ))}
            </div>
            <Phone isR={isR} step={step} label={list[step]} />
          </div>
        )}
        <div aria-hidden="true" style={css("height:4px;width:100%;max-width:320px;background:#E3ECE6;border-radius:4px;overflow:hidden")}>
          <div key={how + step + "-" + cycle} style={{ height: "100%", background: "#AEBA3C", transformOrigin: "right", animation: reduced ? "none" : "hjfill 4s linear forwards", transform: reduced ? "scaleX(1)" : undefined }}></div>
        </div>
        <span style={css("font-size:13px;color:#546965")}>{wide ? "الشاشات مثال توضيحي" : "اسحب يمينًا أو يسارًا للتنقل بين الخطوات · الشاشات مثال توضيحي"}</span>
      </div>
    </section>
  );
}

export default function Home() {
  const [type, setType] = useState("restaurant");
  const [menu, setMenu] = useState(false);
  const theme = useTheme();
  const go = (id, t) => (ev) => { ev.preventDefault(); setMenu(false); if (t) setType(t); scrollToId(id); };
  useEffect(() => {
    if (!menu) return;
    const onKey = (ev) => { if (ev.key === "Escape") setMenu(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);
  const menuLink = css("display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:0 14px;border:0;border-radius:14px;background:transparent;color:#16211F;text-decoration:none;font-size:17px;font-weight:700;cursor:pointer;text-align:start");
  const navLink = css("display:inline-flex;align-items:center;min-height:44px;padding:0 16px;color:#16211F;text-decoration:none;font-size:16px;font-weight:500;border-radius:999px;white-space:nowrap");
  const social = css("width:44px;height:44px;border-radius:50%;box-shadow:inset 0 0 0 1px #3A4D49;display:flex;align-items:center;justify-content:center;color:#FFFFFF;text-decoration:none");

  return (
    <div dir="rtl" style={css("min-height:100vh;background:#FBFCFB;color:#16211F;font-size:16px;line-height:1.8;overflow-x:clip")}>
      <header style={css("position:sticky;top:0;z-index:40;background:#E3ECE6;box-shadow:0 1px 0 #CBD9D0;padding-top:env(safe-area-inset-top)")}>
        <div className="hj-bar" style={css("max-width:1200px;margin:0 auto;min-height:64px;padding:10px max(16px,env(safe-area-inset-right)) 10px max(16px,env(safe-area-inset-left));display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px")}>
          <a href="#top" onClick={go("top")} aria-label="حصاد جازان" style={css("display:flex;align-items:center;gap:12px;justify-self:start;text-decoration:none;min-width:0")}><img src={logo} alt="حصاد جازان" className="hj-logo only-light" style={css("height:40px;width:auto;display:block;flex:none")} /><img src={logoWhite} alt="حصاد جازان" className="hj-logo only-dark" style={css("height:40px;width:auto;display:block;flex:none")} /></a>
          <nav aria-label="روابط الصفحة" className="hj-nav" style={css("display:flex;align-items:center;gap:4px")}>
            <a href="#how" onClick={go("how")} className="hv-nav" style={navLink}>كيف تعمل</a>
            <a href="#contact" onClick={go("contact")} className="hv-nav" style={navLink}>تواصل معنا</a>
          </nav>
          <div className="hj-end" style={css("justify-self:end;display:flex;align-items:center;gap:8px")}>
          <ThemeToggle theme={theme} className="hj-ico" />
          <a href="#join" onClick={go("join", "restaurant")} className="hv-teal hj-cta" style={css("display:inline-flex;align-items:center;min-height:44px;padding:0 22px;text-decoration:none;background:#2F6666;color:#FFFFFF;font-weight:700;border-radius:999px;font-size:16px;white-space:nowrap")}>جاهز تبدأ؟</a>
          <button type="button" className="hj-phone hj-ico hv-nav" aria-label={menu ? "إغلاق القائمة" : "القائمة"} aria-expanded={menu} aria-controls="hj-menu" onClick={() => setMenu(!menu)} style={css("width:44px;height:44px;flex:none;border:0;border-radius:50%;background:transparent;color:#16211F;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0")}>{menu ? <X weight="duotone" size={24} aria-hidden="true" /> : <List weight="duotone" size={24} aria-hidden="true" />}</button>
          </div>
        </div>
        {menu && (
          <div id="hj-menu" className="hj-phone" style={css("display:flex;flex-direction:column;gap:2px;padding:8px 16px 14px;border-top:1px solid #CBD9D0")}>
            <a href="#how" onClick={go("how")} className="hv-nav" style={menuLink}>كيف تعمل</a>
            <a href="#contact" onClick={go("contact")} className="hv-nav" style={menuLink}>تواصل معنا</a>
          </div>
        )}
      </header>

      <main id="top">
        <section className="hj-hero" style={css("background:radial-gradient(ellipse 70% 55% at 50% 38%,rgba(174,186,60,.20),rgba(174,186,60,0) 70%),radial-gradient(ellipse 60% 50% at 50% 70%,rgba(47,102,102,.10),rgba(47,102,102,0) 70%),#FBFCFB")}>
          <div style={css("max-width:1000px;margin:0 auto;padding:clamp(56px,10vw,120px) 20px clamp(40px,6vw,64px);display:flex;flex-direction:column;align-items:center;text-align:center;gap:clamp(20px,3vw,28px)")}>
            <div style={css("display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;background:#FFFFFF;box-shadow:inset 0 0 0 1px #DCE5DF;border-radius:999px;padding:6px 6px 6px 16px;max-width:100%")}>
              <span style={css("background:#AEBA3C;color:#16211F;font-weight:700;font-size:14px;border-radius:999px;padding:4px 14px")}>التجربة الأولى</span>
              <span style={css("font-size:14px;font-weight:700;color:#16211F;padding-inline-end:8px")}>من حراج وصيادين جازان لأبوعريش</span>
            </div>
            <h1 style={css("font-size:clamp(34px,6.4vw,70px);line-height:1.3;font-weight:800;margin:0;max-width:17ch;color:#16211F;text-wrap:balance")}>ركز على عملائك وخلي حصاد جازان تتولى احتياجك من الأسماك</h1>
            <div style={css("display:flex;flex-wrap:wrap;gap:12px;justify-content:center;padding-top:4px")}>
              <a href="#join" onClick={go("join", "restaurant")} className="hv-teal" style={css("text-decoration:none;background:#2F6666;color:#FFFFFF;font-weight:700;padding:15px 32px;border-radius:999px;font-size:17px;min-height:54px;display:inline-flex;align-items:center")}>أنا مطعم</a>
              <a href="#join" onClick={go("join", "fish")} className="hv-soft" style={css("text-decoration:none;color:#2F6666;box-shadow:inset 0 0 0 1.5px #2F6666;background:#FFFFFF;font-weight:700;padding:15px 32px;border-radius:999px;font-size:17px;min-height:54px;display:inline-flex;align-items:center")}>لدي أسماك</a>
            </div>
          </div>
        </section>

        <HowItWorks />

        <section id="why" aria-labelledby="why-title" style={css("scroll-margin-top:72px;background:#F1F4EC")}>
          <div style={css("max-width:1200px;margin:0 auto;padding:clamp(56px,8vw,96px) 20px")}>
            <h2 id="why-title" style={css("font-size:clamp(28px,4.5vw,42px);font-weight:800;margin:0 0 clamp(24px,4vw,40px);color:#16211F;text-align:center")}>ليش حصاد جازان؟</h2>
            <ul style={css("list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:clamp(12px,2vw,20px)")}>
              {WHY.map(([Icon, t, d]) => (
                <li key={t} style={css("display:flex;align-items:flex-start;gap:16px;background:#FFFFFF;border-radius:20px;padding:20px;box-shadow:inset 0 0 0 1px #DCE5DF,0 6px 18px rgba(22,33,31,.05)")}>
                  <span aria-hidden="true" style={css("width:56px;height:56px;flex:none;border-radius:18px;background:#AEBA3C;display:flex;align-items:center;justify-content:center")}><Icon weight="duotone" size={30} color="#16211F" /></span>
                  <div style={css("display:flex;flex-direction:column;gap:4px;min-width:0")}>
                    <strong style={css("font-size:18px;font-weight:800;line-height:1.5;color:#16211F")}>{t}</strong>
                    <span style={css("font-size:15px;line-height:1.7;color:#546965;text-wrap:pretty")}>{d}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <JoinForm type={type} setType={setType} onDone={() => scrollToId("join")} />

        <section id="contact" style={css("scroll-margin-top:72px;max-width:1200px;margin:0 auto;padding:clamp(56px,8vw,88px) 20px;display:flex;flex-direction:column;gap:18px")}>
          <h2 style={css("font-size:clamp(28px,4.5vw,42px);font-weight:800;margin:0")}>لديك سؤال آخر؟</h2>
          <p style={css("margin:0;font-size:18px;color:#546965")}>تواصل معنا مباشرة.</p>
          <div style={css("display:flex;flex-wrap:wrap;gap:12px")}>
            <a href="https://wa.me/966563036154" target="_blank" rel="noopener noreferrer" className="hv-teal" style={css("display:inline-flex;align-items:center;gap:12px;min-height:56px;padding:12px 26px;background:#2F6666;color:#FFFFFF;border-radius:999px;text-decoration:none;font-weight:700;font-size:16px")}><WhatsappLogo weight="duotone" size={24} aria-hidden="true" />واتساب <span dir="ltr" style={css("font-weight:500")}>056 303 6154</span></a>
            <a href="mailto:hasadjaz@gmail.com" className="hv-soft" style={css("display:inline-flex;align-items:center;gap:10px;min-height:56px;padding:12px 26px;background:#FFFFFF;color:#2F6666;box-shadow:inset 0 0 0 1.5px #2F6666;border-radius:999px;text-decoration:none;font-weight:700;font-size:16px")}><EnvelopeSimple weight="duotone" size={22} aria-hidden="true" /><span dir="ltr">hasadjaz@gmail.com</span></a>
          </div>
        </section>
      </main>

      <a href="https://wa.me/966563036154" target="_blank" rel="noopener noreferrer" aria-label="تواصل معنا عبر واتساب" title="واتساب" className="hv-teal" style={css("position:fixed;z-index:30;left:16px;bottom:calc(16px + env(safe-area-inset-bottom));width:46px;height:46px;border-radius:50%;background:#2F6666;color:#FFFFFF;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(22,33,31,.22)")}><WhatsappLogo weight="duotone" size={24} aria-hidden="true" /></a>

      <footer style={css("background:#16211F;color:#C2D3CF")}>
        <div style={css("max-width:1200px;margin:0 auto;padding:36px 20px calc(36px + env(safe-area-inset-bottom));display:flex;flex-wrap:wrap;gap:16px 24px;align-items:center;font-size:15px")}>
          <img src={logoWhite} alt="حصاد جازان" style={css("height:38px;width:auto")} />
          <span style={css("flex:1")}></span>
          <div style={css("display:flex;gap:8px")}>
            <a href="https://instagram.com/hasadjaz" target="_blank" rel="noopener noreferrer" aria-label="انستقرام" className="hv-social" style={social}><InstagramLogo weight="duotone" size={22} aria-hidden="true" /></a>
            <a href="https://tiktok.com/@hasadjaz" target="_blank" rel="noopener noreferrer" aria-label="تيك توك" className="hv-social" style={social}><TiktokLogo weight="duotone" size={22} aria-hidden="true" /></a>
            <a href="https://x.com/hasadjaz" target="_blank" rel="noopener noreferrer" aria-label="منصة إكس" className="hv-social" style={social}><XLogo weight="duotone" size={22} aria-hidden="true" /></a>
            <a href="https://wa.me/966563036154" target="_blank" rel="noopener noreferrer" aria-label="واتساب" className="hv-social" style={social}><WhatsappLogo weight="duotone" size={22} aria-hidden="true" /></a>
          </div>
          <a href="/privacy" style={css("color:#FFFFFF")}>سياسة الخصوصية</a>
          <span>© حصاد جازان {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
