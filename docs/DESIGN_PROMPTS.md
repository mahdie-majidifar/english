# راهنمای طراحی و پرامپت‌های صفحه‌به‌صفحه

> پرامپت‌ها انگلیسی نوشته شدن چون ابزارهای طراحی با انگلیسی بهتر کار می‌کنن.
> توضیحات این سند فارسیه.

---

## بخش ۱ — نکات کار با ابزار طراح

1. **اول Style‑tile:** پرامپت پایه (بخش ۲) رو بدید و یک صفحه‌ی نمایش رنگ‌ها، فونت‌ها، دکمه‌ها، کارت‌ها و progress barها بگیرید. تا این رو تأیید نکردید سراغ صفحه‌ها نرید.
2. **هر پرامپت صفحه با پرامپت پایه شروع بشه:** اگه ابزار حافظه‌ی پروژه داره (مثل project knowledge یا design system) پرامپت پایه رو اونجا ذخیره کنید. وگرنه هر بار اول پیام paste کنید.
3. **خروجی:** اگه ابزار اجازه می‌ده، **HTML/React + Tailwind** بخواید، نه فقط تصویر. چون من از روی کد و تصویر هر دو می‌تونم کار کنم، ولی کد دقیق‌تره.
4. **هر صفحه دو اندازه:** دسکتاپ (۱۴۴۰) و موبایل (۳۹۰).
5. **حالت‌ها رو جدا بخواید:** برای هر تمرین حداقل چهار حالت: پیش‌فرض، انتخاب‌شده، درست، غلط.
6. **ترتیب پیشنهادی:** دسته A و D اول، بعد بقیه به ترتیب نیاز.

---

## بخش ۱.۵ — نکات مخصوص Arena AI

> من از جزئیات دقیق قابلیت‌های Arena مطمئن نیستم. اگه چیزی با این توضیحات نخوند، بگید تا تنظیم کنم.

Arena معمولاً به هر پرامپت **یک صفحه‌ی تک‌فایلی** می‌ده و دو مدل رو کنار هم نشون می‌ده. بنابراین:

1. **هر پرامپت باید مستقل باشه:** حافظه‌ی پروژه نداریم، پس پرامپت پایه رو در هر پیام paste کنید. بعد پرامپت صفحه، بعد «پسوند Arena» (پایین).
2. **یک صفحه در هر پیام:** مثلاً D2 رو سه‌تا نکنید؛ هر فرمت (MC، Flashcard، Matching) رو جدا بخواید تا هر خروجی کامل و دقیق باشه.
3. **بین دو خروجی، بهترین رو انتخاب کنید** و بعد با پیام‌های بعدی (follow-up) اصلاحش کنید: «کارت‌ها رو گردتر کن»، «انیمیشن شیک‌تر».
4. **سازگاری رنگ‌ها و استایل بین صفحه‌ها:** چون هر خروجی مستقله، توکن‌های پرامپت پایه رو عیناً حفظ کنید. بعد از دریافت چند صفحه، من تفاوت‌ها رو یکدست می‌کنم.
5. **خروجی رو برام بفرستید:** کد HTML یا لینک یا اسکرین‌شات هر کدوم کافیه.

### پسوند Arena (به انتهای هر پرامپت اضافه کنید)

```text
OUTPUT FORMAT
- Produce ONE self-contained, fully working HTML file (HTML + CSS + JS inline). Use Tailwind via CDN and Google Fonts (Plus Jakarta Sans, Inter, Vazirmatn). No external images; draw illustrations with inline SVG or CSS shapes.
- Make it interactive with vanilla JS: real hover/press/selected states, working answer checking with sample data, the animations described above (CSS transitions/keyframes or the Web Animations API).
- Responsive: looks right at 1440px and 390px. Add a small toggle at the top-right to preview the desktop / mobile width.
- Use the exact color tokens and fonts from the design system above. Do not invent a different palette.
- Use realistic sample content (American English File 3, Unit 8B Business, Reported Speech), no lorem ipsum.
- Keep the code clean and componentized with clear class names, so it can be re-implemented in React + HeroUI.
```

---

## بخش ۲ — پرامپت پایه (Design System)

