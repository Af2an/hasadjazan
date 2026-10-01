# حصاد جازان V1

تطبيق واحد Full-stack: واجهة عربية RTL (React + Vite) وخادم Express يقدّم الواجهة و`/api` من نفس الدومين، مع PostgreSQL.
المرجع: `Architecture.md` و `SECURITY_REVIEW.md` و `SECURITY.md`.

## المسارات
- `/` الصفحة الرئيسية ونموذجا المطاعم وأصحاب الأسماك
- `/privacy` سياسة الخصوصية
- `/trial/:token` احتياج حصاد جازان للتجربة لأصحاب الأسماك
- `/admin/login` و `/admin` لوحة الإدارة (جلسة Server-side)
- `/healthz` فحص الصحة

## التشغيل
```
npm ci --include=dev
npm run build
npm start
```
الجداول تُنشأ تلقائيًا عند الإقلاع من `server/schema.sql`.

للتطوير المحلي: انسخ `.env.example` إلى `.env` ثم `npm run dev:server` و `npm run dev`.

## كلمة مرور الإدارة
```
npm run hash-password
```
ضع الناتج في `ADMIN_PASSWORD_HASH`. كلمة المرور نفسها لا تُحفظ في أي مكان.

## الفحوصات
```
npm run lint
npm test
npm run build
npm audit
```

## Environment Variables
انظر `.env.example`. لا تُرفع أي قيمة حقيقية إلى GitHub ولا تدخل أي منها في الواجهة.
