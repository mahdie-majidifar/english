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

```bash
pnpm install
pnpm dev
```

- وب: <http://localhost:3000>
- API: <http://localhost:4000/api/v1/health>

اولین بار (فقط یک‌بار):

۱. فایل `.env.example` را به `.env` (در ریشه‌ی پروژه) کپی کنید و پر کنید (`DATABASE_URL`، `JWT_ACCESS_SECRET`، و ایمیل/پسورد حساب خودتان).
۲. دیتابیس را بسازید (`CREATE DATABASE coach;`) و جدول‌ها و حساب را بسازید:

```bash
pnpm db:migrate
pnpm db:seed
```

مرورگر فقط با `localhost:3000` حرف می‌زند؛ مسیر `/api/*` توسط Next به NestJS پروکسی می‌شود (cookie‌ها same-origin می‌مونن و کلید AI هیچ‌وقت به مرورگر نمی‌رسه).

## تنظیم AI (برای خواندن خودکار یادداشت‌های معلم)

بدون AI همه‌چیز کار می‌کنه (کتاب‌ها، Library، افزودن دستی) جز تحلیل خودکار یادداشت معلم. دو راه:

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

## وضعیت

- ✅ **فاز ۰:** زیرساخت، auth، پروفایل، login، اسکلت اپ
- ✅ **فاز ۱:** کتاب‌ها، unit و درس‌ها (با paste فهرست کتاب)، درس فعلی، Library، جستجو
- ✅ **فاز ۲:** جلسه‌ی معلم، یادداشت و فایل (PDF، Word، عکس، متن)، تحلیل با AI، بررسی پیش‌نویس، ذخیره
- ✅ **فاز ۳:** موتور تمرین (۱۰ فرمت)، صفحه‌ی Practice، پلیر تمرین با فیدبک، جمع‌بندی، تمرین‌های اضافه با AI
- ✅ **فاز ۴:** جلسه‌ی روزانه‌ی شخصی‌سازی‌شده، SRS (FSRS)، Mistake Bank، XP و Streak، Dashboard واقعی
- ⏭️ فاز ۵ تا ۷: Quiz/Exam، Progress و Gamification کامل، پایدارسازی

جزئیات در [docs/README.md](docs/README.md) و [docs/TECHNICAL_PLAN.md](docs/TECHNICAL_PLAN.md) §۲۶.