> این رو در ابتدای هر مکالمه بدید.

```text
You are designing a web app called "English Coach" (working name).

PRODUCT
A personalized English learning app for one adult Persian-speaking learner (level B1-B2) who studies with the American English File textbook and a private teacher. The app turns teacher notes into daily 10-minute practice sessions with interactive exercises, a mistake bank, spaced repetition, quizzes, exams, and progress tracking.
Audience: adult. Must NOT feel childish, like a school admin panel, like a generic SaaS dashboard, or like a ChatGPT clone.

DESIGN DIRECTION: "Playful-Mature Minimal"
- Minimal, airy, lots of whitespace, strong visual hierarchy, big confident typography.
- Cheerful and energetic through COLOR and MOTION, not through cartoon characters. No mascot. Use abstract geometric shapes, soft gradients and a small abstract "spark" glyph as the coach's symbol.
- Premium, modern, friendly. The feeling: "I want to open this and practice."
- Card-based layout. Every screen has one obvious primary action.

COLOR TOKENS (light mode)
- Background: #FAF8F5 (warm off-white). Surface/cards: #FFFFFF. Subtle fill: #F3F0EA. Border: #ECE8E1.
- Ink (text): #1B1B2F. Muted text: #6B6B80.
- Primary: #6C4DFF (violet-indigo). Primary hover: #5B3DF0. Primary soft: #EFEBFF.
- Success: #22C55E (soft: #E8F9EE). Error/mistake: #FF6B57 (soft: #FFEEEB). Warning/streak flame: #FF9F1C. XP gold: #F5B301.
- Each learning mode has a fixed accent color (used for icons, chips, card tints, progress):
  Vocabulary #7C5CFF violet · Grammar #2F80FF blue · Collocations #12B5A6 teal ·
  Word Formation #F5A524 amber · Expressions #F0568C rose · Irregular Verbs #8BC34A lime ·
  Mistakes #FF6B57 coral · Review #6C4DFF primary.
- Each accent has a soft tint (about 12% opacity) for backgrounds and a deeper shade for the pressed edge of buttons.

TYPOGRAPHY
- Headings: "Plus Jakarta Sans" 700-800. Body/UI: "Inter". Numbers: tabular figures.
- Persian text: "Vazirmatn", line-height 1.8, always in RTL blocks (dir="rtl") inside the LTR interface; slightly larger than English text.
- The UI language is English. Persian appears only in explanations, translations, hints and feedback.

SHAPE & DEPTH
- Radius: cards 24px, inputs 16px, buttons 16px, chips fully rounded.
- Primary buttons are "chunky": solid color with a 4px darker bottom edge that compresses (translateY) when pressed.
- Shadows: soft, slightly colored, never harsh. Hover lifts cards by 2-4px.
- Icons: Lucide, rounded 2px stroke.

MOTION (use Framer Motion style springs, 200-350ms)
- Correct answer: card pulses green, checkmark draws itself, small subtle confetti burst, "+8 XP" floats up.
- Wrong answer: gentle 2-cycle horizontal shake, coral tint, correction slides in from the bottom.
- Progress bars fill with eased animation; numbers count up.
- Streak flame flickers softly. Level-up and achievement unlock use a centered overlay with scale-in and light particles.
- Page and step transitions slide horizontally; lists stagger in.
- Respect prefers-reduced-motion. Motion must support learning, never distract.

LAYOUT
- Desktop 1440px: left sidebar navigation (icons + labels) and a centered content column. Mobile 390px: bottom tab bar.
- Focus screens (practice session, quiz, exam) are full-screen with no sidebar.
- Design both desktop and mobile for every screen.

PRODUCT UI, NOT A SHOWCASE (very important)
- Design real product screens, not a marketing/landing page or a design showcase. No hero slogans, no "section 01/02" labels, no explanatory design copy.
- On every practice screen the EXERCISE is the hero: it occupies the main area and is the first thing the eye lands on. Never place an exercise as a small section at the bottom of a long page.

EXERCISE CLARITY RULES (apply to every exercise screen)
1. Every exercise shows a clear INSTRUCTION line, verb-first and large, e.g. "Choose the best form.", "Match each word with its meaning.", "Put the words in the right order.", "Type the missing word." Persian helper text under it when useful.
2. Every exercise makes the HOW-TO obvious without reading a manual: tappable things look tappable (border, number badge, hover lift); the place where the answer goes is visually marked (gap, drop zone, input); a short helper line says exactly what to do ("Tap one word on each side to connect them.").
3. The first time a user meets a format, show a small dismissible "How this works" card with a 3-second looping mini-demo, and keep a "?" button to reopen it.
4. The primary button always explains itself: disabled label "Select an answer" / "Type your answer" -> enabled label "Check".
5. Feedback always answers three things: Was I right? What is the correct answer? Why (one short Persian explanation)?
6. Minimum text sizes: exercise question 24-28px, options/answers 18-20px, instruction 16-18px, helper/caption 14px. NOTHING below 12px anywhere. Persian text 18px+.

TECH CONTEXT
The design will be implemented in Next.js + Tailwind CSS + HeroUI. Use components that map well to HeroUI (Card, Button, Chip, Progress, Tabs, Modal, Input, Table, Tooltip, Avatar). If you output code, use React + Tailwind.

DELIVERABLE FOR THIS FIRST STEP
Create a one-page "style tile" showing: color palette with the learning-mode accents, type scale (English + Persian), buttons (primary, secondary, ghost, disabled, pressed), chips, cards, progress bars, a streak badge, an XP counter, an achievement badge, and a correct / wrong feedback bar example.
```

