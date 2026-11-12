// Data model for one tracked year. Scores, streaks and reports are derived (see score.ts), never stored.

/** A calendar date as "YYYY-MM-DD". */
export type IsoDate = string;

/**
 * What a habit records each day:
 * - "check": done or not (Meditation, No smoking).
 * - "duration": a time in minutes, typed as h:mm (Sleep 7:45, Screen time 4:30).
 * - "number": a count (glasses of water, pages read).
 */
export type HabitKind = "check" | "duration" | "number";

/** A duration or number habit is met when the day's value is at least, or at most, the target. */
export interface Goal {
  op: "atLeast" | "atMost";
  /** Minutes for a duration, the count for a number. */
  value: number;
}

export interface Habit {
  /** Stable across years ("h_meditation"), so Over the years can follow a habit from year to year. */
  id: string;
  name: string;
  /** One emoji, shown before the name. May be empty. */
  emoji: string;
  kind: HabitKind;
  /** Duration and number habits only. */
  goal?: Goal;
  /** Number habits only: what is counted, e.g. "glasses". */
  unit?: string;
  /**
   * The first day the habit counts, for one added partway through the year. Left out, it counts
   * from the year's start. Days before it neither score it nor break its streak.
   */
  from?: IsoDate;
  /** The last day the habit counts, for one stopped partway through the year. Left out, to December 31. */
  to?: IsoDate;
}

/**
 * One day's log. A check habit done is `true`; a duration or number habit holds its value.
 * A habit left out of `values` wasn't done (or wasn't logged). A day with nothing is not stored.
 */
export interface DayLog {
  date: IsoDate;
  values: Record<string, true | number>;
  note?: string;
}

/** The JSON backup file for one year. It is also the shape the app imports. */
export interface YearFile {
  app: "habit-tracker";
  schema: 1;
  year: number;
  /** The day tracking began, for a year started partway through. Left out, it is January 1. */
  start?: IsoDate;
  exportedAt: string;
  /** When a day's log last changed (ISO timestamp). Left out until the first change. */
  lastChangedAt?: string;
  /** When the habits or the start day last changed (ISO timestamp). Left out until the first change. */
  setupChangedAt?: string;
  /** Set by "Close year"; a closed year is read-only. */
  closed?: boolean;
  /** In the order they are shown. */
  habits: Habit[];
  /** Oldest first. */
  days: DayLog[];
  /**
   * Streaks running on December 31 of the year before, carried in when that year was closed, so a
   * streak doesn't restart on January 1. By habit id; "perfect" is the perfect-day streak.
   */
  streaksIn?: Record<string, number>;
  /** App-wide settings at export time. Importing applies them only to a device that has none yet. */
  settings?: FileSettings;
}

/** The app-wide settings a backup carries, so a new device can be set up from it. */
export interface FileSettings {
  /** 1 for Monday, 0 for Sunday. */
  weekStart?: 0 | 1;
}

/** The parts of a YearFile that are set up once, not entered day to day. */
export type YearSetup = Pick<YearFile, "year" | "start" | "closed" | "habits" | "streaksIn" | "lastChangedAt" | "setupChangedAt"> & {
  /** When this year was last exported to JSON (ISO timestamp), for the backup reminder. */
  lastBackupAt?: string;
};
