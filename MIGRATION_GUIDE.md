# دليل ترحيل المشروع من localStorage إلى Supabase

## ما تم إنجازه

### 1. إنشاء جداول Supabase
تم إنشاء ملف `supabase/tables.sql` يحتوي على جداول منفصلة:
- `students` - بيانات الطلاب
- `terms` - الفصول الدراسية
- `subscriptions` - الاشتراكات
- `trip_schedules` - مواعيد الرحلات
- `trip_requests` - طلبات الرحلات

**للتطبيق:** قم بتشغيل هذا الملف في محرر SQL في Supabase بعد تشغيل `setup.sql`.

### 2. إنشاء API Layer
تم إنشاء ملف `supabase-api.js` يحتوي على دوال للتعامل مع Supabase:
- `getStudents()`, `createStudent()`, `updateStudent()`, `deleteStudent()`
- `getTerms()`, `createTerm()`, `updateTerm()`, `deleteTerm()`
- `getSubscriptions()`, `createSubscription()`, `updateSubscription()`, `addPayment()`, `deleteSubscription()`
- `getTripSchedules()`, `createTripSchedule()`, `updateTripSchedule()`, `deleteTripSchedule()`, `toggleTripSchedule()`
- `getTripRequests()`, `getTripRequestsByDate()`, `createTripRequest()`, `updateTripRequest()`, `deleteTripRequest()`

### 3. تحديث supabase-data.js
تم إزالة Storage adapter واستخدام Supabase مباشرة للعمليات التالية:
- `refreshStudentState()` - يقرأ من جداول Supabase
- `updateStudentTrip()` - يكتب إلى جدول trip_requests
- `completePasswordChange()` - يحدث جدول students

### 4. تحديث دوال القراءة في app.js
تم تحويل الدوال التالية إلى async واستخدام Supabase API:
- `readStudentRecords()` - يستخدم `window.votaAPI.getStudents()`
- `readTripSchedules()` - يستخدم `window.votaAPI.getTripSchedules()`
- `readTripRequests()` - يستخدم `window.votaAPI.getTripRequests()`
- `isStudentEligibleForTrips()` - يستخدم `window.votaAPI.getSubscriptions()` و `window.votaAPI.getTerms()`

### 5. تحديث دوال الكتابة في app.js (جزئي)
تم تحديث دوال إدارة trip schedules:
- `initializeTripScheduleManager()` - يستخدم Supabase API للإنشاء والتحديث والحذف

## ما تبقى من العمل

### 1. تحديث دوال الكتابة المتبقية في app.js

الدوال التالية لا تزال تستخدم localStorage وتحتاج تحديث:

#### إدارة الطلاب
- دوال إنشاء وتحديث وحذف الطلاب في `initializeStudentManager()`
- دوال تسجيل الدفعات في `initializeStudentPaymentDialog()`
- دوال تجديد الاشتراكات في `initializeStudentRenewalDialog()`

#### إدارة الاشتراكات
- دوال إنشاء وتحديث الاشتراكات في `initializeSubscriptionManager()`
- دوال تسجيل الدفعات في `initializePaymentDialog()`

#### إدارة الرحلات
- دالة `initializeTripAdmin()` render function تحتاج تحويل إلى async

#### الإعدادات
- دوال إدارة الفصول الدراسية في `initializeTermManager()`

### 2. تحويل الدوال التي تستخدم دوال القراءة إلى async

بما أن دوال القراءة أصبحت async، يجب تحويل جميع الدوال التي تستخدمها إلى async:
- `initializeTripAdmin()` - دالة render
- أي دوال أخرى تستدعي `readStudentRecords()`, `readTripRequests()`, أو `readTripSchedules()`

### 3. تحديث البوابة (Portal)

دوال البوابة في app.js تحتاج تحديث لاستخدام البيانات من Supabase بدلاً من localStorage:
- `initializeStudentPortal()`
- `initializePortalPersonal()`
- `initializePortalSubscription()`
- `initializePortalTrips()`

## خطوات التطبيق

### الخطوة 1: تشغيل SQL في Supabase
1. افتح لوحة تحكم Supabase
2. اذهب إلى SQL Editor
3. شغل `supabase/setup.sql` أولاً
4. ثم شغل `supabase/tables.sql`

### الخطوة 2: تحديث app.js

لتحديث دالة تستخدم localStorage:

**قبل:**
```javascript
function someFunction() {
  const data = JSON.parse(localStorage.getItem("key") || "[]");
  // معالجة البيانات
  localStorage.setItem("key", JSON.stringify(updatedData));
}
```

**بعد:**
```javascript
async function someFunction() {
  if (window.votaAPI) {
    const data = await window.votaAPI.getData();
    // معالجة البيانات
    await window.votaAPI.updateData(updatedData);
  } else {
    // Fallback للتوافق
    const data = JSON.parse(localStorage.getItem("key") || "[]");
    // معالجة البيانات
    localStorage.setItem("key", JSON.stringify(updatedData));
  }
}
```

### الخطوة 3: اختبار التطبيق

1. اختبر كل صفحة للتأكد من أن البيانات تُقرأ وتُكتب بشكل صحيح
2. تأكد من أن البوابة تعمل بشكل صحيح للطلاب
3. تأكد من أن لوحة التحكم تعمل بشكل صحيح للمسؤولين

## ملاحظات مهمة

- جميع التعديلات الحالية تحتوي على fallback إلى localStorage للتوافق
- يمكنك إزالة fallback بعد التأكد من أن Supabase يعمل بشكل صحيح
- تأكد من أن المستخدمين لديهم الصلاحيات المناسبة في Supabase
- قم بعمل نسخة احتياطية من البيانات قبل الترحيل
