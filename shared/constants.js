// Shared by the frontend forms and the backend validation.
export const SPECIES = ["هامور", "ضيرك", "بياض", "توداف (عقام)", "درس", "شعور سوالي", "عربي", "جمبري", "باغة", "حريد", "ناجل", "دنيس", "قاروص"];
export const YESNO = ["نعم", "لا"];
export const SUBSTITUTE = ["نعم", "أحيانًا", "لا"];
export const SOURCING = ["نروح الحراج بأنفسنا", "مندوب يشتري لنا", "مورد يوصل لنا", "نشتري من محلات", "طريقة أخرى"];
export const OTHER_SOURCING = "طريقة أخرى";
export const PURCHASE_METHODS = ["أروح الحراج بنفسي", "مورد يوصل لي", "محل قريب", "غير ذلك"];
export const PRIORITIES = ["الجودة", "الالتزام بالوقت", "السعر", "توفر الكمية"];
export const DELIVERY_TIMES = ["قبل 10 صباحًا", "بعد 10 صباحًا"];
export const FREQUENCY = ["يوميًا", "عدة مرات في الأسبوع", "مرة في الأسبوع", "حسب الحاجة"];
export const KIND = ["صياد", "محل أسماك", "استزراع"];
export const AVAILABILITY = ["الفجر", "الصباح", "العصر", "المساء", "يختلف"];
export const SOURCES = ["حراج جازان", "مورد مباشر", "محل أسماك"];
export const DIRECT_SOURCE = "مورد مباشر";
export const SHOP_SOURCE = "محل أسماك";
export const SUPPLIER_ORDER_STATUS = { requested: "مطلوب", received: "استُلم", cancelled: "ملغى" };
export const PAY_METHODS = ["نقد", "تحويل"];
export const PAY_TERMS = ["عند الاستلام", "آجل نهاية الأسبوع", "غير محدد بعد"];
export const FOLLOW = ["جديد", "تم التواصل", "تم الاتفاق", "غير مهتم الآن"];
export const EXPENSE_CATS = ["نقل", "ثلج وتبريد", "وقود", "عمالة", "أخرى"];
export const NEED_STATUS = { new: "جديد", confirmed: "مؤكد", purchasing: "قيد الشراء", delivered: "مُسلَّم", partial: "مُسلَّم جزئيًا", cancelled: "ملغى" };
export const PHONE_RE = /^05\d{8}$/;

export const LIMITS = { name: 120, city: 60, district: 80, url: 300, other: 120, location: 200, species: 40, spec: 80, speciesCount: 20, note: 600, title: 120, leadKg: 10000, kg: 100000, price: 100000, lines: 30 };
