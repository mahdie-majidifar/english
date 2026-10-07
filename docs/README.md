# AI English Coach — مستندات

## فهرست سندها

| فایل | محتوا |
|---|---|
| [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md) | پلن فنی کامل: معماری، schema، API، Learning Engine، فازها |
| [DESIGN_PROMPTS.md](DESIGN_PROMPTS.md) | راهنمای طراحی و پرامپت‌های صفحه‌به‌صفحه برای Arena AI |

## تصمیم‌های قطعی

| موضوع | تصمیم |
|---|---|
| زبان UI | انگلیسی؛ توضیح‌ها و ترجمه‌ها فارسی (RTL) |
| AI Provider | OpenAI (پشت لایه‌ی abstraction؛ `OPENAI_BASE_URL` قابل تنظیم) |
| استقرار | فعلاً فقط لوکال |
| Scope | Vertical slice اول، بعد Quiz/Exam، بعد Gamification/Progress کامل |
| طراحی | Playful‑Mature Minimal، بدون ماسکوت (فقط نماد انتزاعی «جرقه») |
| ابزار طراحی | Arena AI |

## وضعیت پیاده‌سازی

| فاز | وضعیت | محتوا |
|---|---|---|
| ۰ — زیرساخت | ✅ | monorepo، auth با refresh rotation، پروفایل، login، اسکلت اپ |
| ۱ — کتاب و محتوا | ✅ | Book/Unit/Lesson، درس فعلی، Library با ۹ نوع آیتم، جستجو، افزودن/ویرایش/حذف |
| ۲ — معلم و AI | ✅ | یادداشت و فایل معلم، استخراج، لایه‌ی AI، بررسی پیش‌نویس، commit |
| ۳ — موتور تمرین | ✅ | ۱۰ فرمت تمرین، تولید خودکار بدون AI، pool، ارزیابی با قانون و با AI، پلیر تمرین، صفحه‌ی Practice |
| ۴ — حلقه‌ی یادگیری | ⏭️ | FSRS، Mistake Bank، Learning Engine، جلسه‌ی روزانه، Dashboard واقعی |
| ۵ تا ۷ | ⏭️ | Quiz/Exam، Progress و Gamification، پایدارسازی |

## تغییرها نسبت به TECHNICAL_PLAN.md

هر جا حین ساخت تصمیم عوض شد، اینجا ثبت میشه (پلن اصلی دست‌نخورده مونده).

| موضوع | پلن | آنچه ساخته شد | دلیل |
|---|---|---|---|
| صف job | `pg-boss` | worker داخل API که از خود دیتابیس می‌خونه (ستون `status` + `FOR UPDATE SKIP LOCKED`) | برای یک کاربر کافیه، وابستگی اضافه نداره، با ری‌استارت از بین نمی‌ره. بعداً می‌شه با pg-boss عوض کرد |
| لاگ | `nestjs-pino` | Logger خود Nest + `X-Request-Id` | ساده‌تر؛ pino در فاز پایدارسازی |
| رابطه‌ی آیتم با درس | `LearningItem.lessons` | `LearningItem.sources` (`LearningItemSource`) که هم لینک درس را دارد هم لینک جلسه‌ی معلم | یک جدول برای «این آیتم از کجا آمده» |
| `ownerId` کتاب/آیتم | nullable | الزامی | کاتالوگ عمومی بعداً (SaaS) |
| ثبت‌نام | env `ALLOW_REGISTRATION` | نداریم؛ کاربر با `pnpm db:seed` ساخته میشه | MVP شخصی |
| تمرین‌های معلم | جدول `Exercise` با `origin=TEACHER_ORIGINAL` | جدول `TeacherExercise` (متن اصلی، تغییرناپذیر) | `Exercise` در فاز ۳ ساخته میشه و به این‌ها ارجاع می‌ده |
| Provider AI | OpenAI | OpenAI + `AI_PROVIDER=mock` برای امتحان بدون کلید | امتحان کل مسیر بدون هزینه |
| مدل AI | — | `AI_MODEL_PARSE` در env (پیش‌فرض `gpt-4o-mini`) | نام مدل در کد نیست؛ هر وقت خواستید عوض کنید |
| فایل PDF اسکن‌شده | vision برای PDF | پیام «به‌صورت عکس آپلود کن» | بدون ابزار OCR؛ عکس مستقیم به مدل vision میره |
| پر کردن pool تمرین | job پس‌زمینه بعد از commit | تمرین‌های built-in موقع ساخت Practice تولید و ذخیره میشن (قطعی، بدون تکرار)؛ تمرین‌های AI فقط با دکمه‌ی «Ask the coach for more» | سریع و بدون هزینه؛ کنترل کامل مصرف AI |
| سطح تمرین | adaptive کامل (FSRS + mastery) | قانون ساده: سطح از تعداد پاسخ‌های درست آیتم میاد (`levelForHistory`) | فاز ۴ جایگزینش می‌کنه |
| خطای AI موقع ارزیابی | `evaluationPending` + job | پیام خطا، چیزی ثبت نمیشه، با همان `clientAttemptId` دوباره امتحان می‌شه | ساده‌تر و بدون وضعیت نیمه‌کاره |
| کدهای نوع خطا | جدول `ErrorType` در دیتابیس | فهرست ثابت در `packages/contracts` (`ERROR_TYPES`) | تغییرش با code review انجام میشه؛ جدول در فاز ۴ اگه لازم شد |
| فرمت‌های تمرین | ۱۲ فرمت | ۱۰ فرمت. `error_correction` و `choose_distinction` (distinction به‌شکل multiple_choice ساخته میشه) | error_correction نیاز به AI و UI انتخاب کلمه دارد |

