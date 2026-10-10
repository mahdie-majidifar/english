# English Coach

مربی شخصی زبان انگلیسی: یادداشت‌های معلم → تمرین‌های روزانه‌ی شخصی‌سازی‌شده → مرور هوشمند.

مستندات کامل در پوشه‌ی [`docs/`](docs/README.md) است (پلن فنی، پرامپت‌های طراحی، وضعیت فازها، لیست کارهای موکول‌شده).

## ساختار

```text
apps/
  api/          NestJS 12 (modular monolith) + Prisma 7 + PostgreSQL
  web/          Next.js 16 + Tailwind 4 + HeroUI 3
packages/
  contracts/    schemaهای Zod مشترک بین فرانت و بک (تنها منبع حقیقت)
  domain/       منطق خالص و قابل تست (زمان و timezone، نرمال‌سازی کلمه، parse فهرست کتاب)
docs/           پلن فنی، طراحی، style tile
```

## اجرا

### برای استفاده‌ی روزمره (یک دستور)

```bash
pnpm install
pnpm start:local
```

این دستور اپ را می‌سازد، دیتابیس را به‌روز می‌کند و API و وب را بالا می‌آورد: <http://localhost:3000>. با Ctrl+C متوقف می‌شود. دفعه‌های بعد اگر چیزی عوض نشده، `pnpm start:local --no-build` سریع‌تر است.

### برای توسعه

```bash
pnpm install
pnpm dev
```

- وب: <http://localhost:3000>
- API: <http://localhost:4000/api/v1/health>

اولین بار (فقط یک‌بار):

۱. فایل `.env.example` را به `.env` (در ریشه‌ی پروژه) کپی کنید و پر کنید (`DATABASE_URL`، `JWT_ACCESS_SECRET`).
۲. دیتابیس را بسازید (`CREATE DATABASE coach;`) و جدول‌ها را بسازید:

```bash
pnpm db:migrate
```

۳. حساب بساز: از صفحه‌ی `/register` در خود اپ (ایمیل و پسورد)، یا با `pnpm db:seed` از روی `SEED_USER_*` در `.env`.

مرورگر فقط با `localhost:3000` حرف می‌زند؛ مسیر `/api/*` توسط Next به NestJS پروکسی می‌شود (cookie‌ها same-origin می‌مونن و کلید AI هیچ‌وقت به مرورگر نمی‌رسه).

## تنظیم AI

بدون AI همه‌چیز کار می‌کنه (کتاب‌ها، Library، تمرین، مرور، Quiz و Exam) جز بخش‌های AI: تحلیل خودکار یادداشت معلم، «Explain with AI»، «Fill with AI» و نمره‌دادن به جواب‌های آزاد. دو راه:

- **واقعی:** در `.env` مقدار `OPENAI_API_KEY` را بگذارید. اگر `api.openai.com` مستقیم در دسترس نیست، آدرس gateway/proxy را در `OPENAI_BASE_URL` (با `/v1` در انتها) بدهید. مدل با `AI_MODEL_PARSE` عوض میشه. سقف روزانه‌ی تعداد فراخوانی با `AI_DAILY_CALL_LIMIT`.
- **امتحانی:** `AI_PROVIDER=mock` یک مدل ساده‌ی محلی است که فقط یادداشت‌های ساده‌ای مثل «Vocabulary:» و زیرش یک کلمه در هر خط را می‌فهمد و هیچ معنی‌ای نمی‌سازد. فقط برای امتحان مسیر.

## دستورهای مفید

| دستور | کار |
|---|---|
| `pnpm build` | ساخت همه‌ی پکیج‌ها و اپ‌ها |
| `pnpm typecheck` | بررسی تایپ |
| `pnpm test` | اجرای همه‌ی تست‌ها (تست‌های API روی دیتابیس `coach_test` که خودکار ساخته میشه؛ هیچ‌وقت به OpenAI وصل نمی‌شن) |
| `pnpm db:migrate` | اعمال تغییرات schema و generate کردن client |
| `pnpm db:seed` | ساخت/به‌روزرسانی حساب کاربری از `.env` |
| `pnpm start:local` | ساخت، به‌روزرسانی دیتابیس و اجرای API و وب |
| `pnpm backup` | نسخه‌ی پشتیبان از دیتابیس در پوشه‌ی `backups/` (۱۴ تای آخر نگه داشته میشن) |

## وضعیت

- ✅ **فاز ۰:** زیرساخت، auth، پروفایل، login، اسکلت اپ
- ✅ **فاز ۱:** کتاب‌ها، unit و درس‌ها (با paste فهرست کتاب)، درس فعلی، Library، جستجو
- ✅ **فاز ۲:** جلسه‌ی معلم، یادداشت و فایل (PDF، Word، عکس، متن)، تحلیل با AI، بررسی پیش‌نویس، ذخیره
- ✅ **فاز ۳:** موتور تمرین (۱۰ فرمت)، صفحه‌ی Practice، پلیر تمرین با فیدبک، جمع‌بندی، تمرین‌های اضافه با AI
- ✅ **فاز ۴:** جلسه‌ی روزانه‌ی شخصی‌سازی‌شده، SRS (FSRS)، Mistake Bank، XP و Streak، Dashboard واقعی
- ✅ **فاز ۵:** Quiz (فیدبک فوری) و Exam (فیدبک در پایان)، تایمر سمت سرور، نمره به‌تفکیک skill، review کامل
- ✅ **فاز ۶:** صفحه‌ی Progress، Achievements، چالش‌ها، Boss Quiz
- 🔄 **فاز ۷:** پایدارسازی (تست مسیر کامل، امنیت، پشتیبان‌گیری و اجرای ساده انجام شد)
- ✅ **بسته‌ی A:** ثبت‌نام، آموزش (Learn)، کاتالوگ کتاب، سطح سختی، منوی گروه‌بندی‌شده

کارهای باقی‌مانده و وضعیت لحظه‌ای: [docs/PROGRESS.md](docs/PROGRESS.md).

جزئیات در [docs/README.md](docs/README.md) و [docs/TECHNICAL_PLAN.md](docs/TECHNICAL_PLAN.md) §۲۶.

## پشتیبان‌گیری و برگرداندن

```bash
pnpm backup
```

فایل در `backups/` ذخیره میشه (این پوشه commit نمیشه). برای برگرداندن:

```bash
pg_restore --clean --if-exists --no-owner -d "postgresql://USER:PASS@localhost:5432/coach" backups/coach-<تاریخ>.dump
```

پوشه‌ی `storage/` (فایل‌های آپلودشده‌ی معلم) هم جدا نگه داشته میشه و در پشتیبان دیتابیس نیست؛ آن را هم کپی کنید.
