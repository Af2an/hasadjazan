import { useEffect } from "react";
import { css } from "../lib/css.js";
import { useTheme, ThemeToggle } from "../lib/theme.jsx";
import logoWhite from "../assets/logo-h-white.png";

const h2 = css("margin:40px 0 0;font-size:22px;font-weight:700;color:#16211F");
const h3 = css("margin:16px 0 0;font-size:18px;font-weight:600;color:#16211F");
const ul = css("margin:8px 0 0;padding-inline-start:22px");
const p8 = css("margin:8px 0 0");
const p12 = css("margin:12px 0 0");

export function PageHeader({ maxWidth = 760 }) {
  const theme = useTheme();
  return (
    <header style={css("background:#16211F")}>
      <div style={css("max-width:" + maxWidth + "px;margin:0 auto;padding:16px 24px;display:flex;align-items:center;gap:16px")}>
        <a href="/" aria-label="حصاد جازان" style={css("display:flex")}><img src={logoWhite} alt="حصاد جازان" style={css("height:36px;width:auto;display:block")} /></a>
        <span style={css("margin-inline-start:auto")}></span>
        <ThemeToggle theme={theme} onDark />
        <a href="/" style={css("min-height:44px;display:inline-flex;align-items:center;padding:8px 18px;border:1.5px solid #4F6B66;border-radius:999px;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none")}>→ الرئيسية</a>
      </div>
    </header>
  );
}

export default function Privacy() {
  useEffect(() => { document.title = "حصاد جازان | سياسة الخصوصية"; }, []);
  return (
    <div dir="rtl" lang="ar">
      <PageHeader />
      <main style={css("max-width:760px;margin:0 auto;padding:48px 24px 80px;font-size:17px;line-height:1.95;color:#2B3D3A")}>
        <h1 style={css("margin:0;font-size:clamp(30px,5vw,40px);line-height:1.35;font-weight:700;color:#16211F")}>سياسة الخصوصية</h1>
        <p style={css("margin:8px 0 0;font-size:15px;color:#546965")}>آخر تحديث: 1 أكتوبر 2026</p>
        <p style={css("margin:24px 0 0")}>في حصاد جازان نحترم خصوصيتك، ونحرص على جمع البيانات التي نحتاجها فقط لتجهيز واختبار تجربة حصاد جازان والتواصل مع المهتمين بها.</p>

        <h2 style={h2}>ما البيانات التي نجمعها</h2>
        <h3 style={h3}>إذا كنت مطعمًا</h3>
        <ul style={ul}><li>اسم المطعم</li><li>اسم المسؤول</li><li>رقم الجوال أو واتساب</li><li>المنطقة والمدينة</li><li>حجم الاحتياج المعتاد</li><li>أصناف الأسماك المعتادة</li><li>استعدادك للتجربة</li><li>أي ملاحظة تختار إضافتها</li></ul>
        <h3 style={h3}>إذا كنت صيادًا أو محل أسماك</h3>
        <ul style={ul}><li>الاسم</li><li>رقم الجوال أو واتساب</li><li>نوع النشاط</li><li>اسم المحل عند الحاجة</li><li>الأصناف المتوفرة عادة</li><li>استعدادك للتجربة والاستلام في حراج جازان</li><li>الكميات والأسعار التي تعرضها على احتياج تجريبي، سواء من الرابط العام أو من رابطك الشخصي</li><li>أي ملاحظة تختار إضافتها</li></ul>
        <p style={p12}>لا نجمع في هذه المرحلة بيانات دفع أو بيانات بنكية أو أرقام هوية.</p>

        <h2 style={h2}>لماذا نجمع هذه البيانات</h2>
        <ul style={ul}><li>فهم احتياج المطاعم من الأسماك.</li><li>فهم قدرة شبكة أصحاب الأسماك على تغطية الاحتياج.</li><li>تجهيز تجربة حصاد جازان الأولى.</li><li>التواصل مع المشاركين المهتمين بالتجربة.</li><li>تحليل الطلب والعرض بصورة مجمّعة لتحسين نموذج حصاد جازان.</li></ul>
        <p style={p12}>لن نستخدم بياناتك لغرض مختلف لا يرتبط بهذه الأغراض دون إشعارك عند الحاجة.</p>

        <h2 style={h2}>كيف نستخدم بيانات المطاعم وأصحاب الأسماك</h2>
        <p style={p8}>لا نعرض اسم المطعم أو بيانات تواصله لأصحاب الأسماك. وعند مشاركة احتياج المطاعم مع أصحاب الأسماك يُعرض كاحتياج مجمّع دون كشف هوية كل مطعم. كما لا نعرض بيانات أصحاب الأسماك للمطاعم في هذه المرحلة.</p>

        <h2 style={h2}>حفظ البيانات وحمايتها</h2>
        <p style={p8}>تُحفظ البيانات في الأنظمة التقنية المستخدمة لتشغيل موقع حصاد جازان وقاعدة بياناته، وقد نستخدم مزوّدي خدمات تقنيين للاستضافة وقاعدة البيانات والبريد الإلكتروني بالقدر اللازم لتشغيل الخدمة.</p>
        <p style={p12}>نتخذ إجراءات مناسبة للحد من الوصول غير المصرّح به إلى البيانات، ولا نجعل قاعدة بيانات النماذج متاحة للعامة.</p>
        <p style={p12}>قد تتم معالجة بعض البيانات تقنيًا من خلال مزوّدي خدمة توجد بنيتهم التقنية داخل المملكة أو خارجها، بحسب الخدمة المستخدمة وبما يتوافق مع المتطلبات النظامية المطبّقة.</p>

        <h2 style={h2}>مشاركة البيانات</h2>
        <p style={p8}>لا نبيع بياناتك الشخصية، ولا نشاركها مع جهات أخرى إلا بالقدر اللازم لتشغيل الموقع، أو عندما يكون ذلك مطلوبًا نظامًا.</p>

        <h2 style={h2}>مدة الاحتفاظ</h2>
        <p style={p8}>نحتفظ ببيانات هذه المرحلة لمدة تصل إلى 12 شهرًا من تاريخ جمعها لغرض دراسة التجربة وتطويرها. وبعد انتهاء الحاجة إليها تُحذف، أو يُخفى ما يؤدي إلى التعرّف على صاحبها، ما لم يوجد سبب نظامي يستوجب الاحتفاظ بها مدة أطول.</p>

        <h2 style={h2}>حقوقك</h2>
        <p style={p8}>يمكنك التواصل معنا لطلب الاطلاع على بياناتك أو تصحيحها أو حذفها، أو سحب موافقتك عندما يكون ذلك متاحًا وفق الأنظمة المعمول بها.</p>

        <h2 style={h2}>التواصل معنا</h2>
        <p style={p8}>لأي استفسار متعلّق بخصوصية بياناتك تواصل مع حصاد جازان عبر <a href="mailto:hasadjaz@gmail.com" dir="ltr">hasadjaz@gmail.com</a> أو واتساب <a href="https://wa.me/966563036154" target="_blank" rel="noopener noreferrer" dir="ltr">056 303 6154</a>.</p>

        <h2 style={h2}>تحديث السياسة</h2>
        <p style={p8}>قد نحدّث هذه السياسة مع تطوّر تجربة حصاد جازان أو تغيّر طريقة معالجة البيانات، وسيظهر تاريخ آخر تحديث أعلى الصفحة.</p>
      </main>
    </div>
  );
}