### نکته‌های فنی که یاد گرفتیم

- **Prisma 7:** `migrate dev` دیگه خودش client رو generate نمی‌کنه (اسکریپت `pnpm db:migrate` هر دو رو انجام میده). در محیط غیرتعاملی، `migrate dev` جواب نمی‌ده؛ از `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` استفاده کنید و بعد `prisma migrate deploy`.
- **NestJS 12:** ESM است؛ importها پسوند `.js` می‌خوان. `import type` برای پارامترهای decorator اجباریه.
- **Next 16:** `middleware.ts` اسمش `proxy.ts` شده.
- **تست‌ها:** تست‌های یکپارچه روی دیتابیس واقعی `coach_test` اجرا میشن (خودکار ساخته میشه) و با AI قلابی؛ هیچ‌وقت به OpenAI وصل نمی‌شن.

---

## موکول‌شده به بعد (Deferred)

> هر چیزی که عمداً از MVP حذف یا به تأخیر افتاده، همین‌جا ثبت میشه تا فراموش نشه.
> وقتی هر مورد انجام شد، علامتش رو بزنید.

### طراحی و UX

- [ ] **Dark mode** — طراحی و پیاده‌سازی. (توکن‌ها از اول با CSS variable تعریف میشن تا اضافه کردنش ارزون باشه.)
- [ ] **ماسکوت / شخصیت مربی** — فعلاً فقط نماد «جرقه». اگه بعداً خواستید، تصمیم جدا.
- [ ] **صدا و افکت صوتی** برای پاسخ درست/غلط و پاداش‌ها (پیش‌فرض خاموش).
- [ ] **تمرین‌های تصویری** (Image/context-based).
- [ ] **فرمت‌های تمرین فاز بعد:** `translation_en_fa`، `odd_one_out`، `listen_and_type`، `pronunciation`، `roleplay`، `error_correction`.
- [ ] **Drag & drop** در تمرین مرتب‌کردن جمله (فعلاً با tap)، و در Matching.
- [ ] **توضیح AI برای «چرا؟»** روی اشتباه‌ها (`POST /attempts/:id/explain` در پلن). فعلاً توضیح فارسیِ آماده نمایش داده میشه.
- [ ] **مرور تصویری Style tile → طراحی نهایی Arena** برای پلیر تمرین (D1 تا D6)؛ UI فعلی بر پایه‌ی Style tile و قانون‌های وضوح ساخته شده.
- [ ] **ریسپانسیو پیشرفته‌تر:** تبلت، حالت landscape.
- [ ] **i18n کامل** (سوییچ زبان UI بین انگلیسی و فارسی).

