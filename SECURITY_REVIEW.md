# SECURITY_REVIEW.md — حصاد جازان V1

## نتيجة مراجعة الملف الحالي
الملف المرفق يصلح كمرجع بصري ومحتوى
ولا أنصح برفع Artifact/Bundler نفسه كنسخة Production

النسخة الحالية:
- ترسل JSON إلى `POST /api/submit`
- فيها تحقق Frontend للأرقام والحقول
- لا يظهر فيها localStorage لتخزين بيانات العملاء
- لا يظهر فيها API key أو password حقيقي في Frontend
- لا يوجد Backend أو Database داخل الملف نفسه لذلك لا يمكن اعتبار الأمان مكتملاً قبل تنفيذها

## متطلبات إلزامية قبل الإطلاق

### 1. Backend validation
لا تثق في تحقق Frontend
أعد التحقق Server-side من:
- type enum
- phone سعودي 05XXXXXXXX
- region من قائمة محددة
- أطوال النصوص
- الأصناف
- trial values
- delivery values
- quality boolean
- الأرقام الموجبة فقط للكميات والأسعار

ارفض أي حقول غير متوقعة

### 2. SQL
استخدم ORM أو parameterized queries فقط
ممنوع بناء SQL من نص المستخدم

### 3. XSS
لا تعرض note أو custom species أو الأسماء باستخدام raw HTML
استخدم escaping الافتراضي
ممنوع `dangerouslySetInnerHTML` لبيانات المستخدم

### 4. Public submit protection
- JSON body max 16KB
- rate limit مناسب مثل 5 submissions / 10 minutes / IP
- honeypot hidden field
- timeout
- لا ترجع stack traces
- لا تسجل body كامل في production logs

### 5. CORS
`/api/submit` يقبل نفس Origin فقط
لا تستخدم `Access-Control-Allow-Origin: *`

### 6. Admin
- صفحة الإدارة تحتاج Login حقيقي
- ADMIN_PASSWORD_HASH فقط في Environment Variable أو DB
- hash بـ Argon2id أو bcrypt
- Cookie Session:
  - HttpOnly
  - Secure
  - SameSite=Strict
- Session timeout
- CSRF protection لأي عملية Admin تغير البيانات
- لا تستخدم password في JavaScript أو HTML أو query string

### 7. Trial public links
- token عشوائي Cryptographically Secure لا يقل عن 128-bit
- لا يحتوي معرفات متسلسلة
- يمكن إلغاء الرابط من الإدارة
- الصفحة تعرض الاحتياج المجمع فقط بلا PII للمطاعم

### 8. Email
أرسل البريد بعد نجاح حفظ DB
SMTP credentials server-side فقط
لا تضع أي مفتاح أو كلمة مرور في GitHub أو Frontend

### 9. Security headers
فعّل على CranL/Backend:
- Content-Security-Policy
- Strict-Transport-Security
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy بأقل صلاحيات
- frame-ancestors 'none' أو SAMEORIGIN إذا احتجنا

يفضل self-host للخطوط والأصول وتقليل المصادر الخارجية

### 10. Privacy
- اجمع الحد الأدنى فقط
- لا تجمع هوية أو بنك أو دفع في V1
- لا تعرض PII بين المطاعم وأصحاب الأسماك
- سياسة خصوصية ظاهرة قبل الإرسال
- retention المقترح V1: 12 شهرًا ثم حذف/إخفاء الهوية حسب الحاجة النظامية

### 11. Production errors
المستخدم يرى رسالة عامة فقط
تفاصيل الخطأ في server logs بدون بيانات شخصية حساسة

### 12. Dependencies
قبل الإطلاق:
- `npm audit`
- تحديث الحزم ذات High/Critical
- قفل lockfile
- إزالة أي dependency غير مستخدمة

## GitHub
ضع في المستودع:
- `Architecture.md`
- `SECURITY_REVIEW.md`
- `SECURITY.md`
- `.env.example` بدون قيم حقيقية
- `.gitignore` يشمل `.env*` مع السماح `.env.example`

فعّل حسب ما يتيحه حساب GitHub:
- Dependabot alerts/updates
- Code scanning / CodeQL
- Secret scanning
- Push protection إن كانت متاحة
- Branch protection/rules على main

لا تضع أسرار CranL أو SMTP في GitHub
استخدم Secrets/Environment Variables فقط

## فحص ما قبل الإطلاق
1. Unit/validation tests
2. محاولة إدخال HTML/JS في الاسم والملاحظات والتأكد أنه يظهر كنص فقط
3. محاولة إرسال payload أكبر من الحد
4. اختبار rate limit
5. اختبار الوصول إلى `/admin` بدون جلسة
6. اختبار CSRF للـadmin
7. اختبار أن trial link لا يكشف PII
8. `npm audit`
9. OWASP ZAP Baseline ضد نسخة staging
10. مراجعة Network tab والتأكد أنه لا يوجد Secret في Frontend bundle

## ملاحظات من الملف الحالي يجب تعديلها
- `need` الحالي في الملف هو "أقل من 30 كجم" ويجب تغييره حسب قرار المنتج النهائي
- خيار التسليم الحالي يتضمن "من الفجر الى 7 صباحا فقط" بينما قرار V1 هو أن حصاد جازان تحدد الوقت قبل إرسال الاحتياج
- `/api/submit` موجود كواجهة متوقعة لكنه غير منفذ في ملف HTML المرفق