---

## دسته A — Shell اپ و Login (فاز ۰)

### A1. App Shell

```text
[paste the base design system]

Design the APP SHELL used by all non-focus screens.
Desktop: left sidebar (240px, collapsible to icons) with logo + coach spark, nav items: Home, Practice, Library, Mistakes, Teacher, Quizzes & Exams, Progress, Achievements, Profile. Active item uses a soft primary tint and a rounded indicator. At the bottom of the sidebar: a compact card showing streak flame + number and XP + level ring.
Top bar inside content: global search field ("Search any word, grammar or mistake…  Ctrl K") and an avatar.
Mobile: bottom tab bar with 5 tabs (Home, Practice, Library, Progress, Profile) and the center "Practice" tab slightly raised as a primary action; search is an icon in the top bar.
Also design the Ctrl+K command palette overlay: input on top, grouped results (Words, Grammar, Mistakes, Teacher sessions) with small colored type chips and a short preview line for each.
Show empty main area with a placeholder so I can see the shell clearly.
```

### A2. Login

```text
[paste the base design system]

Design the LOGIN page. The app is personal-use for now, so there is no sign-up link.
Split layout on desktop: left side a vibrant but minimal illustration made only of abstract geometric shapes in the learning-mode accent colors, with an animated floating card stack showing sample exercise snippets ("negotiate", "She said she had…"); right side a clean form (email, password, primary chunky "Sign in" button).
A short tagline in English: "Practice what you learned today." Mobile: stacked, illustration shrinks to a header.
Include error state (wrong password) and loading state.
```

---

## دسته B — Library و Book (فاز ۱)

### B1. Books & Book Detail

```text
[paste the base design system]

Design the BOOKS page and the BOOK DETAIL page.
Books page: a horizontal shelf of book cards (cover-like cards using generated abstract covers in distinct colors), each with title ("American English File 3"), CEFR chip, progress bar, and status ("Active" / "Not started"). One "Add book" dashed card.
Book detail: header with the book title, overall progress ring, "Current lesson" highlight card ("Unit 8 · 8B — Business") with a "Set as current" action. Below: a vertical unit list; each Unit is an expandable card showing its lessons (8A, 8B, 8C) as pills with small mastery rings and counts of words/grammar/collocations. The current lesson pill has a pulsing dot. Locked/not-started lessons are lighter.
Add a modal for "Add unit / lesson" with minimal fields.
```

### B2. Library