### هوش مصنوعی و مهارت‌ها

- [ ] **Speaking و Pronunciation** — صدا، speech recognition، بازخورد تلفظ.
- [ ] **Listening** — تمرین‌های شنیداری (TTS یا فایل صوتی).
- [ ] **AI Conversation Partner / Roleplay متنی** (اولین مورد بعد از MVP).
- [ ] **ارزیابی Writing** با rubric.
- [ ] **AI-generated reading passages.**
- [ ] **Level Assessment** — سنجش آمادگی برای کتاب بعدی؛ نیاز به بانک سؤال کالیبره‌شده.
- [ ] **بهینه‌سازی پارامترهای FSRS** برای کاربر از روی `ReviewLog` (بعد از جمع شدن داده‌ی کافی).
- [ ] **تحلیل الگوی اشتباهات با AI** (`MistakeAnalyzer`) فراتر از گزارش هفتگی.
- [ ] **سوییچ/Fallback بین چند AI Provider** (Claude، OpenRouter و غیره) — لایه‌ی abstraction آماده است، فقط provider جدید لازمه.

### محصول

- [ ] **Teacher portal** و نقش TEACHER (کلاس، تکلیف، داشبورد معلم).
- [ ] **اتصال دانش‌آموز به معلم.**
- [ ] **ساخت دوره‌ی سفارشی** (Custom course).
- [ ] **کتاب‌های بعدی:** AEF4، AEF5 (ساختار پشتیبانی میشه؛ فقط seed و محتوا لازمه).
- [ ] **IELTS / TOEFL** و ردیابی CEFR.
- [ ] **اپ موبایل.**
- [ ] **ویژگی‌های اجتماعی و چندنفره.**
- [ ] **پرداخت و اشتراک (SaaS).**

### فنی و زیرساخت

- [ ] **Deployment** (VPS + Docker Compose یا managed) — فعلاً فقط لوکال.
- [ ] **ثبت‌نام چندکاربره:** تأیید email، بازیابی رمز، OAuth/Social login.
- [ ] **`S3Driver`** برای ذخیره‌ی فایل (S3 / R2 / MinIO).
- [ ] **جدا کردن Worker** از API (`main.worker.ts`) و Redis برای rate limit و cache.
- [ ] **Postgres RLS** به‌عنوان لایه‌ی دفاعی دوم.
- [ ] **Audit log.**
- [ ] **مانیتورینگ:** OpenTelemetry، Sentry.
- [ ] **Export/Delete داده‌های کاربر.**
- [ ] **کاتالوگ عمومی محتوا** (`ownerId = null`) — فقط برای محتوای دارای مجوز؛ محتوای کتاب‌های ناشر user-owned می‌مونه.
- [ ] **Backup خودکار** (در MVP: اسکریپت دستی `pg_dump` + کپی پوشه‌ی `storage/`).
- [ ] **Streak Freeze پیشرفته** و قوانین پیچیده‌تر streak.
- [ ] **Postgres full-text / pgvector** برای جستجوی معنایی (در MVP: trigram).

### پس از اتمام MVP، بازبینی شود

- [ ] وزن‌های `PlannerConfig` و فرمول Mastery با داده‌ی واقعی کالیبره شن.
- [ ] نرخ تولید تمرین تکراری و کیفیت تمرین‌های AI بررسی بشه (گزارش‌های «report exercise»).
- [ ] هزینه‌ی واقعی AI در ماه (از جدول `AiRun`) و تنظیم بودجه‌ی روزانه.

---

## سؤال‌های باز

1. ساختار کامل AEF3 (لیست unitها و درس‌ها) — برای seed فاز ۱.
2. چند نمونه‌ی واقعی از یادداشت‌های معلم و فایل تمرین — برای تنظیم parser در فاز ۲.
3. روز شروع هفته برای گزارش هفتگی (پیش‌فرض: شنبه).
4. دسترسی به OpenAI از محل اجرا: مستقیم یا proxy؟
