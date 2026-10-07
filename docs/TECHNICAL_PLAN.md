# پلن فنی — AI English Coach

> نسخه‌ی ۱ — بر اساس PRD و تصمیم‌های گرفته‌شده
> وضعیت: پیش‌نویس برای بررسی (هنوز کدی نوشته نشده)

---

## ۰. تصمیم‌های کلیدی و اصلاحات PRD

### ۰.۱ تصمیم‌های قطعی

| موضوع | تصمیم |
|---|---|
| زبان UI | انگلیسی (LTR). توضیحات گرامر، ترجمه‌ها و فیدبک به فارسی (بلوک‌های `dir="rtl"`). |
| AI Provider | OpenAI به‌عنوان پیش‌فرض، پشت لایه‌ی abstraction. `OPENAI_BASE_URL` قابل تنظیم (برای proxy/gateway). |
| استقرار | فعلاً لوکال. PostgreSQL با Docker Compose. فایل‌ها روی دیسک لوکال. |
| Scope | Vertical slice: اول حلقه‌ی کامل یادگیری، بعد Quiz/Exam، بعد Gamification/Progress کامل. |
| ساختار Repo | Monorepo با `pnpm` + Turborepo. |
| Backend | NestJS، Modular Monolith، رویدادهای داخلی، صف job با `pg-boss`. |
| Database | PostgreSQL 16 + Prisma. |
| Spaced Repetition | الگوریتم FSRS با کتابخانه‌ی `ts-fsrs`. |
| Validation | Zod (v4)، مشترک بین Frontend، Backend و خروجی AI. |

### ۰.۲ اصلاحات معماری نسبت به PRD

| # | مشکل در PRD | اصلاح |
|---|---|---|
| 1 | جدول جدا برای هر نوع محتوا (Vocabulary, Collocation, ...) → رابطه‌ی polymorphic برای Mistake/Review/Mastery | یک جدول `LearningItem` با `type` + `payload` (JSONB، validate با Zod) + `LearningItemRelation` |
| 2 | قاطی شدن محتوا با وضعیت یادگیرنده | `LearningItem` (محتوا، با `ownerId`) جدا از `UserItemState` (mastery، FSRS) |
| 3 | تولید تمرین AI در لحظه‌ی شروع session | **Exercise Pool** که در پس‌زمینه پر می‌شه؛ Learning Engine فقط انتخاب می‌کنه |
| 4 | خروجی AI مستقیم وارد دیتابیس | مرحله‌ی **Draft → Review → Commit** + validate با schema |
| 5 | Quiz و Exam دو سیستم جدا | یک ماژول `assessments` با `kind` و Blueprint |
| 6 | نوع خطای آزاد → تشخیص تکرار غیرممکن | Taxonomy ثابت `ErrorType`؛ AI فقط انتخاب می‌کنه |
| 7 | هم‌پوشانی Mastery و SRS | FSRS برای زمان‌بندی؛ Mastery مقدار محاسبه‌شده؛ Weak یک flag |
| 8 | Speaking/Listening/Level Assessment در MVP بدون ابزار اندازه‌گیری | فقط مهارت‌های قابل‌اندازه‌گیری در MVP؛ Speaking = roleplay متنی (فاز بعد) |
| 9 | وابستگی چرخشی بین ماژول‌ها | Domain Events (`attempt.evaluated`, ...) |
| 10 | Book → Level → Unit مبهمه (در AEF هر کتاب خودش یک Level است و Unit شامل درس‌های A/B) | `Book → Unit → Lesson` (مثلاً Book: AEF3، Unit: 8، Lesson: 8B — Business) |
| 11 | جدول جدای `TeacherExercise` | تمرین معلم = `Exercise` با `origin = TEACHER_ORIGINAL` + لینک به فایل/متن اصلی immutable |
| 12 | `QuizAttempt`/`ExamAttempt` جدا | هر `Assessment` خودش یک «اجرا» است؛ retake = instance جدید از همون blueprint |
| 13 | endpoint عمومی `/api/ai` | حذف. فقط endpointهای task-specific (جلوگیری از سوءاستفاده و هزینه‌ی کنترل‌نشده) |
| 14 | ریسک نشت جواب‌ها به frontend | ستون `solution` جدا از `content`؛ جواب فقط بعد از submit ارسال می‌شه |
| 15 | `StudySession` مبهم | `DailyActivity` (تجمیع روزانه با timezone کاربر) + زمان فعال در session/assessment |

---

## ۱. معماری کلی سیستم

```text
┌──────────────────────────────────────────────────────────────┐
│                         Browser                              │
│   Next.js (App Router) — UI، Exercise Player، Animations     │
└───────────────┬──────────────────────────────────────────────┘
                │  /api/*  (Next rewrites → same-origin، بدون CORS)
┌───────────────▼──────────────────────────────────────────────┐
│                   NestJS — Modular Monolith                  │
│                                                              │
│  HTTP Controllers ──► Application Services ──► Domain Logic  │
│        │                     │      ▲              (pure)    │
│        │                     ▼      │                        │
│        │              Domain Events (in-process)             │
│        │                     │                               │
│        │              pg-boss Workers (همان process)         │
│        │                     │                               │
│        ▼                     ▼                               │
│   Prisma ─────────► PostgreSQL         AI Gateway ──► OpenAI │
│   StorageDriver ──► Local Disk (./storage)                   │
└──────────────────────────────────────────────────────────────┘
```

**لایه‌های محصول (طبق اصل ۴۱ PRD):**

| لایه | پیاده‌سازی |
|---|---|
| Intelligence | ماژول `ai` (parser، generator، evaluator، tutor، coach) |
| Decision | ماژول `learning-engine` (قطعی و rule-based) |
| Practice | ماژول‌های `exercises`، `practice`، `assessments` |
| Measurement | ماژول‌های `learning-state`، `mistakes`، `progress` |
| Engagement | ماژول `gamification` + لایه‌ی UI/Motion |

### ساختار Monorepo

```text
ai-english-coach/
├── apps/
│   ├── web/                 # Next.js
│   └── api/                 # NestJS
├── packages/
│   ├── contracts/           # Zod schemas: exercise formats، DTOها، item payloadها، error codes
│   ├── domain/              # منطق خالص و قابل تست: FSRS mapping، mastery، planner، XP rules
│   └── config/              # tsconfig، eslint، prettier
├── docker-compose.yml       # PostgreSQL (+ pgAdmin اختیاری)
├── storage/                 # فایل‌های آپلودی (gitignored)
└── turbo.json
```

> `packages/domain` جداست تا منطق اصلی (Learning Engine، Mastery، FSRS) بدون NestJS و دیتابیس تست بشه.

---

## ۲. معماری Frontend

| موضوع | انتخاب |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + HeroUI (نسخه‌ی سازگار با Tailwind v4 — در فاز ۰ قفل می‌شه) |
| Animation | `motion` (framer-motion) — HeroUI هم از اون استفاده می‌کنه |
| Server state | TanStack Query |
| Client state | Zustand (فقط برای Session/Assessment Player) |
| Forms | react-hook-form + Zod resolver |
| URL state | `nuqs` (فیلترهای Library، Mistakes) |
| Charts | Recharts |
| Fonts | Inter (انگلیسی) + Vazirmatn (فارسی) |
| Icons | Lucide |

**اصول:**
- Server Components برای layout و shell؛ صفحات تعاملی Client Component.
- ارتباط با API از طریق `apps/web/lib/api` — یک client تایپ‌شده که typeها رو از `packages/contracts` می‌گیره.
- `next.config` → `rewrites: /api/* → http://localhost:4000/api/*` تا cookieها same-origin باشن.
- `middleware.ts` فقط وجود cookie رو چک می‌کنه و به `/login` redirect می‌کنه؛ اعتبارسنجی واقعی در NestJS.

---

## ۳. معماری ماژول‌های NestJS

### ساختار نهایی (اصلاح‌شده‌ی بخش ۲۹ PRD)

```text
apps/api/src/
├── core/                         # زیرساخت — بدون منطق کسب‌وکار
│   ├── config/                   # @nestjs/config + validate env با Zod
│   ├── prisma/                   # PrismaService
│   ├── auth/                     # JWT، guards، @CurrentUser، @Public، @Roles
│   ├── storage/                  # StorageDriver: LocalDiskDriver (بعداً S3Driver)
│   ├── jobs/                     # pg-boss wrapper، ثبت worker‌ها
│   ├── events/                   # EventEmitter2 + تعریف typeهای رویداد
│   ├── time/                     # Clock + محاسبه‌ی localDate با timezone کاربر
│   └── http/                     # exception filter، Zod pipe، logging interceptor
│
└── modules/
    ├── users/                    # پروفایل، ترجیحات، timezone
    ├── catalog/                  # Book، Unit، Lesson، Topic، Enrollment
    ├── content/                  # LearningItem (همه‌ی typeها)، relations، search
    ├── teacher/                  # TeacherSession، Material، ingestion pipeline، Draft/Commit
    ├── exercises/                # Exercise، pool، format handlers، generation، evaluation، attempts
    ├── learning-state/           # UserItemState، FSRS scheduler، mastery، adaptive level
    ├── mistakes/                 # ErrorType taxonomy، Mistake، occurrences، priority
    ├── learning-engine/          # planner، recommendations، weak areas — فقط خواندن
    ├── practice/                 # DailySession، free practice، challenges
    ├── assessments/              # Quiz + Exam (blueprint، generation، grading)
    ├── progress/                 # DailyActivity، snapshots، stats، weekly report
    ├── gamification/             # XP ledger، level، streak، achievements
    ├── dashboard/                # endpoint تجمیعی (BFF)
    └── ai/                       # provider abstraction + task services + prompts
```

**تغییرات نسبت به PRD:**
- `vocabulary`، `collocations`، `grammar`، `word-formation`، `expressions` → ادغام در `content` (با strategy برای هر type).
- `books`، `units`، `topics` → ادغام در `catalog`.
- `teacher-materials` + `teacher-exercises` → `teacher`.
- `quizzes` + `exams` → `assessments`.
- `reviews` + `mastery` → `learning-state`.
- `files` → `core/storage` (زیرساخت، نه ماژول کسب‌وکار).

### قوانین وابستگی

