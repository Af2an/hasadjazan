import { useEffect } from "react";
import { css } from "../lib/css.js";
import mark from "../assets/mark.png";

const h2 = css("margin:36px 0 0;font-size:22px;font-weight:700;color:#16211F");
const ul = css("margin:8px 0 0;padding-inline-start:22px");
const p8 = css("margin:8px 0 0");

export function PageHeader({ maxWidth = 760 }) {
  return (
    <header style={css("background:#16211F")}>
      <div style={css("max-width:" + maxWidth + "px;margin:0 auto;padding:14px 16px;display:flex;align-items:center;gap:12px")}>
        <a href="/" aria-label="الرئيسية" style={css("display:inline-flex;background:#FFFFFF;border-radius:12px;padding:6px")}><img src={mark} alt="الشعار" style={css("height:32px;width:auto;display:block")} /></a>
        <a href="/" style={css("margin-inline-start:auto;min-height:44px;display:inline-flex;align-items:center;padding:8px 18px;border:1.5px solid #4F6B66;border-radius:999px;color:#FFFFFF;font-size:16px;font-weight:600;text-decoration:none")}>→ الرئيسية</a>
      </div>
    </header>
  );
}

export default function Privacy() {
  useEffect(() => { document.title = "سياسة الخصوصية"; }, []);
  return (
    <div dir="rtl" lang="ar">
      <PageHeader />
      <main style={css("max-width:760px;margin:0 auto;padding:40px 16px 72px;font-size:17px;line-height:1.95;color:#2B3D3A")}>
        <h1 style={css("margin:0;font-size:clamp(28px,5vw,36px);line-height:1.35;font-weight:700;color:#16211F")}>سياسة الخصوصية</h1>
        <p style={css("margin:6px 0 0;font-size:16px;color:#546965")}>آخر تحديث: 9 أكتوبر 2026</p>
        <p style={css("margin:20px 0 0")}>نجمع بيانات مطعمك واحتياجك لتنظيم تجربة توريد السمك لمطاعم أبوعريش، ونتواصل معك فقط إذا اخترت ذلك.</p>

        <h2 style={h2}>البيانات التي نجمعها</h2>
        <ul style={ul}>
          <li>عند التسجيل: اسم المطعم، ورقم واتساب المسؤول، والمدينة والحي ورابط الموقع إن أضفته، والأصناف ونطاق الاحتياج اليومي، وطريقة تأمينكم الحالية، وإجابتك عن الاستكمال من المحلات، ورغبتك في التواصل، وسؤالك أو ملاحظتك إن كتبتها، ووقت موافقتك.</li>
          <li>عند إرسال احتياج من رابطك الخاص: التاريخ، والأصناف والمقاسات والأوزان، وموقع التسليم، والوقت المطلوب، وأي ملاحظة.</li>
          <li>أثناء التشغيل: مصدر كل كمية ووزنها وسعر شرائها، والوزن المسلّم، والرسوم، والمبالغ المحصّلة.</li>
        </ul>
        <p style={p8}>لا نجمع بيانات بطاقات أو حسابات بنكية أو أرقام هوية، ولا نحفظ بيانات النموذج في متصفحك.</p>

        <h2 style={h2}>من يطّلع عليها</h2>
        <p style={p8}>البيانات محفوظة في قاعدة بيانات محمية، ولا يطّلع عليها إلا الفريق المصرّح له عبر لوحة إدارة بكلمة مرور. لا نعرض بياناتك للزوار أو للموردين، ولا نبيعها. وعند وصول تسجيل أو احتياج جديد قد يصل للفريق تنبيه بالبريد لا يحتوي الاسم أو الجوال.</p>

        <h2 style={h2}>رابطك الخاص</h2>
        <p style={p8}>بعد التحقق من مطعمك نرسل لك رابطًا خاصًا لإرسال الاحتياج. لا تشاركه مع أحد، وإذا وصل لغيرك كلمنا ونلغيه ونرسل لك رابطًا جديدًا.</p>

        <h2 style={h2}>الحفظ والحذف</h2>
        <p style={p8}>نحتفظ بالبيانات مدة تصل إلى 12 شهرًا من تاريخ التسجيل لتنظيم التجربة ودراستها، ثم نحذفها أو نزيل ما يدل على صاحبها، ما لم يوجد سبب نظامي يستوجب مدة أطول. تُحفظ البيانات لدى مزوّد الاستضافة وقاعدة البيانات، وقد نستخدم مزوّد بريد للتنبيهات، بالقدر اللازم لتشغيل الخدمة.</p>

        <h2 style={h2}>حقوقك</h2>
        <p style={p8}>تقدر تطلب الاطلاع على بياناتك أو تصحيحها أو حذفها، أو سحب موافقتك، عبر واتساب <a href="https://wa.me/966563036154" target="_blank" rel="noopener noreferrer" dir="ltr">056 303 6154</a>.</p>

        <h2 style={h2}>تحديث السياسة</h2>
        <p style={p8}>إذا تغيّرت البيانات التي نجمعها أو طريقة استخدامها نحدّث هذه الصفحة وتاريخها.</p>
      </main>
    </div>
  );
}
