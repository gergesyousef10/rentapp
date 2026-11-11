# فصل بيانات كل عميل (Multi-tenant) — تصميم

**التاريخ:** 2026-11-11
**الهدف:** تأجير التطبيق لحوالي 5 ملاك عقارات، كل واحد يشوف بياناته هو بس، من غير بوابة دفع ولا شاشة أدمن.

## القرار في سطرين

كل سجل في Firestore بيتعلّم بحقل `org`. الـ `org` الافتراضي لأي حساب هو **إيميله** (بحروف صغيرة). حساب مشترك (زي أخو جرجس) ليه سجل في `users/{email}` بيقول `org` بتاعه إيه. قواعد Firestore ترفض أي قراءة أو كتابة لسجل الـ `org` بتاعه مختلف.

## اللي داخل

### 1. البيانات
- المجموعات الست (`units, tenancies, payments, expenses, sales, salePayments`): كل مستند يحمل `org: string`.
- مجموعة جديدة `users`: المستند اسمه الإيميل بحروف صغيرة، وفيه `{org: "<إيميل صاحب البيانات>"}`. مطلوبة **بس** للحسابات المشتركة. حساب مالوش مستند = org لوحده.
- الهجرة: مرة واحدة، كل المستندات الحالية (≈60) تاخد `org = "gergesyousef10@gmail.com"`. تتعمل من المتصفح وأنت داخل، قبل تفعيل القواعد الجديدة.

### 2. الكود (`index.html`)
- بعد تسجيل الدخول: `ORG = (users/{email}).org || email`. لو قراءة `users` فشلت بسبب الصلاحيات → نعتبره مالوش مستند.
- كل `onSnapshot` على المجموعات الست يبقى `.where("org","==",ORG)`.
- `put()` و`uploadLocalIfCloudEmpty()` و`restoreXlsx` (عن طريق `put`) يكتبوا `org: ORG` في كل مستند.
- `delMany`/`del` زي ما هم (المسح بالـ id).
- مفيش تغيير في الشاشات أو الحسابات.

### 3. الحماية (`firestore.rules` — ملف جديد في الـ repo)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function email() { return request.auth.token.email.lower(); }
    function myOrg() {
      return exists(/databases/$(db)/documents/users/$(email()))
        ? get(/databases/$(db)/documents/users/$(email())).data.org
        : email();
    }
    match /users/{e} {
      allow read: if request.auth != null && e == email();
      allow write: if false;           // من الـ Console بس
    }
    match /{col}/{id} {
      // المجموعات الست بالاسم عمداً: لو كتبناها {col} عامة، أي عميل يقدر يكتب في users ويضيف ناس على الـ org بتاعه
      allow read:   if col in ['units','tenancies','payments','expenses','sales','salePayments']
        && request.auth != null && resource.data.org == myOrg();
      allow create: if col in ['units','tenancies','payments','expenses','sales','salePayments']
        && request.auth != null && request.resource.data.org == myOrg();
      allow update: if col in ['units','tenancies','payments','expenses','sales','salePayments']
        && request.auth != null && resource.data.org == myOrg()
        && request.resource.data.org == resource.data.org;
      allow delete: if col in ['units','tenancies','payments','expenses','sales','salePayments']
        && request.auth != null && resource.data.org == myOrg();
    }
  }
}
```
- التسجيل الذاتي يفضل مقفول من Firebase Authentication.

### 4. ترتيب التنفيذ (عشان محدش يتقفل عليه)
1. هجرة البيانات: إضافة `org` لكل المستندات الحالية.
2. إنشاء `users/magedyousef20@gmail.com` = `{org: "gergesyousef10@gmail.com"}` (من المتصفح وجرجس داخل، قبل تفعيل القواعد).
3. رفع الكود الجديد على GitHub Pages.
4. نشر `firestore.rules` من Firebase Console.
5. اختبار.

### 5. الاختبار
- حساب جرجس: نفس الأرقام قبل وبعد (22 وحدة، 21 مستأجر، 18 دفعة، نوفمبر 234,500).
- حساب أخوه: نفس البيانات.
- حساب تجريبي جديد: صفحة فاضية، وإضافة وحدة تنجح وتظهر له هو بس.
- من الحساب التجريبي: محاولة قراءة مستند من org جرجس بالـ id → `permission-denied`.

### 6. الأخطاء
- حساب داخل ومفيش نت: نفس سلوك النهارده (الكاش).
- حساب داخل والقواعد رافضة (مثلاً نسي حد يعمل الهجرة): التطبيق بيعرض رسالة `FBDENIED` الموجودة أصلاً.

## اللي مش داخل عمداً
بوابة دفع، `paidUntil`، شاشة أدمن، تسجيل ذاتي، خطط/أسعار، تغيير الإيميل بعد الإنشاء. **قفل العميل اللي ماجددش** = Disable account من Firebase Console.

## تشغيل عميل جديد (بعد التنفيذ)
1. Firebase Console → Authentication → Add user (إيميل + باسورد).
2. ابعت له البيانات. خلاص.
لو عنده موظف يشاركه: ضيف `users/<إيميل الموظف>` = `{org: "<إيميل العميل>"}`.