```text
practice / assessments
        │ (فراخوانی مستقیم)
        ▼
learning-engine ──► content, learning-state, mistakes, exercises   (فقط read)
        
exercises ──emit──► attempt.evaluated
                        │
        ┌───────────────┼──────────────┬──────────────┐
        ▼               ▼              ▼              ▼
 learning-state     mistakes      gamification     progress
```

- هیچ ماژولی به `practice` یا `assessments` وابسته نیست.
- به‌روزرسانی‌های جانبی فقط از طریق رویداد انجام می‌شه.
- listenerها **همگام (sync)** و داخل همون transaction اجرا می‌شن تا پاسخ attempt شامل XP و تغییر mastery باشه؛ کارهای سنگین (AI) → pg-boss.

### رویدادهای اصلی

| رویداد | منتشرکننده | شنونده‌ها |
|---|---|---|
| `attempt.evaluated` | exercises | learning-state، mistakes، gamification، progress |
| `session.completed` | practice | gamification، progress |
| `assessment.graded` | assessments | learning-state، gamification، progress |
| `material.committed` | teacher | exercises (job تولید pool) |
| `item.mastered` | learning-state | gamification (achievements) |
| `mistake.resolved` | mistakes | gamification |

### ساختار داخلی هر ماژول

```text
modules/mistakes/
├── mistakes.module.ts
├── mistakes.controller.ts
├── mistakes.service.ts          # application logic
├── mistakes.repository.ts       # همه‌ی queryها — userId همیشه اجباری
├── mistakes.listener.ts         # @OnEvent('attempt.evaluated')
└── dto/                         # re-export از packages/contracts
```

---

## ۴. Schema دیتابیس (Prisma)

> برای خوانایی، back-relationها و برخی `@relation`ها حذف شدن. همه‌ی idها `uuid` هستن.
> `localDate` همیشه بر اساس timezone کاربر محاسبه می‌شه.

