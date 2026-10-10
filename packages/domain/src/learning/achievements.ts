import type { AchievementIcon } from '@coach/contracts';

/** Everything an achievement can depend on. Gathered in one place, so adding one is adding a row. */
export interface AchievementStats {
  sessions: number;
  longestStreak: number;
  level: number;
  /** Items answered at least once. */
  itemsSeen: number;
  itemsMastered: number;
  mistakesResolved: number;
  quizzes: number;
  exams: number;
  /** Best score (0..1) of a quiz, or of an exam with at least 10 questions. Null when none. */
  bestQuiz: number | null;
  bestExam: number | null;
  /** Graded quizzes or exams of at least 5 questions with every answer right. */
  perfectTests: number;
  /** Boss quizzes beaten. */
  bossesWon: number;
  /** Daily and weekly challenges finished. */
  challengesDone: number;
}

export interface AchievementDef {
  code: string;
  title: string;
  description: string;
  icon: AchievementIcon;
  /** How far along the learner is, in the same unit as `target`. */
  value: (s: AchievementStats) => number;
  target: number;
}

const pct = (v: number | null) => Math.round((v ?? 0) * 100);

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { code: 'FIRST_SESSION', title: 'First steps', description: 'Finish your first daily session.', icon: 'footprints', value: (s) => s.sessions, target: 1 },
  { code: 'SESSIONS_10', title: 'Regular', description: 'Finish 10 daily sessions.', icon: 'footprints', value: (s) => s.sessions, target: 10 },
  { code: 'SESSIONS_50', title: 'Dedicated', description: 'Finish 50 daily sessions.', icon: 'award', value: (s) => s.sessions, target: 50 },
  { code: 'STREAK_3', title: 'On a roll', description: 'Practise 3 days in a row.', icon: 'flame', value: (s) => s.longestStreak, target: 3 },
  { code: 'STREAK_7', title: 'A full week', description: 'Practise 7 days in a row.', icon: 'flame', value: (s) => s.longestStreak, target: 7 },
  { code: 'STREAK_30', title: 'Unstoppable', description: 'Practise 30 days in a row.', icon: 'flame', value: (s) => s.longestStreak, target: 30 },
  { code: 'LEVEL_5', title: 'Level 5', description: 'Reach level 5.', icon: 'star', value: (s) => s.level, target: 5 },
  { code: 'LEVEL_10', title: 'Level 10', description: 'Reach level 10.', icon: 'star', value: (s) => s.level, target: 10 },
  { code: 'ITEMS_25', title: 'Word collector', description: 'Practise 25 different items.', icon: 'book', value: (s) => s.itemsSeen, target: 25 },
  { code: 'ITEMS_100', title: 'Walking dictionary', description: 'Practise 100 different items.', icon: 'book', value: (s) => s.itemsSeen, target: 100 },
  { code: 'MASTERED_10', title: 'It sticks', description: 'Master 10 items.', icon: 'target', value: (s) => s.itemsMastered, target: 10 },
  { code: 'MASTERED_50', title: 'Solid memory', description: 'Master 50 items.', icon: 'target', value: (s) => s.itemsMastered, target: 50 },
  { code: 'FIXER', title: 'Fixer', description: 'Turn 5 mistakes into things you know.', icon: 'flag', value: (s) => s.mistakesResolved, target: 5 },
  { code: 'FIRST_QUIZ', title: 'Quiz time', description: 'Finish your first quiz.', icon: 'zap', value: (s) => s.quizzes, target: 1 },
  { code: 'QUIZ_80', title: 'Sharp mind', description: 'Score 80% or more on a quiz.', icon: 'zap', value: (s) => pct(s.bestQuiz), target: 80 },
  { code: 'FIRST_EXAM', title: 'Exam taker', description: 'Finish your first exam.', icon: 'graduation', value: (s) => s.exams, target: 1 },
  { code: 'EXAM_85', title: 'Exam ace', description: 'Score 85% or more on an exam of 10 questions or more.', icon: 'trophy', value: (s) => pct(s.bestExam), target: 85 },
  { code: 'CHALLENGER', title: 'Challenger', description: 'Finish 5 daily or weekly challenges.', icon: 'target', value: (s) => s.challengesDone, target: 5 },
  { code: 'BOSS_SLAYER', title: 'Boss slayer', description: 'Beat a boss quiz.', icon: 'award', value: (s) => s.bossesWon, target: 1 },
  { code: 'BOSS_3', title: 'Unit conqueror', description: 'Beat 3 boss quizzes.', icon: 'trophy', value: (s) => s.bossesWon, target: 3 },
  { code: 'PERFECT', title: 'Flawless', description: 'Get every answer right in a quiz or exam.', icon: 'trophy', value: (s) => s.perfectTests, target: 1 },
];

export interface AchievementProgress {
  code: string;
  progress: number;
  target: number;
  done: boolean;
}

export function evaluateAchievements(stats: AchievementStats): AchievementProgress[] {
  return ACHIEVEMENTS.map((a) => {
    const value = Math.max(0, a.value(stats));
    return { code: a.code, progress: Math.min(value, a.target), target: a.target, done: value >= a.target };
  });
}

export const findAchievement = (code: string): AchievementDef | undefined => ACHIEVEMENTS.find((a) => a.code === code);