```text
[paste the base design system]

Design the LIBRARY page: browse all learned content.
Top: tabs with colored dots matching the learning-mode accents — Vocabulary, Collocations, Grammar, Expressions, Word Formation, Irregular Verbs, Word Distinctions.
Filter row: lesson selector, mastery status filter (New, Learning, Review, Weak, Mastered), source (Teacher / Book), sort.
Content: a grid of item cards for desktop (list on mobile). Each card: headword in large type, Persian meaning in Vazirmatn, small part-of-speech chip, a mastery badge (colored dot + label), and a tiny memory ring. "Weak" items get a subtle coral edge.
Include an empty state ("Add your first teacher session to fill this library") with a call to action, and a skeleton loading state.
```

### B3. Item Detail

```text
[paste the base design system]

Design the LEARNING ITEM DETAIL page (example item: the word "negotiate").
Hero card: headword, IPA, part of speech, English definition, Persian translation, mastery ring (0-100%) with status label.
Sections as cards: Examples; Collocations (chips such as "negotiate a discount", "negotiate a deal"); Word family (negotiation, negotiator); Related lesson & teacher session (links); My mistakes with this item (list with date and wrong vs correct answer, the wrong part highlighted in coral); Review history (small timeline or sparkline with next review date); Quiz history.
A sticky bottom action on mobile: "Practice this word" primary button.
```

---

## دسته C — معلم (فاز ۲)

### C1. Teacher Sessions & Upload

```text
[paste the base design system]

Design the TEACHER area.
1) Teacher sessions list: timeline of class sessions as cards (e.g., "Session 21 · Oct 5"), each showing counts of extracted items by type as colored mini-chips, and a status chip (Processing / Needs review / Committed / Failed).
2) Add new session screen with a large central card: three input modes as tabs — Paste text, Upload file (PDF / DOCX / image, drag & drop with dashed animated border), and Paste screenshot. Fields: session title, class date, related lesson. Primary button "Analyze with AI".
3) Processing state: a friendly stepper (Uploading → Reading → Understanding → Ready to review) with an animated progress and the coach spark pulsing.
```

### C2. Draft Review (مهم)

```text
[paste the base design system]

Design the AI DRAFT REVIEW screen — the user checks what the AI extracted from the teacher's notes before saving.
Layout on desktop: two columns. Left: the original teacher text (read-only, with the currently selected item highlighted inside it). Right: the extracted items grouped by type (Vocabulary, Collocations, Grammar, Word Formation, Expressions, Irregular Verbs, Word Distinctions, Exercises) as expandable sections with accent colors.
Each extracted item is a compact editable row/card: headword, meaning (EN/FA), type selector chip (changeable), a confidence indicator (high = green dot, low = amber with a "Check me" label), and actions: edit, delete, merge with existing item. Items already in the library show a "Already known" chip.
Sticky footer: "X items selected" and a primary "Save to library" button, plus "Discard".
Mobile: single column with the original text collapsed in an accordion at the top.
Also show a low-confidence state and an error state ("We couldn't read this image — try again").
```

---

## دسته D — پلیر تمرین ⭐ (فاز ۳، مهم‌ترین دسته)

### D1. Exercise Shell

```text
[paste the base design system]

Design the EXERCISE SHELL used by every exercise in the practice session, quiz and exam. This is the most important screen of the product.
Full-screen focus layout:
- Top: close (X) button, a segmented progress bar (one segment per exercise, completed ones filled with the primary color, current one pulsing), and on the right a small streak/XP chip.
- Center: the exercise card area (wide on desktop, full-width on mobile) with a small colored chip for the skill (e.g., "Grammar · Reported speech"), the instruction line, and the exercise body.
- Bottom: a fixed action bar with "Skip" (ghost) and a large chunky "Check" button (disabled until an answer exists). Show keyboard hints on desktop (1-4 choose, Enter check).
- Feedback bar: after checking, the bottom bar transforms into a tall feedback panel sliding up — green for correct ("Nice! +8 XP"), coral for wrong (shows the correct answer, a short Persian explanation, a "Why?" button, and a "Continue" button).
Show four states of the same sample exercise: default, answer selected, correct feedback, wrong feedback. Also a hint popover and a "report this exercise" menu.
Follow the EXERCISE CLARITY RULES strictly: the instruction line ("Choose the best form.") is large under the skill chip; the exercise fills the main area; the Check button label changes from "Select an answer" (disabled) to "Check"; add the dismissible "How this works" card with a small looping mini-demo and a "?" button to reopen it.
This is a product screen, not a showcase page: no hero text, no section labels, no marketing copy.
```

