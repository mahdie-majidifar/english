# وضعیت پروژه و ادامه‌ی کار (این فایل را اول بخوان)

> **برای هر چت/نشست جدید:** اول این فایل را بخوان، بعد `docs/README.md` (تصمیم‌ها و لیست موکول‌شده‌ها). هر بار که کاری تمام شد یا چیزی تغییر کرد، همین‌جا به‌روز کن، commit و push کن.
> آخرین به‌روزرسانی: **2026-10-10**

## وضعیت یک‌خطی

فازهای ۰ تا ۵ کامل و تست‌شده‌اند. درخواست‌های جدید کاربر (فهرست پایین) در حال اجرا هستند، بعد فاز ۶.

## فازها

| فاز | وضعیت | یادداشت |
|---|---|---|
| ۰ زیرساخت و auth | ✅ | |
| ۱ کتاب و محتوا | ✅ | |
| ۲ معلم و AI | ✅ | تحلیل یادداشت معلم به کلید OpenAI نیاز دارد |
| ۳ موتور تمرین | ✅ | ۱۰ فرمت تمرین |
| ۴ حلقه‌ی یادگیری | ✅ | FSRS، Mistake Bank، جلسه‌ی روزانه، داشبورد |
| ۵ Quiz و Exam | ✅ | |
| **درخواست‌های جدید (بسته‌ی A)** | 🔄 | جدول پایین |
| ۶ Progress و Gamification | ⏭️ | بعد از بسته‌ی A |
| ۷ پایدارسازی | ⏭️ | |

## بسته‌ی A: درخواست‌های کاربر (2026-10-10)

| # | درخواست | وضعیت | یادداشت |
|---|---|---|---|
| A1 | ثبت‌نام با ایمیل و پسورد | ✅ | `POST /auth/register` + `/register` + `GET /system/status`؛ `ALLOW_REGISTRATION=false` ثبت‌نام را می‌بندد؛ ۱۰ تست |
| A2 | امکان **آموزش** (توضیح قاعده/لغت قبل از تمرین) | ⏭️ | صفحه‌ی Learn برای هر درس + «توضیح بده» با AI |
| A3 | همه‌ی یونیت‌های کتاب قابل انتخاب و قابل تمرین | ⏭️ | دکمه‌ی Practice / Learn / Quiz برای هر یونیت و درس |
| A4 | کتاب‌های American English File ویرایش سوم، سطح ۳، ۴ و ۵ + Collocations in Use Intermediate در نسخه‌ی اول | ⏭️ | کاتالوگ داخلی؛ بعداً لیست انتخاب کتاب |
| A5 | سطح تمرین‌ها بالاتر | ⏭️ | تنظیم «Difficulty» با پیش‌فرض Challenging |
| A6 | فونت‌ها کوچک‌تر | ✅ | مقیاس تایپوگرافی (حدود ۱۰٪ کوچک‌تر) در `globals.css`؛ حداقل ۱۲px |
| A7 | `cursor: pointer` همه‌جا که لازم است | ✅ | قانون سراسری در `globals.css` (دکمه، لینک، radio، summary، ...) |
| A8 | طراحی قابل‌فهم‌تر و مرتب‌تر | ⏭️ | گروه‌بندی منو، توضیح فارسی کوتاه زیر عنوان‌ها |
| A9 | این فایل پیگیری + `CLAUDE.md` برای ادامه در هر چت | ✅ | |
| A10 | یادآوری خرید API (OpenAI) | ✅ | بنر داخل اپ (`AiNotice`، هر روز تا وقتی کلید نیست) + یادداشت پایین همین فایل |
| A11 | گزارش وضعیت git (آیا push می‌شود؟) | ⏭️ | |

## یادداشت مهم درباره‌ی فهرست کتاب‌ها (A4)

فهرست رسمی unit/lessonهای American English File ویرایش سوم (سطح ۳، ۴، ۵) و Collocations in Use Intermediate از اینترنت قابل‌دریافت نبود (سایت ناشر بات را می‌بندد، عبور از آن کار ممنوع است). عنوان‌ها را **حدسی ننویس**. راه درست: کاتالوگ فقط ساختار مطمئن (File 1 تا 10 با درس‌های A/B/C، و ۶۰ unit برای Collocations) را می‌دهد و کاربر عنوان‌ها را با «Paste contents» از روی کتاب خودش وارد می‌کند. اگر کاربر فهرست را فرستاد، به‌صورت داده در کاتالوگ بگذار.

## ⚠️ یادآوری: خرید API هوش مصنوعی

اپ الان با **AI تقلبی (`AI_PROVIDER=mock`)** نمایش داده می‌شود. برای کار واقعی لازم است:

1. حساب API در OpenAI (platform.openai.com) و شارژ مبلغ کم (چند دلار برای شروع کافی است). اشتراک ChatGPT جدا است و برای API کافی نیست.
2. ساخت API key و گذاشتن آن در `.env` جلوی `OPENAI_API_KEY=` و `AI_PROVIDER=openai`.
3. راه‌اندازی دوباره‌ی API.

بدون کلید این بخش‌ها کار نمی‌کنند: تحلیل یادداشت معلم، ساخت محتوای درس با AI، توضیح AI، نمره‌دادن به جواب آزاد. بقیه‌ی اپ (تمرین، مرور، Quiz، Exam) بدون AI کار می‌کند.

## معماری در یک نگاه

monorepo (pnpm + Turborepo): `apps/api` (NestJS 12 ESM + Prisma 7 + PostgreSQL)، `apps/web` (Next 16 + Tailwind 4)، `packages/contracts` (Zod، منبع حقیقت انواع)، `packages/domain` (منطق خالص: FSRS، planner، تمرین‌ها، assessment). تست: `pnpm turbo run typecheck test build` (۳۰۹ تست در زمان نگارش).

## نکات اجرایی

- اجرا: API با `node apps/api/dist/main.js` (بعد از build) و `AI_PROVIDER=mock`؛ web با `pnpm exec next dev --port 3000` داخل `apps/web`. ورود: `learner@coach.local`، پسورد در `.env` (`SEED_USER_PASSWORD`).
- Prisma 7: `migrate dev` تعاملی است. روش: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o <dir>/migration.sql`، سپس `prisma migrate deploy` و `prisma generate`.
- قبل از typecheck اپ‌ها، پکیج‌ها را build کن (`turbo run build --filter=@coach/contracts --filter=@coach/domain`).
- ظاهر UI را حتماً با screenshot بررسی کن، نه فقط متن DOM.
- روی این ماشین python نیست؛ از node استفاده کن. فایل‌های بزرگ را با ابزار Write بنویس نه heredoc.
- `.env` هرگز commit نشود. GitHub: `origin` = https://github.com/mahdie-majidifar/english.git (push کار می‌کند).

## تاریخچه‌ی کوتاه

- 2026-10-07: فازهای ۰ تا ۳.
- 2026-10-08/10: فاز ۴، رفع باگ کارت‌های سفید (`cn()` با tailwind-merge)، فاز ۵.
- 2026-10-10: ثبت درخواست‌های بسته‌ی A و این فایل.