```prisma
// ───────────────────────── Enums ─────────────────────────

enum Role { STUDENT TEACHER ADMIN }

enum ItemType {
  VOCABULARY
  COLLOCATION
  GRAMMAR
  EXPRESSION
  WORD_FORMATION
  IRREGULAR_VERB
  WORD_DISTINCTION
  SENTENCE_PATTERN
  PRONUNCIATION
}

enum SkillArea {
  VOCABULARY
  GRAMMAR
  COLLOCATION
  WORD_FORMATION
  EXPRESSION
  WRITING
  SPEAKING
  LISTENING
  READING
  PRONUNCIATION
}

enum ContentSource     { TEACHER BOOK USER AI_SUGGESTED }
enum ItemRelationKind  { COLLOCATES_WITH DERIVED_FROM CONFUSABLE_WITH MEMBER_OF RELATED }
enum EnrollmentStatus  { PLANNED ACTIVE COMPLETED }
enum MaterialCategory  { CLASS_NOTES EXERCISE HANDOUT OTHER }
enum IngestionStatus   { UPLOADED EXTRACTING PARSING AWAITING_REVIEW COMMITTED FAILED }
enum DraftStatus       { PENDING COMMITTED DISCARDED }
enum ExerciseLevel     { RECOGNITION RECALL CONTEXT PRODUCTION }
enum ExerciseOrigin    { TEACHER_ORIGINAL TEACHER_DERIVED AI_GENERATED TEMPLATE }
enum ExerciseStatus    { ACTIVE RETIRED }
enum EvaluationMode    { RULE AI }
enum AttemptContext    { DAILY_SESSION PRACTICE QUIZ EXAM CHALLENGE }
enum LearningStatus    { NEW LEARNING REVIEW MASTERED }
enum MistakeStatus     { ACTIVE IMPROVING RESOLVED }
enum SessionStatus     { PLANNED IN_PROGRESS COMPLETED ABANDONED }
enum SessionBlock      { WARM_UP NEW_CONTENT PRACTICE CONTEXT PRODUCTION REVIEW }
enum SelectionReason   { DUE_REVIEW MISTAKE WEAK_AREA NEW_CONTENT TEACHER_ASSIGNED RECOVERY }
enum AssessmentKind    { QUIZ EXAM }
enum AssessmentPreset  { LESSON UNIT MULTI_UNIT TOPIC SKILL WEAK_AREAS TEACHER_SESSION WEEKLY MONTHLY CUSTOM }
enum AssessmentStatus  { GENERATING READY IN_PROGRESS SUBMITTED GRADED EXPIRED }
enum ChallengeKind     { DAILY WEEKLY BOSS }
enum ChallengeStatus   { ACTIVE COMPLETED EXPIRED }
enum AiTask            { PARSE_CONTENT GENERATE_EXERCISES EVALUATE_ANSWER EXPLAIN ANALYZE_MISTAKES COACH_REPORT CONVERSATION }
enum AiRunStatus       { SUCCESS FAILED }

// ───────────────────────── Identity ─────────────────────────

model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  passwordHash String
  displayName  String
  role         Role     @default(STUDENT)
  timezone     String   @default("Asia/Tehran")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model UserProfile {
  userId              String   @id @db.Uuid
  englishLevel        String?  // CEFR: B1, B2
  learningGoal        String?
  dailyGoalMinutes    Int      @default(10)
  sessionMinutes      Int      @default(10)
  activeEnrollmentId  String?  @db.Uuid
  updatedAt           DateTime @updatedAt
}

model RefreshToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  tokenHash String    @unique
  familyId  String    @db.Uuid      // تشخیص reuse
  expiresAt DateTime
  revokedAt DateTime?
  userAgent String?
  createdAt DateTime  @default(now())
  @@index([userId])
}

// ───────────────────────── Catalog ─────────────────────────

model Book {
  id          String   @id @default(uuid()) @db.Uuid
  ownerId     String?  @db.Uuid     // null = کاتالوگ عمومی (فاز SaaS)
  series      String                // "American English File"
  title       String                // "American English File 3"
  levelNumber Int?
  cefr        String?
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  @@index([ownerId])
}

model Unit {
  id     String  @id @default(uuid()) @db.Uuid
  bookId String  @db.Uuid
  number Int
  title  String?
  @@unique([bookId, number])
}

model Lesson {
  id        String @id @default(uuid()) @db.Uuid
  unitId    String @db.Uuid
  code      String               // "8B"
  title     String               // "Business"
  sortOrder Int
  @@unique([unitId, code])
}

model Topic {
  id      String  @id @default(uuid()) @db.Uuid
  ownerId String? @db.Uuid
  name    String
  slug    String
  @@unique([ownerId, slug])
}

model Enrollment {
  id              String           @id @default(uuid()) @db.Uuid
  userId          String           @db.Uuid
  bookId          String           @db.Uuid
  status          EnrollmentStatus @default(ACTIVE)
  currentLessonId String?          @db.Uuid
  startedAt       DateTime         @default(now())
  completedAt     DateTime?
  @@unique([userId, bookId])
}

// ───────────────────────── Content ─────────────────────────

model LearningItem {
  id             String        @id @default(uuid()) @db.Uuid
  ownerId        String?       @db.Uuid
  type           ItemType
  headword       String        // "negotiate" | "Reported Speech" | "fit / suit / match"
  normalizedKey  String        // برای dedupe و merge
  meaningEn      String?
  meaningFa      String?
  payload        Json          // schema مخصوص type در packages/contracts
  payloadVersion Int           @default(1)
  source         ContentSource
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  archivedAt     DateTime?
  topics         Topic[]
  @@unique([ownerId, type, normalizedKey])
  @@index([ownerId, type])
  // + GIN trigram index روی headword و meaningFa (migration دستی) برای search
}

// یک آیتم ممکنه در چند درس یا چند جلسه‌ی معلم تکرار بشه
model LearningItemSource {
  id               String   @id @default(uuid()) @db.Uuid
  itemId           String   @db.Uuid
  lessonId         String?  @db.Uuid
  teacherSessionId String?  @db.Uuid
  materialId       String?  @db.Uuid
  createdAt        DateTime @default(now())
  @@index([itemId])
  @@index([lessonId])
  @@index([teacherSessionId])
}

model LearningItemRelation {
  fromId String           @db.Uuid
  toId   String           @db.Uuid
  kind   ItemRelationKind
  @@id([fromId, toId, kind])
  @@index([toId])
}

// ───────────────────────── Teacher ─────────────────────────

model TeacherSession {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  title     String                 // "Session 21"
  classDate DateTime @db.Date
  lessonId  String?  @db.Uuid
  createdAt DateTime @default(now())
  @@index([userId, classDate])
}

model StoredFile {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @db.Uuid
  storageKey   String   @unique
  originalName String
  mimeType     String
  sizeBytes    Int
  sha256       String
  createdAt    DateTime @default(now())
  @@index([userId, sha256])
}

model TeacherMaterial {
  id               String           @id @default(uuid()) @db.Uuid
  userId           String           @db.Uuid
  teacherSessionId String?          @db.Uuid
  category         MaterialCategory
  title            String
  rawText          String?          // متن paste‌شده — immutable
  fileId           String?          @db.Uuid  // فایل اصلی — immutable
  extractedText    String?
  status           IngestionStatus  @default(UPLOADED)
  errorMessage     String?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
  @@index([userId, createdAt])
}

model ContentDraft {
  id          String      @id @default(uuid()) @db.Uuid
  userId      String      @db.Uuid
  materialId  String      @db.Uuid
  status      DraftStatus @default(PENDING)
  proposal    Json        // آیتم‌ها و تمرین‌های پیشنهادی + confidence
  aiRunId     String?     @db.Uuid
  createdAt   DateTime    @default(now())
  committedAt DateTime?
}

// ───────────────────────── Exercises ─────────────────────────

model Exercise {
  id               String         @id @default(uuid()) @db.Uuid
  ownerId          String?        @db.Uuid
  format           String         // کلید registry: "multiple_choice", "fill_blank", ...
  formatVersion    Int            @default(1)
  level            ExerciseLevel
  skill            SkillArea
  origin           ExerciseOrigin
  status           ExerciseStatus @default(ACTIVE)
  content          Json           // قابل ارسال به کلاینت
  solution         Json           // فقط سرور — قبل از submit ارسال نمی‌شه
  evaluationMode   EvaluationMode
  estimatedSeconds Int
  fingerprint      String         // hash نرمال‌شده — جلوگیری از تمرین تکراری
  originalSnippet  String?        // متن عین‌به‌عین تمرین معلم (TEACHER_ORIGINAL)
  sourceMaterialId String?        @db.Uuid
  derivedFromId    String?        @db.Uuid
  aiRunId          String?        @db.Uuid
  reportCount      Int            @default(0)
  createdAt        DateTime       @default(now())
  @@unique([ownerId, fingerprint])
  @@index([ownerId, status, level])
}

model ExerciseItem {
  exerciseId String  @db.Uuid
  itemId     String  @db.Uuid
  isPrimary  Boolean @default(true)
  @@id([exerciseId, itemId])
  @@index([itemId])
}

model ExerciseAttempt {
  id                   String         @id @db.Uuid   // = clientAttemptId (idempotency)
  userId               String         @db.Uuid
  exerciseId           String         @db.Uuid
  context              AttemptContext
  sessionItemId        String?        @unique @db.Uuid
  assessmentQuestionId String?        @unique @db.Uuid
  response             Json
  score                Float          // 0..1
  isCorrect            Boolean
  evaluation           Json           // feedback، correction، errorCodes
  evaluatedBy          EvaluationMode
  durationMs           Int?
  hintsUsed            Int            @default(0)
  createdAt            DateTime       @default(now())
  @@index([userId, createdAt])
  @@index([userId, exerciseId])
}

// نتیجه به تفکیک آیتم (مثلاً تمرین matching با ۵ کلمه)
model AttemptItemResult {
  attemptId  String   @db.Uuid
  itemId     String   @db.Uuid
  isCorrect  Boolean
  score      Float
  errorCodes String[]
  @@id([attemptId, itemId])
  @@index([itemId])
}

// ───────────────────────── Learning State ─────────────────────────

model UserItemState {
  userId             String         @db.Uuid
  itemId             String         @db.Uuid
  status             LearningStatus @default(NEW)
  isWeak             Boolean        @default(false)
  // FSRS
  due                DateTime?
  stability          Float          @default(0)
  difficulty         Float          @default(0)
  fsrsState          Int            @default(0)   // New/Learning/Review/Relearning
  reps               Int            @default(0)
  lapses             Int            @default(0)
  lastReviewedAt     DateTime?
  // Mastery و سختی تطبیقی
  mastery            Float          @default(0)
  accuracyEwma       Float          @default(0)
  currentLevel       ExerciseLevel  @default(RECOGNITION)
  highestLevelPassed ExerciseLevel?
  levelStreak        Int            @default(0)   // مثبت: پشت‌سرهم درست، منفی: غلط
  firstSeenAt        DateTime?
  updatedAt          DateTime       @updatedAt
  @@id([userId, itemId])
  @@index([userId, due])
  @@index([userId, status])
}

model ReviewLog {
  id             String   @id @default(uuid()) @db.Uuid
  userId         String   @db.Uuid
  itemId         String   @db.Uuid
  attemptId      String?  @db.Uuid
  rating         Int      // 1 Again، 2 Hard، 3 Good، 4 Easy
  stabilityAfter Float
  dueAfter       DateTime
  reviewedAt     DateTime @default(now())
  @@index([userId, itemId])
}

// ───────────────────────── Mistakes ─────────────────────────

model ErrorType {
  code     String @id       // "GRAMMAR.BACKSHIFT"
  category String           // GRAMMAR | VERB | VOCAB | FORM | SPELLING | L1
  labelEn  String
  labelFa  String
  severity Int    @default(2)  // 1..3
}

model Mistake {
  id               String        @id @default(uuid()) @db.Uuid
  userId           String        @db.Uuid
  itemId           String?       @db.Uuid
  errorCode        String
  signature        String        // `${itemId ?? '*'}:${errorCode}`
  status           MistakeStatus @default(ACTIVE)
  occurrences      Int           @default(1)
  priority         Float
  correctDaysSince Int           @default(0)
  firstSeenAt      DateTime      @default(now())
  lastSeenAt       DateTime      @default(now())
  @@unique([userId, signature])
  @@index([userId, status, priority])
}

model MistakeOccurrence {
  id             String   @id @default(uuid()) @db.Uuid
  mistakeId      String   @db.Uuid
  attemptId      String   @db.Uuid
  userAnswer     String
  expectedAnswer String
  createdAt      DateTime @default(now())
  @@index([mistakeId, createdAt])
}

// ───────────────────────── Practice ─────────────────────────

model DailySession {
  id             String        @id @default(uuid()) @db.Uuid
  userId         String        @db.Uuid
  localDate      DateTime      @db.Date
  ordinal        Int           @default(1)
  status         SessionStatus @default(PLANNED)
  plannedSeconds Int
  activeSeconds  Int           @default(0)
  planMeta       Json          // دلایل انتخاب، نسخه‌ی الگوریتم، وزن‌ها
  score          Float?
  startedAt      DateTime?
  completedAt    DateTime?
  createdAt      DateTime      @default(now())
  @@unique([userId, localDate, ordinal])
}

model DailySessionItem {
  id         String          @id @default(uuid()) @db.Uuid
  sessionId  String          @db.Uuid
  position   Int
  block      SessionBlock
  exerciseId String          @db.Uuid
  itemId     String?         @db.Uuid
  reason     SelectionReason
  @@unique([sessionId, position])
}

model Challenge {
  id          String          @id @default(uuid()) @db.Uuid
  userId      String          @db.Uuid
  kind        ChallengeKind
  localDate   DateTime        @db.Date
  definition  Json
  status      ChallengeStatus @default(ACTIVE)
  xpReward    Int
  completedAt DateTime?
  @@unique([userId, kind, localDate])
}

// ───────────────────────── Assessments ─────────────────────────

model Assessment {
  id           String           @id @default(uuid()) @db.Uuid
  userId       String           @db.Uuid
  kind         AssessmentKind
  preset       AssessmentPreset
  title        String
  blueprint    Json             // scope، sections، timeLimit، feedbackMode
  status       AssessmentStatus @default(GENERATING)
  timeLimitSec Int?
  startedAt    DateTime?
  expiresAt    DateTime?
  submittedAt  DateTime?
  gradedAt     DateTime?
  score        Float?
  breakdown    Json?            // به تفکیک skill
  createdAt    DateTime         @default(now())
  @@index([userId, kind, createdAt])
}

model AssessmentQuestion {
  id           String    @id @default(uuid()) @db.Uuid
  assessmentId String    @db.Uuid
  position     Int
  exerciseId   String    @db.Uuid
  skill        SkillArea
  points       Float     @default(1)
  response     Json?     // ذخیره‌ی خودکار تا submit
  answeredAt   DateTime?
  @@unique([assessmentId, position])
}

// ───────────────────────── Progress ─────────────────────────

model DailyActivity {
  userId            String   @db.Uuid
  localDate         DateTime @db.Date
  activeSeconds     Int      @default(0)
  attempts          Int      @default(0)
  correct           Int      @default(0)
  sessionsCompleted Int      @default(0)
  xp                Int      @default(0)
  goalMet           Boolean  @default(false)
  @@id([userId, localDate])
}

model ProgressSnapshot {
  userId         String   @db.Uuid
  localDate      DateTime @db.Date
  overall        Float
  skills         Json
  books          Json
  itemsSeen      Int
  itemsMastered  Int
  activeMistakes Int
  @@id([userId, localDate])
}

model WeeklyReport {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @db.Uuid
  weekStart    DateTime @db.Date
  data         Json
  coachSummary String?
  createdAt    DateTime @default(now())
  @@unique([userId, weekStart])
}

// ───────────────────────── Gamification ─────────────────────────

model UserGamification {
  userId         String    @id @db.Uuid
  totalXp        Int       @default(0)
  level          Int       @default(1)
  currentStreak  Int       @default(0)
  longestStreak  Int       @default(0)
  lastStreakDate DateTime? @db.Date
  streakFreezes  Int       @default(0)
}

model XpEvent {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  amount    Int
  reason    String   // "ATTEMPT_CORRECT" | "SESSION_COMPLETED" | ...
  refId     String
  createdAt DateTime @default(now())
  @@unique([userId, reason, refId])   // idempotent
  @@index([userId, createdAt])
}

model Achievement {
  id          String  @id @default(uuid()) @db.Uuid
  code        String  @unique
  title       String
  description String
  icon        String
  tier        Int     @default(1)
  criteria    Json
  isHidden    Boolean @default(false)
}

model UserAchievement {
  userId        String    @db.Uuid
  achievementId String    @db.Uuid
  progress      Float     @default(0)
  unlockedAt    DateTime?
  @@id([userId, achievementId])
}

// ───────────────────────── AI ─────────────────────────

model AiRun {
  id            String      @id @default(uuid()) @db.Uuid
  userId        String?     @db.Uuid
  task          AiTask
  provider      String
  model         String
  promptId      String
  promptVersion Int
  status        AiRunStatus
  inputTokens   Int?
  outputTokens  Int?
  costUsd       Decimal?    @db.Decimal(10, 6)
  latencyMs     Int
  errorMessage  String?
  createdAt     DateTime    @default(now())
  @@index([userId, createdAt])
  @@index([task, createdAt])
}
```

### نمونه‌ی `payload` برای هر type (در `packages/contracts`)

```ts
const VocabularyPayload = z.object({
  partOfSpeech: z.enum(['noun', 'verb', 'adjective', 'adverb', 'phrase']),
  ipa: z.string().optional(),
  definition: z.string(),
  translationFa: z.string(),
  examples: z.array(z.string()).max(5),
  wordFamily: z.array(z.object({ form: z.string(), pos: z.string() })).optional(),
});

const IrregularVerbPayload = z.object({ base: z.string(), past: z.string(), pastParticiple: z.string() });

const WordDistinctionPayload = z.object({
  members: z.array(z.string()).min(2),            // ["fit", "suit", "match", "go with"]
  distinctions: z.array(z.object({ word: z.string(), usageFa: z.string(), example: z.string() })),
});

const GrammarPayload = z.object({
  ruleFa: z.string(),
  structure: z.string(),                          // "say (that) + clause، backshift"
  examples: z.array(z.string()),
  commonErrorCodes: z.array(z.string()),          // از taxonomy
});
```