### D2. Multiple Choice + Flashcard + Matching

```text
[paste the base design system]
Use the same exercise shell as before. Design these exercise types, each with default / selected / correct / wrong states:

1) Multiple Choice (vocabulary): large prompt with the word "disposable income" and 4 big option cards laid out in a 2x2 grid on desktop, stacked on mobile. Each option has a number badge (1-4). Selected = primary border + lift. Correct = green fill with draw-on check; wrong = coral shake and the correct one is revealed in green.
2) Flashcard: a big card that flips in 3D. Front: English word + IPA + speaker icon. Back: meaning in Persian (Vazirmatn), example sentence, collocations. Under it four self-rating buttons: Again, Hard, Good, Easy, each in a distinct color with the next review interval shown ("10 min", "2 days", "6 days", "2 weeks").
3) Matching: two columns of 5 items each (English words left, Persian meanings right). Tap one on each side to connect: a smooth line or highlight pairs with a pastel color per pair. Correct pairs lock with a gentle pop; a wrong pair shakes and returns.
```

### D3. Fill in the Blank + Word Formation + Irregular Verbs

```text
[paste the base design system]
Same exercise shell. Design with all four states:

1) Fill in the blank: a sentence "She said that she ______ bought me a present." The blank is an inline input that expands as the user types. Below, optional word-bank chips (tap to fill the blank, the chip animates into the gap). Persian hint under the sentence in Vazirmatn.
2) Word Formation: show a base word "fail" in a central bubble with an arrow to a sentence that needs the noun form; user types or picks among suffix chips (-ure, -ion, -ment, -ity) that glow in amber. Correct result animates the word assembling from base + suffix (like tiles snapping together).
3) Irregular verbs: a row of three tiles: "wear → wore → worn" where one or two are blank. Tiles with accent lime. Typing fills the tile; correct tile flips with a small pop.
```

### D4. Distinction + Sentence Order + Error Correction

```text
[paste the base design system]
Same exercise shell. All four states:

1) Word Distinction (fit / suit / match / go with): a sentence with a gap and four colored word pills to pick from. After checking, a compact "Why this one?" card expands showing a one-line difference for every option in Persian with an English example.
2) Sentence Order: a pool of word tiles at the bottom and an answer line at the top. Tiles are draggable (and tappable); they animate into place with a springy motion; wrong order highlights the first misplaced tile in coral.
3) Error Correction: a sentence "She told me she didn't bought a present." where the user taps the wrong word (it highlights), then types the correction. Feedback shows the diff: wrong part struck-through in coral, correction in green.
```

### D5. Transformation + Translation + Free Production (ارزیابی AI)

```text
[paste the base design system]
Same exercise shell. Design these open-ended exercises, including the AI-evaluation states:

1) Transformation: source sentence in a quoted card ("I didn't buy you a present," she said.) and an instruction chip "Change into reported speech". A textarea below with character-friendly styling.
2) Translation (Persian to English): the Persian sentence in a large RTL card (Vazirmatn) and an English textarea.
3) Free Production: a prompt ("Write a sentence using reported speech about your last meeting") with the target words shown as chips that light up automatically when the user types them.
AI-evaluation states for these: (a) "Checking your answer…" with a thinking animation of the coach spark, (b) result with a score ring, the user's answer with error spans highlighted in coral, a corrected version in green, 1-2 error tags (e.g., "Backshift", "V3 form") as small chips, and a short Persian explanation, (c) "Almost! small typo" amber state, (d) offline/timeout state: "We'll check this for you shortly" with a queued badge.
```

### D6. Reward Moments

