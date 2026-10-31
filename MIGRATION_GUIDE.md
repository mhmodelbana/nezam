# نقل النظام إلى Supabase

يقرأ التطبيق سجلات الطلاب، والاشتراكات والمدفوعات، والفصول، ومواعيد الرحلات،
والحجوزات، وإعدادات الشركة من قاعدة Supabase. يدير Supabase Auth جلسات الدخول،
وتحمي سياسات RLS بيانات الطلاب وتغييرات الإدارة.

## إعداد قاعدة البيانات

اتبع خطوات [دليل إعداد Supabase](./SUPABASE_SETUP.md) لتشغيل المخطط، وإنشاء
حساب الإدارة، ونشر وظيفة إدارة حسابات الطلاب.

## نقل البيانات المحلية القديمة

بعد إعداد قاعدة البيانات وحساب الإدارة، صدّر نسخة JSON من المتصفح القديم عبر
أدوات المطور (Console):

```js
const state = JSON.parse(localStorage.getItem("vota-travel-local-v1"));
delete state.accounts;
delete state.sessionUserId;
const link = document.createElement("a");
link.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: "application/json" }));
link.download = "vota-local-data.json";
link.click();
URL.revokeObjectURL(link.href);
```

احتفظ بنسخة احتياطية، ثم افتح [صفحة الاستيراد](./supabase/import-local.html)
وسجّل الدخول بحساب الإدارة واختر الملف. الاستيراد يرفض قاعدة البيانات التي
تحتوي سجلات مسبقًا، ولا يرفع بيانات الحسابات أو تجزئات كلمات المرور المحلية.
بعد نقل السجلات، أنشئ/أعد تعيين حسابات الطلاب من النظام؛ كلمات المرور القديمة
لا تنتقل إلى Supabase Auth.

## النشر

استضف ملفات HTML وJavaScript عبر HTTPS. لا تستخدم `file://`، ولا تضع مفتاح
`service_role` في ملفات المتصفح. مفتاح `publishable` الظاهر في إعداد التطبيق
عام بطبيعته، وتُفرض الصلاحيات الفعلية عبر RLS ووظائف قاعدة البيانات.

يحفظ Supabase Auth جلسة المستخدم في المتصفح؛ أما سجلات النظام وحالة قراءة
تنبيهات الطالب فتُقرأ وتُكتب في Supabase.
