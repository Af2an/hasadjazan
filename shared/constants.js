// Shared by the frontend forms and the backend validation.
export const REGIONS = ["جازان", "الرياض", "مكة المكرمة", "المدينة المنورة", "القصيم", "المنطقة الشرقية", "عسير", "تبوك", "حائل", "الحدود الشمالية", "نجران", "الباحة", "الجوف"];
export const SPECIES = ["هامور", "ضيرك", "بياض", "توداف (عقام)", "درس", "شعور سوالي", "عربي", "جمبري", "باغة", "حريد", "ناجل", "دنيس", "قاروص"];
export const NEED = ["أقل من 29 كجم", "30–60 كجم", "61 كجم فأكثر"];
export const YESNO = ["نعم", "لا"];
export const DELIVERY = ["نعم", "لا"];
export const KIND = ["صياد", "محل أسماك"];
export const SHOP_KIND = "محل أسماك";
export const PICKUP_LOCATION = "حراج جازان";
export const PHONE_RE = /^05\d{8}$/;

export const LIMITS = { name: 120, city: 80, species: 40, speciesCount: 20, note: 600, window: 80, title: 120, kg: 100000, price: 100000, demandItems: 30 };
