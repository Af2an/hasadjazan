# Architecture.md — حصاد جازان V1

## الهدف
V1 لقياس اهتمام المطاعم وأصحاب الأسماك وتجهيز تجربة المطابقة الأولى
لا بيع ولا شراء ولا دفع ولا نقل فعلي داخل V1

## البيئة
- الاستضافة النهائية: CranL
- تطبيق واحد Full-stack
- Frontend عربي RTL Mobile First
- Backend API من نفس الدومين
- PostgreSQL خاصة
- HTTPS فقط
- البريد التشغيلي: hasadjaz@gmail.com
- الأسرار تحفظ فقط كـ Environment Variables على الاستضافة

## الواجهات العامة
- `/` الصفحة الرئيسية
- `/privacy` سياسة الخصوصية
- `/trial/:token` رابط احتياج حصاد جازان للتجربة لأصحاب الأسماك

## الواجهة الداخلية
- `/admin/login`
- `/admin`
- لا تظهر في التنقل العام
- محمية بتسجيل دخول Server-side
- لا تستخدم كلمة مرور أو Token ثابت داخل Frontend أو URL

## تدفق بيانات المطعم
1. المطعم يملأ النموذج
2. Frontend يتحقق من الشكل فقط
3. POST `/api/submit`
4. Backend يعيد التحقق من كل حقل
5. Rate limit + honeypot
6. يحفظ السجل في PostgreSQL
7. بعد نجاح الحفظ فقط يرسل إشعار بريد إلى hasadjaz@gmail.com
8. يعيد نجاحًا عامًا للمستخدم دون كشف تفاصيل النظام

## تدفق بيانات صاحب السمك
نفس التدفق السابق مع:
- نوع المستخدم صياد أو محل أسماك
- الأصناف
- الاستعداد للتجربة
- القدرة على التسليم في حراج جازان وفق الوقت الذي تحدده حصاد جازان
- الموافقة على إقرار الجودة

## الاحتياج المجمع للتجربة
الإدارة تنشئ احتياجًا تجريبيًا من لوحة الإدارة
يحتوي:
- التاريخ
- مكان الاستلام: حراج جازان
- نافذة الوقت
- الأصناف
- المطلوب لكل صنف
- المحتسب ضمن التغطية
- المتبقي

يولد رابط `/trial/:token`
الـ token عشوائي طويل وغير قابل للتخمين

صفحة الصياد لا تعرض:
- أسماء المطاعم
- أرقام المطاعم
- مواقع المطاعم
- أي بيانات شخصية للعملاء

عند ضغط "لدي كمية":
- الاسم
- الجوال
- الصنف
- الكمية
- سعر الكيلو
- ملاحظة

إرسال العرض لا يخفض المتبقي تلقائيًا
الإدارة تراجعه ثم تضغط "احتساب ضمن التغطية"
عندها فقط يتحدث المتبقي

## قاعدة البيانات

### restaurant_leads
- id UUID
- restaurant_name
- contact_name
- phone
- region
- city
- need_range
- species JSON/array
- trial_interest
- note
- created_at

### fish_owner_leads
- id UUID
- kind
- name
- shop_name nullable
- phone
- species JSON/array
- trial_interest
- delivery_answer
- quality_accepted
- note
- created_at

### trial_demands
- id UUID
- public_token unique
- title/date
- pickup_location
- pickup_window
- status
- created_at

### trial_demand_items
- id UUID
- trial_demand_id FK
- species
- required_kg
- counted_kg
- remaining_kg

### fish_offers
- id UUID
- trial_demand_item_id FK
- name
- phone
- quantity_kg
- price_per_kg
- note
- counted boolean default false
- created_at

## البريد
بعد حفظ أي نموذج بنجاح:
- أرسل إشعارًا إلى hasadjaz@gmail.com
- استخدم SMTP من Backend فقط
- القيم من Environment Variables:
  - SMTP_HOST
  - SMTP_PORT
  - SMTP_USER
  - SMTP_PASS
  - MAIL_TO=hasadjaz@gmail.com
- لا ترسل الأسرار إلى Frontend

## الطباعة
من لوحة الإدارة:
- Print stylesheet
- طباعة سجل مطعم
- طباعة سجل صاحب أسماك
- طباعة احتياج اليوم
- يمكن للمستخدم حفظه PDF من نافذة الطباعة
لا نحتاج مكتبة PDF في V1

## V2 وليس الآن
- حساب مطعم
- OTP
- حالات الطلب التشغيلية
- شراء/بيع فعلي
- دفع
- نقل مبرد
- فواتير
- حسابات أصحاب الأسماك
