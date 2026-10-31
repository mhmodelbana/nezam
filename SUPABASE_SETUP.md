# إعداد Supabase

يحتوي [supabase-config.js](./supabase-config.js) على رابط المشروع ومفتاحه العام
الموجودين في إعداد المشروع السابق. يمكن استبدالهما برابط ومفتاح `publishable`
من **Project Settings → API** إذا كان المشروع مختلفًا. لا تستخدم مفتاح
`service_role` في المتصفح.

## 1. إنشاء الجداول والسياسات

افتح **SQL Editor** في مشروع Supabase وشغّل محتوى
[supabase/schema.sql](./supabase/schema.sql) كاملًا. ينشئ الجداول وسياسات RLS
ودوال حجز الرحلات وتعديل ملف الطالب.

إذا ظهر خطأ `PGRST205` عن جدول `public.system_settings`، فهذا يعني أن المخطط لم
يُنفذ في مشروع Supabase الحالي أو لم يُحدّث مخطط PostgREST بعد. شغّل الملف
كاملًا من SQL Editor، وتأكد من نجاح التنفيذ، ثم أعد تحميل التطبيق.

## 2. إنشاء حساب الإدارة الأول

1. من **Authentication → Users** أنشئ مستخدمًا ببريد الإدارة وكلمة مرور لا
   تقل عن 10 أحرف، وفعّل تأكيد البريد أو عطّله حسب سياسة المشروع.
2. انسخ معرّف المستخدم (UUID).
3. شغّل الاستعلام التالي في SQL Editor مع استبدال UUID:

   ```sql
   insert into public.profiles (user_id, role, student_id)
   values ('AUTH-USER-UUID', 'admin', null);
   ```

4. عطّل التسجيل العام للمستخدمين من إعدادات Authentication؛ إنشاء حسابات
   الطلاب يتم بواسطة الإدارة من داخل النظام.

## 3. نشر وظيفة حسابات الطلاب

انشر `manage-student-auth` عبر Supabase CLI بعد ربط مجلد المشروع بمشروع
Supabase:

```powershell
supabase link --project-ref xivhnbxxiptswsbdrxsl
supabase functions deploy manage-student-auth
supabase secrets set SUPABASE_SECRET_KEY=YOUR_ROTATED_SECRET_KEY SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

ضع المفتاح السري بعد تدويره في **Secrets** الخاصة بوظائف Supabase فقط، وليس
في ملفات المشروع أو كود المتصفح أو GitHub. يمكن ضبط المفتاح العام كسر للوظيفة،
أو استخدام متغير Supabase الافتراضي `SUPABASE_ANON_KEY`. تتحقق الوظيفة من جلسة
المتصل وصلاحية الإدارة قبل إنشاء حساب الطالب أو إعادة تعيينه أو حذفه.

بعد إنشاء حساب طالب، تحقق من ربطه في **SQL Editor** باستبدال `123` برقم
الطالب:

```sql
select s.id as student_id, s.name, p.user_id, p.role, u.email
from public.students s
left join public.profiles p on p.student_id = s.id
left join auth.users u on u.id = p.user_id
where s.id = 123;
```

يجب أن يظهر `user_id` ودور `student` وبريد بصيغة
`student-123@students.votatravel.com`.

## 4. فتح النظام

انشر ملفات المشروع على استضافة HTTPS ثم سجّل الدخول ببريد الإدارة. يُسجّل
الطالب بالكود `VT-0001` وكلمة المرور المؤقتة التي تنشئها الإدارة؛ ويُطلب منه
تغييرها عند أول دخول. كلمات المرور الجديدة لا تقل عن 10 أحرف.

## نقل البيانات القديمة

- قبل الانتقال، صدّر بيانات النسخة المحلية من Developer Tools → Console:

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

- بعد إعداد الإدارة افتح [صفحة استيراد البيانات](./supabase/import-local.html)،
  وسجّل الدخول واختر ملف JSON. لا تستورد إلى قاعدة بها سجلات، فالاستيراد
  يتوقف إذا لم تكن الجداول فارغة.
- كلمات المرور المحلية لا تُرسل ولا تنتقل. أعد تعيين حساب كل طالب بعد
  الاستيراد، وأنشئ حساب الإدارة في Supabase يدويًا.
- إعدادات الشركة متاحة للقراءة دون تسجيل دخول كي تظهر في شاشة الدخول؛ بقية
  سجلات النظام تتطلب جلسة وصلاحيات مناسبة.