```text
[paste the base design system]
Design the REWARD MOMENTS (animated overlays/toasts, show as storyboard frames):
1) XP gain toast "+8 XP" floating from the answer.
2) Streak extended: centered flame animation with the day count rolling up (e.g., 6 → 7).
3) Level up: full-screen soft overlay with a big level number, ring filling, subtle particles, "Level 5" and a Continue button.
4) Achievement unlocked: a badge card sliding in from the top ("Collocation Master — use 25 collocations correctly").
5) Mistake resolved: a small mature celebratory card "You fixed a recurring mistake: Reported speech backshift."
Keep it premium and restrained, not childish.
```

---

## دسته E — Dashboard، Session، Mistakes (فاز ۴)

### E1. Dashboard

```text
[paste the base design system]

Design the DASHBOARD (home screen). Greeting at top: "Good morning 👋" with the user's name.
Hero card (largest, primary gradient): "Today's session · 10 min", a segmented progress bar, a short line listing what is inside ("5 reviews · 3 new words · 1 grammar"), and a big chunky white "Continue learning →" button. A subtle animated background shape.
Below, a bento grid of cards:
- Current book & lesson ("American English File 3 · 8B — Business") with a small ring of progress.
- Streak card with flame and a 7-day mini calendar (completed days filled).
- XP & level card with a ring.
- Weak areas card: 2-3 items ("Reported Speech", "V3 forms") each with a coral mastery bar and a "Practice" button.
- Today's review: a few word chips ("negotiate", "disposable income", "fit / suit / match") and total due count.
- Daily challenge card: "Use 3 business collocations correctly" with 0/3 progress and XP reward.
- Recent achievement card.
- Overall progress card with a skill breakdown (small horizontal bars).
Show a "session completed today" variant of the hero card, and a first-time empty state ("Add your first teacher session").
```

### E2. Session Start & Summary

```text
[paste the base design system]

Design two screens of the daily practice session around the exercise shell:
1) Session start/intro: full-screen centered card "Your 10-minute session", a vertical or horizontal preview of the blocks (Warm-up, New words, Practice, Context, Review) with accent-colored dots and a one-line reason for the plan: "Because you missed 'reported speech' yesterday." Big "Start" button.
2) Block transition: a small interstitial between blocks ("Grammar · Reported speech") with a color wash of the block's accent for ~1 second.
3) Session summary: confetti-light celebration, large score ring, XP earned counting up, streak update, accuracy, time, a list of "Words you practiced" (chips colored by mastery change with up/down arrows), "Mistakes to review" (coral cards) and two buttons: "Practice mistakes now" and "Done".
```

### E3. Mistake Bank

```text
[paste the base design system]

Design the MISTAKE BANK page and the MISTAKE DETAIL.
List page: header with total active mistakes and a primary "Practice mistakes" button. Filters (status: Active / Improving / Resolved; category: Grammar, Verb forms, Vocabulary, Spelling). Mistake cards show: topic chip with accent color, the wrong answer with the wrong part highlighted in coral, the correct answer in green, an "Repeated ×4" badge and a priority indicator (High/Med/Low), last seen date. Status "Improving" shows a small progress of 3 correct days.
Detail: the error pattern title (e.g., "Backshift in reported speech"), a short Persian explanation, a timeline of all occurrences (user answer vs correct), a related lesson link, and a "Practice this" button.
Include an empty state celebrating "No active mistakes".
```

### E4. Practice (تمرین آزاد)

```text
[paste the base design system]

Design the free PRACTICE page: choose what to practice outside the daily session.
A grid of large colorful mode cards (each with its accent color, an icon and counts): Vocabulary, Collocations, Grammar, Word Formation, Irregular Verbs, Mistakes, Due reviews, Current lesson. A "Custom practice" card opens a bottom sheet (or modal) with options: topic, number of exercises, difficulty (Easy / Medium / Hard / Production).
```

---

## دسته F — Quiz/Exam، Progress، بقیه (فاز ۵ و ۶)

### F1. Create Quiz/Exam