---

## ۵. روابط Entityها

```text
User ─┬─ UserProfile (1:1)
      ├─ Enrollment ──► Book ──► Unit ──► Lesson
      ├─ TeacherSession ──► TeacherMaterial ──► StoredFile
      │                          └──► ContentDraft ──(commit)──┐
      │                                                        ▼
      ├─ LearningItem ◄── LearningItemSource (lesson / teacherSession / material)
      │      ├── LearningItemRelation (fit ↔ suit، negotiate → negotiate a discount)
      │      ├── ExerciseItem ──► Exercise (TEACHER_ORIGINAL ──derivedFrom──► AI)
      │      └── UserItemState (1 per user × item)  ──► ReviewLog
      │
      ├─ ExerciseAttempt ──► AttemptItemResult ──► (item)
      │        ├── DailySessionItem ◄── DailySession
      │        └── AssessmentQuestion ◄── Assessment
      │
      ├─ Mistake (user × signature) ──► MistakeOccurrence ──► ExerciseAttempt
      │        └── ErrorType (taxonomy)
      │
      ├─ DailyActivity / ProgressSnapshot / WeeklyReport
      └─ UserGamification / XpEvent / UserAchievement / Challenge
```

**قاعده‌ی مالکیت:**
- **محتوا** (`Book`، `LearningItem`، `Exercise`): `ownerId` — در MVP همیشه کاربر؛ در SaaS ممکنه `null` (عمومی).
- **وضعیت یادگیرنده** (هر چیز دیگه): `userId` اجباری.

---

## ۶. طراحی API

**قراردادها:**
- Prefix: `/api/v1`
- Validation: Zod (از `packages/contracts`) با یک `ZodValidationPipe`
- خطا: فرمت `application/problem+json` (بخش ۲۳)
- Pagination: cursor-based (`?cursor=&limit=`)
- `userId` **هرگز** از body/query گرفته نمی‌شه — همیشه از توکن.

| حوزه | Endpointها |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` |
| Profile | `GET/PATCH /me/profile` |
| Dashboard | `GET /dashboard` (تجمیعی: session امروز، streak، XP، weak areas، reviews، achievements) |
| Catalog | `GET/POST /books` · `GET/PATCH /books/:id` · `POST /books/:id/units` · `POST /units/:id/lessons` · `POST /enrollments` · `PATCH /enrollments/:id` (درس فعلی) |
| Content | `GET /items?type=&lessonId=&status=&q=` · `GET /items/:id` (+ state، mistakes، history) · `POST /items` · `PATCH /items/:id` · `GET /search?q=` |
| Teacher | `GET/POST /teacher-sessions` · `GET /teacher-sessions/:id` · `POST /teacher-materials` (multipart یا متن) · `GET /teacher-materials/:id` (وضعیت) · `GET /teacher-materials/:id/file` (stream) · `GET /teacher-materials/:id/draft` · `POST /teacher-materials/:id/draft/commit` · `POST /teacher-materials/:id/reparse` |
| Exercises | `POST /attempts` · `POST /exercises/:id/report` · `POST /attempts/:id/explain` (توضیح AI) |
| Daily Session | `GET /daily-sessions/today` (ساخت یا بازیابی) · `POST /daily-sessions/:id/start` · `POST /daily-sessions/:id/items/:itemId/answer` · `POST /daily-sessions/:id/complete` |
| Practice | `POST /practice` (تمرین آزاد بر اساس type/mistakes/lesson) |
| Assessments | `POST /assessments` (blueprint) · `GET /assessments/:id` · `POST /assessments/:id/start` · `PUT /assessments/:id/questions/:qid/answer` · `POST /assessments/:id/submit` · `GET /assessments/:id/result` |
| Mistakes | `GET /mistakes?status=&errorCode=` · `GET /mistakes/:id` · `POST /mistakes/practice` |
| Reviews | `GET /reviews/due` · `GET /reviews/forecast` |
| Progress | `GET /progress/overview` · `/progress/skills` · `/progress/books` · `/progress/history?range=week\|month\|all` · `/progress/stats` |
| Reports | `GET /reports/weekly/latest` · `GET /reports/weekly/:weekStart` |
| Gamification | `GET /gamification/summary` · `GET /achievements` · `GET /challenges/today` |

**پاسخ ثبت جواب (`POST /attempts`)** — شامل پاداش‌ها برای انیمیشن، بدون نیاز به polling:

```json
{
  "attemptId": "…",
  "isCorrect": false,
  "score": 0,
  "feedback": { "correctAnswer": "she hadn't bought", "explanationFa": "…", "errorCodes": ["GRAMMAR.BACKSHIFT"] },
  "itemUpdates": [{ "itemId": "…", "mastery": 0.42, "status": "LEARNING" }],
  "rewards": [{ "type": "XP", "amount": 1 }],
  "evaluationPending": false
}
```

---

## ۷. استراتژی Authentication

| موضوع | پیاده‌سازی |
|---|---|
| روش | Email + Password (`argon2id`) |
| حالت شخصی | `ALLOW_REGISTRATION=false`؛ کاربر اصلی با `pnpm db:seed` ساخته می‌شه |
| Access token | JWT، ۱۵ دقیقه، در cookie `httpOnly`, `SameSite=Lax`, `Secure` (در production) |
| Refresh token | Opaque، ۳۰ روز، hash‌شده در DB، **rotation** در هر استفاده + reuse detection با `familyId` |
| Guards | `JwtAuthGuard` سراسری + `@Public()`؛ `RolesGuard` + `@Roles()` (MVP: فقط STUDENT) |
| CSRF | same-origin + `SameSite` + چک header `Origin` برای mutationها |
| Isolation | هر repository متد `userId` اجباری می‌گیره؛ تست‌های integration برای دسترسی cross-user |

**آینده:** جدول `AuthIdentity (provider, providerUserId, userId)` برای OAuth؛ email verification و password reset؛ Postgres RLS به‌عنوان لایه‌ی دفاعی دوم.

---

## ۸. آپلود و ذخیره‌سازی فایل

### Validation
- حداکثر حجم: ۱۵MB
- انواع مجاز: `pdf`, `docx`, `png`, `jpg`, `webp`, `txt`
- بررسی **magic bytes** (کتابخانه‌ی `file-type`)، نه فقط پسوند
- نام فایل روی دیسک: `storage/{userId}/{yyyy}/{uuid}.{ext}` — نام اصلی فقط در DB
- dedupe با `sha256` (اگه فایل تکراری باشه، به کاربر اطلاع داده می‌شه)
- فایل‌ها **خارج از** public folder؛ دسترسی فقط از endpoint احرازهویت‌شده

### Storage abstraction

```ts
interface StorageDriver {
  put(key: string, data: Readable, meta: { mimeType: string }): Promise<void>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
// MVP: LocalDiskDriver — فاز SaaS: S3Driver (S3 / R2 / MinIO)
```

### Pipeline پردازش محتوای معلم

```text
POST /teacher-materials
   │  StoredFile + TeacherMaterial(status=UPLOADED)
   ▼
[job] ingest.extract                       status=EXTRACTING
   │  txt  → همون متن
   │  docx → mammoth (متن + جدول‌ها به markdown)
   │  pdf  → لایه‌ی متنی (unpdf)؛ اگه متن کم بود → حالت vision
   │  تصویر → حالت vision
   ▼
[job] ingest.parse                         status=PARSING
   │  AI ContentParser (متن یا تصویر/PDF مستقیم به مدل multimodal)
   │  خروجی validate با Zod → ContentDraft
   ▼
                                           status=AWAITING_REVIEW
UI بررسی پیش‌نویس: ویرایش / حذف / تغییر type / ادغام با آیتم موجود
   │
   ▼  POST .../draft/commit (در یک transaction)
   │  - LearningItem جدید یا merge با موجود (بر اساس normalizedKey)
   │  - LearningItemSource (لینک به جلسه‌ی معلم و درس)
   │  - Exercise با origin=TEACHER_ORIGINAL + originalSnippet
   │  - emit material.committed
   ▼                                       status=COMMITTED
[job] exercises.fill-pool برای آیتم‌های جدید
```

---

## ۹. لایه‌ی AI Provider

### ساختار

```text
modules/ai/
├── providers/
│   ├── llm-provider.interface.ts
│   ├── openai.provider.ts          # پیاده‌سازی پیش‌فرض
│   └── fake.provider.ts            # برای تست — خروجی قطعی از fixture
├── gateway/
│   ├── ai-gateway.service.ts       # retry، timeout، validate، repair، AiRun log، budget
│   └── model-routing.ts            # task → {provider, model, temperature, maxTokens}
├── tasks/
│   ├── content-parser.service.ts
│   ├── exercise-generator.service.ts
│   ├── answer-evaluator.service.ts
│   ├── tutor.service.ts            # توضیح اشتباه
│   ├── mistake-analyzer.service.ts
│   ├── coach.service.ts            # خلاصه‌ی گزارش هفتگی
│   └── conversation.service.ts     # فاز بعد
└── prompts/                        # نسخه‌دار (بخش ۱۰)
```

### Interface

```ts
export interface LlmProvider {
  readonly name: string;
  generateObject<T>(req: {
    model: string;
    system: string;
    messages: LlmMessage[];          // parts: text | image | file(pdf)
    schema: z.ZodType<T>;
    schemaName: string;
    temperature?: number;
    maxOutputTokens?: number;
    signal?: AbortSignal;
  }): Promise<{ data: T; usage: TokenUsage }>;

