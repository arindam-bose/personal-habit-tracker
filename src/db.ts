// IndexedDB storage. Everything lives in the user's browser; the JSON export is the real backup.
//
// Stores:
//   years      one YearSetup per year (habits, start day, closed, change times), keyed by year
//   days       one DayLog per logged day, keyed by [year, date]
//   settings   app-wide values (the open year, the first day of the week), keyed by name

import type { DayLog, YearFile, YearSetup } from "./types";

const DB_NAME = "habit-tracker";
const DB_VERSION = 1;

/** Everything stored for one year. */
export interface YearData {
  setup: YearSetup;
  /** Oldest first. */
  days: DayLog[];
}

/** App-wide settings and their types. */
export interface Settings {
  /** The year the app opens to. */
  activeYear: number;
  /** 1 for Monday, 0 for Sunday. */
  weekStart: 0 | 1;
}

type Stored = DayLog & { year: number };

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Resolves once every write in the transaction is committed. */
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

/** All keys [year, <any date>]. Arrays sort after strings, so [year, []] is above every [year, "date"]. */
function yearRange(year: number): IDBKeyRange {
  return IDBKeyRange.bound([year], [year, []]);
}

function unstore({ year: _year, ...day }: Stored): DayLog {
  return day;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("years", { keyPath: "year" });
      db.createObjectStore("days", { keyPath: ["year", "date"] });
      db.createObjectStore("settings");
    };
    req.onsuccess = () => {
      const db = req.result;
      // If a newer version of the app opens in another tab, step aside so it can upgrade.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Close other Habit Tracker tabs and reload."));
  });
  return dbPromise;
}

/** For tests: forget the open connection so the next call opens a fresh one. */
export async function closeDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

/** Every stored year, oldest first. */
export async function listYears(): Promise<YearSetup[]> {
  const db = await openDb();
  return request(db.transaction("years").objectStore("years").getAll() as IDBRequest<YearSetup[]>);
}

export async function loadYear(year: number): Promise<YearData | null> {
  const db = await openDb();
  const tx = db.transaction(["years", "days"]);
  const [setup, rows] = await Promise.all([
    request(tx.objectStore("years").get(year) as IDBRequest<YearSetup | undefined>),
    request(tx.objectStore("days").getAll(yearRange(year)) as IDBRequest<Stored[]>),
  ]);
  return setup ? { setup, days: rows.map(unstore) } : null;
}

/** How many days each stored year has logged, by year. */
export async function dayCounts(): Promise<Map<number, number>> {
  const db = await openDb();
  const keys = await request(db.transaction("days").objectStore("days").getAllKeys() as unknown as IDBRequest<[number, string][]>);
  const counts = new Map<number, number>();
  for (const [year] of keys) counts.set(year, (counts.get(year) ?? 0) + 1);
  return counts;
}

/** The setup part of a year file. */
export function setupOf(file: YearFile, extra: Pick<YearSetup, "lastBackupAt"> = {}): YearSetup {
  return {
    year: file.year,
    ...(file.start ? { start: file.start } : {}),
    ...(file.closed ? { closed: true } : {}),
    habits: file.habits,
    ...(file.streaksIn ? { streaksIn: file.streaksIn } : {}),
    ...(file.lastChangedAt ? { lastChangedAt: file.lastChangedAt } : {}),
    ...(file.setupChangedAt ? { setupChangedAt: file.setupChangedAt } : {}),
    ...extra,
  };
}

/**
 * Store a whole year from an imported file, replacing anything already stored for it.
 * One transaction: if anything fails, the old data is left untouched.
 */
export async function replaceYear(file: YearFile, extra: Pick<YearSetup, "lastBackupAt"> = {}): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["years", "days"], "readwrite");
  tx.objectStore("years").put(setupOf(file, extra));
  const days = tx.objectStore("days");
  days.delete(yearRange(file.year));
  for (const day of file.days) days.put({ ...day, year: file.year });
  await committed(tx);
}

export async function deleteYear(year: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["years", "days"], "readwrite");
  tx.objectStore("years").delete(year);
  tx.objectStore("days").delete(yearRange(year));
  await committed(tx);
}

/** Erase every year, every day and every setting, in one transaction. */
export async function eraseAll(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["years", "days", "settings"], "readwrite");
  for (const name of ["years", "days", "settings"]) tx.objectStore(name).clear();
  await committed(tx);
}

/**
 * A setup and some days in one transaction: all of it is saved, or none. A day in `remove`
 * (by date) is deleted: a day with nothing logged isn't kept.
 */
export async function putChange(setup: YearSetup, put: DayLog[] = [], remove: string[] = []): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["years", "days"], "readwrite");
  tx.objectStore("years").put(setup);
  const days = tx.objectStore("days");
  for (const date of remove) days.delete([setup.year, date]);
  for (const day of put) days.put({ ...day, year: setup.year });
  await committed(tx);
}

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K] | undefined> {
  const db = await openDb();
  return request(db.transaction("settings").objectStore("settings").get(key) as IDBRequest<Settings[K] | undefined>);
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("settings", "readwrite");
  tx.objectStore("settings").put(value, key);
  await committed(tx);
}