```text
[paste the base design system]

Design the ASSESSMENTS page and the "Create quiz / exam" flow.
Assessments page: two tabs, Quizzes and Exams, a list of past attempts as cards with score ring, date, scope; recommended card on top ("Recommended: Unit 8 quiz — you've seen 70% of the words").
Create flow: a stepper in a single screen. Step 1 choose a preset with icon cards: Lesson quiz, Unit quiz, Weak areas quiz, Teacher session quiz, Grammar exam, Vocabulary exam, Weekly exam, Monthly exam. Step 2 customize: question count slider, time limit, difficulty, skill mix as sliders or a stacked bar ("Vocabulary 4 · Grammar 4 · Collocations 3 · Word Formation 2 · Context 2"). Step 3 summary and a chunky "Start" button.
Exams use a slightly more serious look (deeper ink-colored accents), quizzes a more playful look.
```

### F2. Quiz/Exam Player & Result

```text
[paste the base design system]

Design the QUIZ / EXAM PLAYER (based on the exercise shell) and the RESULT page.
Player additions: a visible timer ring/countdown at the top with a calming-to-urgent color shift in the last minute; a question navigator drawer (numbered dots: answered, flagged, unanswered); in exam mode there is no instant feedback, so the bottom button is "Next" and a "Flag" action exists. A confirm modal before submitting listing unanswered questions.
Result page: celebratory but mature. A big score ring (e.g., 78%), pass/improve message, a skill breakdown with bars (Vocabulary 88, Grammar 69, Collocations 81, Word Formation 72), the number of correct/incorrect, a "Review answers" accordion list (each question: your answer vs correct, explanation in Persian), "New mistakes added" section, a recommended next step card, and XP earned. Include a "Boss Quiz" variant with a dramatic dark-violet hero.
```

### F3. Progress

```text
[paste the base design system]

Design the PROGRESS page.
Top: overall English progress ring (72%) with a short motivating line. Sections as cards:
- Skill progress (horizontal bars per skill with their accent colors, with a small delta vs last week).
- Book progress (American English File 3 at 80%, AEF 4 at 20%, AEF 5 "Not started" as a dimmed card).
- Learning history chart with a toggle Week / Month / All time (study minutes as soft bars, accuracy as a line).
- Study statistics grid: total study time, sessions, average quiz score, average exam score, words learned, words mastered, mistakes corrected, current streak, longest streak.
- Strong areas and Weak areas side by side (green vs coral).
- An activity heatmap calendar of study days.
```

### F4. Weekly Report

```text
[paste the base design system]

Design the WEEKLY REPORT as a visually engaging, shareable-looking page (story-like vertical cards).
Sections: "Your week" header with date range; Study time + Sessions as two big number cards; Average quiz score with a delta arrow; "Improved" (green chips: Vocabulary, Collocations) and "Needs work" (amber/coral chips: Reported Speech, V3 forms); New words 24 / Mastered 17 as a two-ring card; a short "Coach note" card with the coach spark (2-3 friendly, precise sentences); "Next week focus" numbered list with 3 items and a "Start with #1" button.
```

### F5. Achievements & Profile

```text
[paste the base design system]

1) Achievements page: grid of badge cards (unlocked colorful with date; locked as grayscale silhouettes with a progress bar and criteria text). Group by category (Consistency, Mastery, Exams, Mistakes). Highlight "Recently unlocked". Badges are refined emblem-style (shield / hex shapes in the accent colors), not cartoonish.
2) Profile page: a "learning identity" page, not settings. Hero: avatar, name, English level (B1+), level ring and XP, streak. Cards: Learning goal, Daily target and preferred session length (editable inline with sliders / segmented control), current book & lesson, top achievements, key statistics. A separate small "Settings" section at the bottom: timezone, notifications, theme.
```

---

## چک‌لیست بعد از دریافت طراحی‌ها

وقتی پروتوتایپ یا خروجی رو برام فرستادید، این موارد رو چک می‌کنم و اگه جایی با پلن فنی نمی‌خوند اطلاع می‌دم:

- هر فرمت تمرین با حالت‌های خودش در طراحی هست؟
- فیلدهای نمایش‌داده‌شده با دیتابیس و API می‌خونن؟ (مثلاً چیزی نمایش داده شده که ما ذخیره نمی‌کنیم)
- Stateهای خالی، loading و خطا طراحی شدن؟
- بخش فارسی همه‌جا RTL و با فونت درسته؟
- انیمیشن‌ها قابل‌پیاده‌سازی با `motion` و HeroUI هستن؟