  generateText(req: Omit<…, 'schema' | 'schemaName'>): Promise<{ text: string; usage: TokenUsage }>;
}
```

- پیاده‌سازی OpenAI از **Structured Outputs** (JSON Schema) استفاده می‌کنه. تبدیل Zod → JSON Schema با `z.toJSONSchema` + یک adapter برای محدودیت‌های OpenAI (همه‌ی فیلدها required، `additionalProperties: false`؛ فیلدهای optional به `nullable`).
- **مدل‌ها در config/env** تعریف می‌شن، نه در کد. Routing پیشنهادی:
  - `PARSE_CONTENT` → مدل قوی multimodal
  - `GENERATE_EXERCISES`، `EVALUATE_ANSWER` → مدل سریع و ارزان
  - `EXPLAIN`، `COACH_REPORT` → مدل متوسط
- هیچ کد domain مستقیماً SDK رو import نمی‌کنه؛ فقط `AiGateway`.

### AiGateway

1. Timeout برای هر task (مثلاً evaluation: ۱۵ ثانیه، parsing: ۹۰ ثانیه)
2. Retry: ۲ بار با exponential backoff برای خطاهای شبکه و 429/5xx
3. Validate خروجی با Zod؛ در صورت خطا **یک بار repair** (ارسال خطای validation به مدل)
4. ثبت `AiRun` (توکن، هزینه، latency، نسخه‌ی prompt)
5. Budget روزانه برای هر کاربر (`AI_DAILY_BUDGET_USD`) — جلوگیری از هزینه‌ی فرار

---

## ۱۰. معماری Prompt

### ساختار هر prompt

```ts
// prompts/evaluate-answer/v1.ts
export const evaluateAnswerV1 = definePrompt({
  id: 'evaluate-answer',
  version: 1,
  task: 'EVALUATE_ANSWER',
  outputSchema: EvaluationResultSchema,     // از packages/contracts
  system: `…`,
  buildMessages: (input: EvaluateInput) => [ … ],
});
```

### لایه‌های prompt

```text
[System]   نقش + قوانین ثابت + فرمت خروجی
[Learner]  سطح (B1)، زبان مادری فارسی، درس فعلی، آیتم‌های شناخته‌شده
[Task]     ورودی مشخص (متن معلم / آیتم‌ها / پاسخ کاربر)
[Allowed]  لیست مجاز (error codes، item ids، formats) — مدل فقط از این‌ها انتخاب می‌کنه
```

### قوانین کلیدی

| Prompt | قوانین |
|---|---|
| Content Parser | فقط محتوای موجود در ورودی رو استخراج کن؛ هر آیتم `confidence` داره؛ تمرین‌ها **عین‌به‌عین** در `originalSnippet`؛ ترجمه‌ی فارسی طبیعی |
| Exercise Generator | فقط برای itemIdهای داده‌شده؛ سطح CEFR رعایت بشه؛ MC دقیقاً یک جواب درست؛ هر distractor یک `errorCode` (misconception) داره؛ خلاصه‌ی تمرین‌های موجود ارسال می‌شه تا تکراری نسازه |
| Answer Evaluator | rubric مشخص؛ خروجی: `score`، `isAcceptable`، `errors[{code, span, correction}]`، `correctedAnswer`، `explanationFa`؛ پاسخ‌های قابل‌قبول جایگزین رو بپذیر |
| Tutor | توضیح کوتاه به فارسی + ۲ مثال انگلیسی؛ ارجاع به قاعده‌ی گرامری مرتبط |

### Quality Gate (قطعی، بعد از تولید)

- MC: جواب درست در گزینه‌ها؛ گزینه‌ها یکتا؛ ۳ تا ۵ گزینه
- Fill-blank: تعداد blankها = تعداد جواب‌ها؛ جواب در متن سؤال لو نرفته
- آیتم هدف واقعاً در جواب یا متن حضور داره
- محدودیت طول
- Dedupe: `fingerprint` (hash متن نرمال‌شده) + شباهت trigram با تمرین‌های موجود همون آیتم

تمرین‌هایی که رد بشن دور ریخته می‌شن و در `AiRun` ثبت می‌شن.

### امنیت prompt
محتوای معلم و پاسخ کاربر **داده** هستن: داخل delimiter قرار می‌گیرن و دستور تلقی نمی‌شن. خروجی AI هیچ‌وقت به‌صورت HTML رندر نمی‌شه.

### Eval Set
پوشه‌ی `apps/api/test/ai-evals/` شامل نمونه‌های طلایی (مثلاً یادداشت «Session 21» → آیتم‌های مورد انتظار). قبل از تغییر هر prompt اجرا می‌شه (خارج از CI، چون به API واقعی نیاز داره).

---

## ۱۱. Learning Engine

یک ماژول **قطعی** و **فقط خواندنی**. منطق اصلی در `packages/domain/planner` به‌صورت تابع خالص.

### ورودی و خروجی

```ts
function planDailySession(input: PlannerInput, config: PlannerConfig): SessionPlan
// input: آیتم‌ها + UserItemState + mistakes فعال + تمرین‌های pool + درس فعلی + آخرین جلسه‌ی معلم + now
// output: لیست مرتب {exerciseId, itemId, block, reason} + توضیح انتخاب‌ها
```

### مراحل

**۱. جمع‌آوری کاندیداها**

| منبع | reason |
|---|---|
| `UserItemState.due ≤ now` | `DUE_REVIEW` |
| Mistakeهای ACTIVE/IMPROVING | `MISTAKE` |
| آیتم‌های `isWeak` | `WEAK_AREA` |
| آیتم‌های دیده‌نشده‌ی درس فعلی و آخرین جلسه‌ی معلم | `NEW_CONTENT` |
| تمرین‌های `TEACHER_ORIGINAL` که هنوز انجام نشدن | `TEACHER_ASSIGNED` |

**۲. امتیازدهی**

```text
priority = 3.0 × overdueness        (1 − retrievability فعلی)
         + 2.5 × mistakePriority    (نرمال‌شده 0..1)
         + 2.0 × weakness           (1 − mastery، اگه isWeak)
         + 1.5 × teacherRecency     (نیمه‌عمر ۷ روز از تاریخ کلاس)
         + 1.0 × currentLessonBonus
         − penalty اگه امروز دیده شده
```

وزن‌ها در `PlannerConfig` قابل تنظیم‌ان.

**۳. چیدمان در بودجه‌ی زمانی** (پیش‌فرض ۶۰۰ ثانیه، ۸۵٪ برنامه‌ریزی + ۱۵٪ برای خوندن فیدبک)

قوانین:
- حداکثر ۵ آیتم جدید و حداکثر ۳۰٪ زمان برای محتوای جدید
- مرورهای سررسیده تا ۵۰٪ زمان
- اگه آیتمی سطح CONTEXT یا بالاتر داره، حداقل یک تمرین CONTEXT/PRODUCTION
- یک فرمت بیشتر از ۲ بار پشت‌سرهم تکرار نشه؛ typeهای مختلف لابه‌لای هم (interleaving)
- بلوک‌ها: `WARM_UP → NEW_CONTENT → PRACTICE → CONTEXT/PRODUCTION → REVIEW`؛ بلوک خالی حذف می‌شه (session پویا، طبق PRD)
- Warm-up: ۱ تا ۲ تمرین آسان روی آیتم‌های با mastery بالا (شروع با موفقیت)
- Review پایانی: مرور سریع flashcard روی آیتم‌های همین session

**۴. انتخاب تمرین برای هر آیتم**
1. سطح = `UserItemState.currentLevel`
2. از pool: تمرین ACTIVE با این سطح و فرمتی که اخیراً برای این آیتم استفاده نشده
3. اگه نبود → template generator قطعی (بخش ۱۲)
4. اگه باز هم نبود → آیتم حذف و job تولید در صف قرار می‌گیره. **Session هیچ‌وقت منتظر AI نمی‌مونه.**

**۵. تطبیق حین session (Recovery)**
پاسخ غلط → همون آیتم با یک سطح پایین‌تر، ۳ تا ۵ موقعیت بعد دوباره میاد (حداکثر ۲ بار برای هر آیتم).

### خروجی‌های دیگه

| خروجی | قاعده |
|---|---|
| Weak Areas | تجمیع `isWeak` و Mistakeها بر اساس GrammarPoint / ItemType / errorCode؛ ۳ مورد اول |
| Recommended Quiz | درس فعلی ≥ ۶۰٪ آیتم‌ها دیده شده و در ۷ روز اخیر quiz نداشته |
| Recommended Exam | ≥ ۸۰٪ آیتم‌های unit در وضعیت REVIEW یا بالاتر |
| Daily Challenge | قوی‌ترین weak area → ۳ تمرین CONTEXT/PRODUCTION |
| Next Topics | درس بعدی در Enrollment + آیتم‌های جلسه‌ی آخر معلم |

UI برای هر تمرین دلیل انتخاب رو نشون می‌ده («چون دیروز اشتباهش کردی»)، تا انتخاب‌ها برای کاربر قابل‌فهم باشن.

---

## ۱۲. موتور تمرین (Exercise Engine)

### Format Registry (در `packages/contracts`)

```ts
export const multipleChoice = defineFormat({
  key: 'multiple_choice',
  levels: ['RECOGNITION', 'RECALL'],
  evaluation: 'RULE',
  estimatedSeconds: 20,
  content: z.object({
    prompt: z.string(),
    contextFa: z.string().optional(),
    options: z.array(z.object({ id: z.string(), text: z.string() })).min(3).max(5),
  }),
  solution: z.object({
    correctOptionId: z.string(),
    explanationFa: z.string(),
    distractorErrors: z.record(z.string(), z.string()),   // optionId → errorCode
  }),
  response: z.object({ optionId: z.string() }),
});
```

> **نکته:** هر distractor یک `errorCode` داره. پس انتخاب گزینه‌ی غلط **بدون AI** نوع اشتباه رو مشخص می‌کنه.

### فرمت‌های MVP

| فرمت | سطح | ارزیابی | تولید |
|---|---|---|---|
| `flashcard` | RECOGNITION | self-rating | Template |
| `multiple_choice` | RECOGNITION/RECALL | Rule | Template + AI |
| `matching` | RECOGNITION | Rule | Template |
| `fill_blank` | RECALL/CONTEXT | Rule (+AI fallback) | AI |
| `irregular_verb_forms` | RECALL | Rule | Template |
| `word_formation` | RECALL/CONTEXT | Rule | Template + AI |
| `choose_distinction` (fit/suit/match) | CONTEXT | Rule | AI |
| `sentence_order` | CONTEXT | Rule | AI |
| `transformation` | CONTEXT/PRODUCTION | Rule + AI | AI |
| `error_correction` | CONTEXT | Rule + AI | AI |
| `translation_fa_en` | PRODUCTION | AI | AI |
| `free_production` | PRODUCTION | AI | AI |

فاز بعد: `translation_en_fa`، `odd_one_out`، image-based، pronunciation، roleplay.

### نگاشت سطح‌ها به PRD

| PRD | سیستم | معنی |
|---|---|---|
| Easy | RECOGNITION | تشخیص (انتخاب از گزینه‌ها) |
| Medium | RECALL | یادآوری (نوشتن شکل/کلمه) |
| Hard | CONTEXT | کاربرد در جمله |
| Production | PRODUCTION | تولید آزاد |

### Backend: Format Handler

```ts
interface ExerciseFormatHandler<C, S, R> {
  key: string;
  toClient(content: C): ClientExercise;                   // بدون solution
  evaluate(response: R, solution: S): RuleEvaluation;     // قطعی
  needsAi(result: RuleEvaluation): boolean;               // برای حالت hybrid
}
```

### نرمال‌سازی پاسخ (قبل از ارزیابی قطعی)
- trim، lowercase (به‌جز جاهایی که مهمه)، یکسان‌سازی apostrophe (`'` و `'`)
- معادل‌سازی contractionها (`didn't` = `did not`)
- لیست `acceptedAnswers` در solution
- غلط تایپی (Levenshtein ≤ 1 برای کلمات بالای ۵ حرف) → «تقریباً درست» با score 0.8 و تذکر املایی

### ارزیابی دومرحله‌ای (کاهش هزینه)

```text
پاسخ ──► Rule evaluation ──► تطابق کامل؟ ── بله ──► نتیجه
                                  │
                                  خیر، و فرمت open-ended
                                  ▼
                          AI Evaluator (≤ 15s)
                                  │ timeout/خطا
                                  ▼
                 evaluationPending=true + job پس‌زمینه
```

### چرخه‌ی عمر تمرین
`ACTIVE` → `RETIRED` (در صورت گزارش کاربر یا آمار ضعیف: مثلاً همه همیشه درست یا همیشه غلط جواب می‌دن).
تمرین `TEACHER_ORIGINAL` هرگز ویرایش نمی‌شه؛ اصلاح = تمرین جدید با `derivedFromId`.

### Frontend: Renderer Registry

```ts
const renderers: Record<FormatKey, ComponentType<ExerciseProps<any>>> = {
  multiple_choice: MultipleChoiceExercise,
  fill_blank: FillBlankExercise,
  // …
};
// ExerciseShell: هدر، تایمر، دکمه‌ی submit، کلیدهای میانبر، انیمیشن فیدبک، دکمه‌ی «چرا؟»
```

---

## ۱۳. معماری Quiz

Quiz و Exam هر دو روی ماژول `assessments` ساخته می‌شن.

### Blueprint

```ts
const Blueprint = z.object({
  scope: z.object({
    bookIds: z.array(z.uuid()).optional(),
    unitIds: z.array(z.uuid()).optional(),
    lessonIds: z.array(z.uuid()).optional(),
    teacherSessionIds: z.array(z.uuid()).optional(),
    itemTypes: z.array(ItemType).optional(),
    weakOnly: z.boolean().default(false),
    sinceDays: z.number().optional(),        // برای weekly/monthly
  }),
  sections: z.array(z.object({
    skill: SkillArea,
    count: z.number().int().min(1),
    levels: z.array(ExerciseLevel),
  })),
  timeLimitSec: z.number().optional(),
  feedbackMode: z.enum(['IMMEDIATE', 'END']),
  preferUnseen: z.boolean(),
});
```

### Quiz
- `feedbackMode`: پیش‌فرض `IMMEDIATE`
- نمونه‌گیری لایه‌ای از scope: ۶۰٪ آیتم‌های ضعیف/در حال یادگیری، ۴۰٪ پوشش عمومی
- پیش‌فرض‌ها: ۱۰ تا ۱۵ سؤال، ۱۰ دقیقه
- تأثیر: هر جواب یک `ExerciseAttempt` با `context=QUIZ` → همون pipeline رویدادها

### روند

```text
POST /assessments → GENERATING → (انتخاب سؤال‌ها، snapshot) → READY
POST /start → IN_PROGRESS (expiresAt = now + timeLimit + ۳۰ ثانیه grace)
PUT  /answer (autosave)
POST /submit → SUBMITTED → grading → GRADED → emit assessment.graded
```

- سؤال‌ها موقع ساخت قفل می‌شن (snapshot)؛ تغییرات بعدی pool روی اون اثر نداره.
- زمان **در سرور** کنترل می‌شه؛ جواب‌های بعد از `expiresAt` قبول نمی‌شن.
- اگه سؤال‌های AI-graded داشته باشه، grading به‌صورت async انجام می‌شه و UI وضعیت «در حال نمره‌دهی» نشون می‌ده.

---

## ۱۴. معماری Exam

تفاوت‌ها با Quiz فقط در config:

| ویژگی | Quiz | Exam |
|---|---|---|
| فیدبک | فوری | فقط بعد از submit |
| انتخاب تمرین | از pool | **ترجیحاً تمرین‌های دیده‌نشده** (`preferUnseen=true`) برای اندازه‌گیری واقعی |
| وزن در mastery | عادی | بیشتر (یک امتیاز اضافه در ارتقای سطح) |
| بازبینی جواب‌ها | — | صفحه‌ی review کامل با توضیح |

### Presetها

| Preset | Scope | سؤال‌ها / زمان |
|---|---|---|
| Unit Exam | همه‌ی درس‌های unit | ۲۵ / ۲۰ دقیقه |
| Topic Exam | آیتم‌های یک Topic | ۲۰ / ۱۵ دقیقه |
| Grammar Exam | یک GrammarPoint + آیتم‌های مرتبط | ۱۵ / ۱۵ دقیقه |
| Vocabulary Exam | چند unit، فقط vocab/collocation | ۳۰ / ۲۰ دقیقه |
| Weekly | آیتم‌های دیده‌شده در ۷ روز اخیر | ۲۰ / ۱۵ دقیقه |
| Monthly | ۳۰ روز اخیر، نمونه‌گیری | ۳۰ / ۲۵ دقیقه |
| Boss Quiz | پایان unit، UI ویژه، XP بیشتر | — |

**Level Assessment** به فاز ۳ منتقل شد: سنجش آمادگی برای کتاب بعدی به بانک سؤال کالیبره‌شده نیاز داره.

### نتیجه

```text
Overall: 78%   ·   Vocabulary 88%   ·   Grammar 69%   ·   Collocations 81%   ·   Word Formation 72%
+ لیست سؤال‌ها (درست/غلط، جواب درست، توضیح)
+ Mistakeهای جدید
+ پیشنهاد: «یک Practice روی Reported Speech»
```

---

## ۱۵. استراتژی Spaced Repetition

**الگوریتم:** FSRS (کتابخانه‌ی `ts-fsrs`)، `desiredRetention = 0.9` (قابل تنظیم).

**واحد زمان‌بندی:** هر `UserItemState` (کاربر × آیتم). در آینده می‌تونه به facet (recognition/production) تقسیم بشه.

### نگاشت پاسخ به Rating

| وضعیت | Rating |
|---|---|
| غلط | Again (1) |
| درست با hint، یا نیمه‌درست (score 0.5 تا 0.8)، یا خیلی کند | Hard (2) |
| درست | Good (3) |
| درست، سریع، در سطح CONTEXT یا بالاتر | Easy (4) |

### قوانین

- **فقط اولین پاسخ هر آیتم در هر روز** (با timezone کاربر) FSRS رو به‌روز می‌کنه. پاسخ‌های بعدی همون روز فقط روی mastery و EWMA اثر دارن. این از به‌هم‌ریختن زمان‌بندی جلوگیری می‌کنه.
- Quiz و Exam هم review حساب می‌شن.
- تعداد مرورهای سررسیده بیشتر از ظرفیت session: اولویت با کمترین retrievability.
- هر review در `ReviewLog` ثبت می‌شه تا بعداً پارامترهای FSRS برای کاربر بهینه بشه.

### وضعیت‌ها

| Status | شرط |
|---|---|
| NEW | `reps = 0` |
| LEARNING | FSRS state = Learning/Relearning، یا `stability < 3` روز |
| REVIEW | بقیه‌ی موارد |
| MASTERED | `mastery ≥ 0.85` و `stability ≥ 21` روز و `highestLevelPassed ≥ CONTEXT` |
| **isWeak** (flag) | ≥ ۳ lapse در ۳۰ روز، یا (`reps ≥ 3` و `accuracyEwma < 0.6`)، یا Mistake فعال با اولویت بالا |

---

## ۱۶. محاسبه‌ی Mastery

### Mastery هر آیتم (0 تا 1)

```text
memory     = min(1, stability / 30)                 // ۳۰ روز ثبات = کامل
accuracy   = accuracyEwma                            // α = 0.3، وزن بیشتر برای سطوح بالاتر
levelScore = { RECOGNITION: .25, RECALL: .5, CONTEXT: .75, PRODUCTION: 1 }[highestLevelPassed]
levelCap   = { RECOGNITION: .40, RECALL: .6, CONTEXT: .85, PRODUCTION: 1 }[highestLevelPassed]

mastery    = min(levelCap, 0.45·memory + 0.35·accuracy + 0.20·levelScore)
```

`levelCap` تضمین می‌کنه کسی که فقط تمرین تشخیصی رو درست زده، «Mastered» نشه.

### سختی تطبیقی

- **ارتقا:** ۳ پاسخ درست پشت‌سرهم در `currentLevel` (در Exam: ۲ پاسخ) → سطح بعدی
- **تنزل:** ۲ پاسخ غلط پشت‌سرهم → سطح قبلی + نمایش توضیح
- `highestLevelPassed` با اولین پاسخ درست در هر سطح به‌روز می‌شه

### تجمیع

| شاخص | فرمول |
|---|---|
| Skill Mastery | میانگین mastery آیتم‌های **دیده‌شده** (`reps ≥ 1`) اون skill در کتاب‌های فعال |
| Book Progress | `0.3 × (درس‌های شروع‌شده / کل درس‌ها) + 0.7 × میانگین mastery همه‌ی آیتم‌های کتاب` |
| Overall | میانگین وزنی skillهای **اندازه‌گیری‌شده** (Vocab .25، Grammar .25، Collocation .2، Word Formation .15، Expression .15) |

> Book Progress به ساختار کامل کتاب (unitها و درس‌ها) نیاز داره. یک seed برای ساختار AEF3 (فقط عنوان unit و درس‌ها) از روی ورودی شما ساخته می‌شه.

---

## ۱۷. تشخیص اشتباهات (Mistake Detection)

### Taxonomy اولیه (seed)

| Category | نمونه‌ی کدها |
|---|---|
| GRAMMAR | `TENSE_FORM`، `BACKSHIFT`، `WORD_ORDER`، `ARTICLE`، `PREPOSITION`، `AGREEMENT`، `REPORTING_VERB` (say/tell) |
| VERB | `V2_FORM`، `V3_FORM`، `AUXILIARY` |
| VOCAB | `MEANING`، `WRONG_COLLOCATE`، `CONFUSABLE` (fit/suit)، `REGISTER` |
| FORM | `WRONG_SUFFIX`، `WRONG_POS` |
| SPELLING | `SPELLING` |
| L1 | `PERSIAN_TRANSFER` (تداخل ساختار فارسی) |

### Pipeline (listener روی `attempt.evaluated`)

```text
1. errorCodes:  Rule → از distractorErrors / نوع فرمت
                AI   → از لیست مجاز taxonomy
2. signature = `${itemId ?? '*'}:${errorCode}`
3. upsert Mistake → occurrences++ ، lastSeenAt ، status=ACTIVE
4. insert MistakeOccurrence (userAnswer، expectedAnswer)
5. محاسبه‌ی دوباره‌ی priority
```

### اولویت

```text
priority = severity(1..3) × log2(1 + occurrences در ۳۰ روز) × decay(نیمه‌عمر ۱۴ روز)
HIGH  ⇐  ≥ ۳ تکرار در ۱۴ روز  (برچسب «تکراری» در UI)
```

### رفع اشتباه
- پاسخ درست روی همون signature در یک روز جدید → `correctDaysSince++`
- `correctDaysSince = 1` → IMPROVING
- `correctDaysSince ≥ 3` → RESOLVED + emit `mistake.resolved`
- تکرار دوباره → ACTIVE و `correctDaysSince = 0`

### تحلیل الگو با AI (هفتگی)
`MistakeAnalyzer` روی داده‌های تجمیع‌شده اجرا می‌شه و الگوهای بین آیتم‌ها رو پیدا می‌کنه (مثلاً «در جمله‌های reported همیشه backshift رو فراموش می‌کنی»). خروجی فقط **متن insight** در گزارش هفتگیه و داده‌ها رو تغییر نمی‌ده.

---

## ۱۸. محاسبه‌ی Progress

| داده | نحوه‌ی به‌روزرسانی |
|---|---|
| `DailyActivity` | upsert با هر attempt و session (همگام) |
| `ProgressSnapshot` | job روزانه (یا اولین درخواست روز جدید) |
| `WeeklyReport` | job شنبه‌ها (شروع هفته در تقویم ایرانی — قابل تنظیم) یا on-demand |

### تعریف آمارها

| آمار | تعریف |
|---|---|
| زمان مطالعه | جمع `activeSeconds` session و assessmentها (فاصله‌های بیکاری > ۲ دقیقه حذف) |
| کلمات یادگرفته | آیتم‌های VOCABULARY با `reps ≥ 1` |
| کلمات مسلط | آیتم‌های VOCABULARY با `status = MASTERED` |
| اشتباهات اصلاح‌شده | Mistakeهای RESOLVED |
| میانگین Quiz/Exam | میانگین `score` در بازه |
| Streak | بخش ۱۹ |

### گزارش هفتگی
- **داده‌ها** (قطعی): زمان، تعداد session، میانگین quiz، skillهای پیشرفت‌کرده/پس‌رفته (مقایسه‌ی snapshotها)، کلمات جدید، مسلط‌شده‌ها، تمرکز هفته‌ی بعد (از Learning Engine)
- **متن مربی** (AI، اختیاری): ۳ تا ۴ جمله‌ی انگیزشی و دقیق. اگه AI در دسترس نبود → template ثابت.

---

## ۱۹. معماری Gamification

### XP (ledger، idempotent)

| رویداد | XP |
|---|---|
| پاسخ درست | RECOGNITION 5 · RECALL 8 · CONTEXT 12 · PRODUCTION 15 |
| پاسخ غلط (تلاش) | 1 |
| درست شدن در Recovery | +3 |
| پایان session | 30 (بدون اشتباه: +20) |
| رسیدن به هدف روزانه | 20 |
| Quiz | `round(score × 50)` |
| Exam | `round(score × 100)` |
| رفع یک Mistake | 25 |
| Challenge | طبق تعریف |

**ضد farming:** هر تمرین روزی فقط یک بار XP می‌ده؛ تمرین آزاد خارج از برنامه ۵۰٪.

### Level
XP تجمعی لازم برای level n = `50 × n × (n + 1)` → L1: 100، L5: 1,500، L10: 5,500

### Streak
- یک روز حساب می‌شه اگه `goalMet` باشه: یک Daily Session کامل، یا زمان فعال ≥ هدف روزانه
- محاسبه با timezone کاربر
- **Streak Freeze:** به‌ازای هر ۷ روز streak یکی (حداکثر ۲)؛ خودکار مصرف می‌شه

### Achievements (rule-based)

```json
{ "code": "COLLOCATION_MASTER", "criteria": { "type": "items_mastered", "itemType": "COLLOCATION", "count": 25 } }
{ "code": "STREAK_30",          "criteria": { "type": "streak", "days": 30 } }
{ "code": "GRAMMAR_FIXER",      "criteria": { "type": "mistakes_resolved", "category": "GRAMMAR", "count": 10 } }
{ "code": "UNIT_CONQUEROR",     "criteria": { "type": "exam_score", "preset": "UNIT", "min": 0.85 } }
```

`AchievementEvaluator` روی رویدادها اجرا می‌شه، `progress` رو به‌روز می‌کنه و در صورت باز شدن، achievement در `rewards` پاسخ قرار می‌گیره.

### Challenges
- **Daily:** از قوی‌ترین weak area — «امروز ۳ collocation تجاری رو درست به کار ببر»
- **Weekly:** هدف حجمی/کیفی — «۵ session + quiz بالای ۸۰٪»
- **Boss Quiz:** Exam پایان unit با UI ویژه

---

## ۲۰. ساختار صفحات Frontend

```text
app/
├── (auth)/login/
├── (focus)/                         # تمام‌صفحه، بدون sidebar
│   ├── session/[id]/                # Daily Session Player
│   ├── quiz/[id]/
│   └── exam/[id]/
└── (app)/                           # با sidebar (دسکتاپ) / bottom nav (موبایل)
    ├── page.tsx                     # Dashboard
    ├── practice/                    # تمرین آزاد (بر اساس type / mistake / درس)
    ├── assessments/                 # لیست + ساخت quiz/exam
    │   ├── new/
    │   └── [id]/result/
    ├── library/                     # تب‌ها: vocabulary, collocations, grammar, …
    │   └── items/[id]/              # جزئیات + mastery + mistakes + history
    ├── mistakes/
    │   └── [id]/
    ├── teacher/
    │   ├── sessions/
    │   ├── sessions/[id]/
    │   ├── upload/
    │   └── materials/[id]/review/   # بررسی و تأیید پیش‌نویس AI
    ├── books/
    │   └── [id]/                    # ساختار unit/درس + پیشرفت
    ├── progress/
    │   └── reports/[week]/
    ├── achievements/
    └── profile/
```

**Search سراسری:** Command Palette با `Ctrl+K` روی همه‌ی صفحات.

---

## ۲۱. معماری Componentها

```text
apps/web/
├── components/
│   ├── ui/                      # wrapperهای HeroUI + design tokens
│   └── learning/                # ProgressRing، MasteryBadge، StreakFlame، XpCounter،
│                                # SkillBar، ItemChip، FaText (متن فارسی RTL)
├── features/
│   ├── dashboard/               # TodaySessionCard، WeakAreasCard، ReviewQueueCard
│   ├── session/                 # SessionPlayer، BlockIntro، SessionSummary
│   ├── exercises/
│   │   ├── shell/               # ExerciseShell، FeedbackPanel، WhyButton
│   │   ├── renderers/           # یک component برای هر format
│   │   └── registry.ts
│   ├── assessments/             # AssessmentPlayer، Timer، ResultBreakdown
│   ├── teacher/                 # UploadDropzone، IngestionStatus، DraftReviewEditor
│   ├── library/                 # ItemTable، ItemDetail، SearchPalette
│   ├── mistakes/                # MistakeCard، MistakeTimeline
│   ├── progress/                # charts، WeeklyReportView
│   └── gamification/            # RewardQueue، XpBurst، AchievementModal، LevelUpOverlay
└── lib/
    ├── api/                     # typed client + query keys
    └── motion/                  # presetهای انیمیشن مشترک
```

### زبان بصری
- **هر حالت یادگیری یک رنگ:** Vocabulary بنفش · Grammar آبی · Collocation فیروزه‌ای · Word Formation کهربایی · Review صورتی · Mistake نارنجی-قرمز
- Card-based، سلسله‌مراتب واضح، dark mode
- **RewardQueue:** پاداش‌های پاسخ API رو به‌ترتیب انیمیت می‌کنه (XP → streak → achievement)، تا روی هم نیفتن
- رعایت `prefers-reduced-motion`؛ صدا اختیاری و پیش‌فرض خاموش

---

## ۲۲. مدیریت State

| نوع state | ابزار | نکته |
|---|---|---|
| داده‌های سرور | TanStack Query | query key factory؛ invalidate بعد از mutation؛ برای جواب‌ها optimistic update نداریم (منبع حقیقت سرور است) |
| Session/Assessment Player | Zustand store | index فعلی، صف، تایمر، پاسخ‌های در انتظار؛ persist در `sessionStorage` برای refresh |
| فرم‌ها | react-hook-form + Zod | schemaها از contracts |
| فیلترها | URL (`nuqs`) | قابل bookmark |
| UI موقت | `useState` محلی | — |

**ادامه دادن session:** بعد از refresh، `GET /daily-sessions/today` وضعیت سرور رو برمی‌گردونه (آیتم‌های پاسخ‌داده‌شده) و store همگام می‌شه.

---

## ۲۳. مدیریت خطا

### Backend

```json
{
  "type": "https://errors.app/assessment-expired",
  "title": "Assessment time is over",
  "status": 409,
  "code": "ASSESSMENT_EXPIRED",
  "detail": "…",
  "traceId": "…"
}
```

- `DomainError(code, status)` → exception filter سراسری → problem+json
- خطای Zod → 400 با `errors[{path, message}]`
- **AI:** timeout + retry + یک repair → fallback (تمرین template / `evaluationPending` / نمایش جواب قطعی)
- **Jobها:** retry در pg-boss (۳ بار، backoff) → در صورت شکست نهایی، `TeacherMaterial.status = FAILED` با پیام قابل‌فهم + دکمه‌ی «تلاش دوباره»
- Logging: `nestjs-pino` با `requestId`

### Frontend
- `error.tsx` برای هر route group
- Toast برای خطای mutationها
- **ارسال جواب مقاوم:** هر attempt یک `clientAttemptId` (uuid) داره؛ در صورت قطع شبکه، صف retry. سرور idempotent است.
- Skeleton برای همه‌ی loadingها

---

## ۲۴. ملاحظات امنیتی

| مورد | اقدام |
|---|---|
| کلید API | فقط در `.env` سرور؛ هیچ متغیر `NEXT_PUBLIC_*` حاوی secret |
| Password | `argon2id` |
| توکن‌ها | cookie `httpOnly`؛ rotation؛ reuse detection |
| Rate limit | `@nestjs/throttler` — سخت‌گیرانه روی login و endpointهای AI |
| بودجه‌ی AI | سقف روزانه برای هر کاربر |
| فایل | magic bytes، سقف حجم، نام تصادفی، خارج از webroot، بدون اجرا |
| Validation | Zod روی همه‌ی ورودی‌ها |
| Isolation | `userId` فقط از توکن؛ اجباری در repositoryها؛ تست cross-user |
| نشت جواب | `solution` هرگز قبل از submit ارسال نمی‌شه |
| خروجی AI | رندر به‌صورت متن؛ markdown sanitize‌شده |
| Prompt injection | محتوای کاربر/معلم = داده، داخل delimiter |
| Headers | `helmet` |
| Dependencies | `pnpm audit` در CI |
| Backup | (لوکال) اسکریپت `pg_dump` + کپی پوشه‌ی `storage/` — داده‌های یادگیری ارزشمندن |

---

## ۲۵. استراتژی تست

| لایه | ابزار | چی تست می‌شه |
|---|---|---|
| Domain (خالص) | Vitest + `fast-check` | planner، rating mapping، mastery، mistake priority، XP، streak با timezone (property-based) |
| Contracts | Vitest | schema هر format با fixtureهای معتبر و نامعتبر |
| Integration (API) | Vitest + Postgres واقعی (Testcontainers) + `FakeLlmProvider` | flowها: commit draft، attempt → state/mistake/xp، assessment grading، isolation کاربرها |
| Frontend | Vitest + React Testing Library | renderer هر فرمت، ExerciseShell |
| E2E | Playwright | مسیر طلایی: login → یادداشت معلم → بررسی draft → commit → daily session → جواب غلط → دیدن mistake |
| AI Evals | اسکریپت جدا (خارج از CI) | کیفیت parser و generator روی نمونه‌های طلایی |

**قاعده:** هیچ تستی در CI به API واقعی AI متصل نمی‌شه.

---

## ۲۶. فازهای توسعه

### فاز ۰ — زیرساخت
- Monorepo (pnpm + Turborepo)، `packages/contracts`، `packages/domain`
- Docker Compose برای PostgreSQL
- NestJS: config، Prisma، logging، exception filter، Zod pipe
- Auth (کاربر seed‌شده، JWT + refresh)
- Next.js: layout، design tokens، فونت‌ها، proxy به API، صفحه‌ی login
- Lint، typecheck، test runner

**معیار پایان:** login کار می‌کنه و صفحه‌ی خالی dashboard با داده‌ی `/auth/me` نمایش داده می‌شه.

### فاز ۱ — کتاب و محتوا
- Catalog: Book/Unit/Lesson، Enrollment، درس فعلی
- Seed ساختار AEF3
- Content: CRUD برای LearningItem (همه‌ی typeها)، relations
- Library UI + جستجوی پایه + صفحه‌ی جزئیات آیتم

**معیار پایان:** کتاب و درس فعلی تنظیم شده؛ آیتم دستی اضافه و جستجو می‌شه. (معیار موفقیت PRD: ۱)

### فاز ۲ — ورود محتوای معلم
- Storage، آپلود و validation فایل
- pg-boss + jobهای extract/parse
- AI Gateway + OpenAI provider + Fake provider + AiRun
- Content Parser prompt + eval set اولیه
- UI بررسی و تأیید draft + commit

**معیار پایان:** یادداشت «Session 21» paste می‌شه → پیش‌نویس دسته‌بندی‌شده → تأیید → آیتم‌ها در Library. (معیار PRD: ۲، ۳، ۴)

### فاز ۳ — موتور تمرین
- Format registry برای ۸ فرمت اول
- Template generatorها
- AI generator + quality gate + pool filler job
- Format handlerها + ارزیابی rule-based + AI evaluator
- `POST /attempts` + ExerciseShell + rendererها + انیمیشن فیدبک

**معیار پایان:** هر آیتم از Library قابل تمرین در فرمت‌های مختلفه، با فیدبک فوری. (معیار PRD: ۶، ۷)

### فاز ۴ — حلقه‌ی یادگیری ⭐ نقطه‌ی عطف Vertical Slice
- UserItemState + FSRS + mastery + سختی تطبیقی
- Mistake taxonomy + pipeline + صفحه‌ی Mistakes
- Learning Engine (planner) + Daily Session (planner، player، summary)
- `DailyActivity` + streak پایه + XP پایه
- Dashboard واقعی

**معیار پایان:** هر روز با یک کلیک یک session شخصی‌سازی‌شده‌ی ۱۰ دقیقه‌ای شروع می‌شه که اشتباهات و مرورها رو در نظر می‌گیره. (معیار PRD: ۵، ۱۰، ۱۱، ۱۲، ۱۵، ۱۶)

### فاز ۵ — Quiz و Exam
- ماژول assessments، blueprint، presetها
- Player با تایمر، autosave، grading async
- صفحه‌ی نتیجه + review
- اثر روی mastery و mistakes

**معیار پایان:** (معیار PRD: ۸، ۹)

### فاز ۶ — Progress و Gamification کامل
- Snapshotها، صفحه‌ی Progress، نمودارها، Book Progress
- گزارش هفتگی (+ متن مربی AI)
- Level، achievements، challenges، Boss Quiz
- صیقل micro-interactionها

**معیار پایان:** (معیار PRD: ۱۳، ۱۴، ۱۷)

### فاز ۷ — پایدارسازی
- تست‌های E2E کامل، بهینه‌سازی performance
- اسکریپت backup/restore
- بازبینی امنیتی، تمیزکاری UX

---

## ۲۷. نقشه‌ی راه MVP

```text
 فاز ۰ ──► فاز ۱ ──► فاز ۲ ──► فاز ۳ ──► فاز ۴ ══► [قابل استفاده‌ی روزانه]
 زیرساخت    محتوا     معلم      تمرین     حلقه           │
                                                        ▼
                                          فاز ۵ ──► فاز ۶ ──► فاز ۷
                                          Quiz/Exam  Progress  پایدارسازی
                                                     Gamification
```

### خارج از MVP (طبق PRD + اصلاحات)
- Speaking/Listening/Pronunciation (فاز ۲ محصول)
- Roleplay متنی با AI Conversation Partner (اولین آیتم بعد از MVP)
- Level Assessment (به بانک سؤال کالیبره نیاز داره)
- فرمت‌های تصویری
- Teacher portal، پرداخت، اپ موبایل

---

## ۲۸. استراتژی مهاجرت به SaaS

### از روز اول آماده است
- `userId` روی همه‌ی داده‌های یادگیرنده؛ `ownerId` روی محتوا
- جدا بودن محتوا از وضعیت یادگیرنده (`UserItemState`)
- `Role` enum + RolesGuard
- JWT + refresh rotation
- `StorageDriver` و `LlmProvider` abstraction
- ثبت هزینه‌ی AI به ازای کاربر (`AiRun`)
- Timezone برای هر کاربر

### مراحل مهاجرت

| مرحله | کار |
|---|---|
| ۱. چندکاربره | ثبت‌نام باز، تأیید email، بازیابی رمز، OAuth (`AuthIdentity`) |
| ۲. زیرساخت | `S3Driver`، جدا کردن worker (همون کد، entrypoint جدا `main.worker.ts`)، Redis برای rate limit و cache |
| ۳. امنیت | Postgres RLS به‌عنوان لایه‌ی دوم، audit log |
| ۴. معلم | `Classroom`، `ClassroomMember`، `Assignment`؛ نقش TEACHER؛ داشبورد معلم |
| ۵. محتوا | کاتالوگ عمومی (`ownerId = null`) — فقط محتوای دارای مجوز؛ محتوای کتاب‌های ناشر user-owned می‌مونه |
| ۶. درآمد | Plan و Subscription؛ سهمیه‌ی AI بر اساس plan (از روی `AiRun`) |
| ۷. عملیات | OpenTelemetry، Sentry، export/delete داده‌های کاربر |

---

## پیوست — سؤال‌های باز برای فازهای بعد

1. ساختار کامل AEF3 (لیست unitها و درس‌ها) — برای seed فاز ۱ لازمه.
2. نمونه‌ی واقعی چند یادداشت معلم و یک فایل تمرین — برای eval set و تنظیم parser در فاز ۲.
3. روز شروع هفته برای گزارش هفتگی: شنبه (پیش‌فرض) یا دوشنبه؟
4. دسترسی به OpenAI API از محل اجرا: مستقیم یا از طریق proxy/gateway؟ (`OPENAI_BASE_URL`)
