// JSON import and export. The exported file is the real backup: it holds one whole year,
// in the same shape the importer and tools/notion_import.py produce.

import { getSetting, loadYear, putChange, replaceYear, setSetting } from "./db";
import { localToday } from "./dates";
import { detectDevice, type Device } from "./device";
import type { FileSettings, YearFile } from "./types";
import { validateYearFile, type ValidationResult } from "./validate";

/** Build the backup file for a stored year, or null if the year isn't stored. */
export async function exportYear(year: number, now = new Date()): Promise<YearFile | null> {
  const stored = await loadYear(year);
  if (!stored) return null;
  const { setup } = stored;
  const settings: FileSettings = {};
  const weekStart = await getSetting("weekStart");
  if (weekStart !== undefined) settings.weekStart = weekStart;
  return {
    app: "habit-tracker",
    schema: 1,
    year,
    ...(setup.start ? { start: setup.start } : {}),
    exportedAt: now.toISOString(),
    ...(setup.lastChangedAt ? { lastChangedAt: setup.lastChangedAt } : {}),
    ...(setup.setupChangedAt ? { setupChangedAt: setup.setupChangedAt } : {}),
    ...(setup.closed ? { closed: true } : {}),
    habits: setup.habits,
    days: [...stored.days].sort((a, b) => (a.date < b.date ? -1 : 1)),
    ...(setup.streaksIn ? { streaksIn: setup.streaksIn } : {}),
    ...(Object.keys(settings).length ? { settings } : {}),
  };
}

/**
 * Validate parsed JSON and, if it is a valid year file, store it, replacing that year.
 * The file being imported is itself a backup, so it counts as the last backup.
 * Its app-wide settings are used only where this device has none yet.
 */
export async function importYear(data: unknown): Promise<ValidationResult> {
  const result = validateYearFile(data);
  if (!result.ok) return result;
  const { file } = result;
  const exported = Date.parse(file.exportedAt);
  await replaceYear(file, Number.isNaN(exported) ? {} : { lastBackupAt: new Date(exported).toISOString() });
  const weekStart = file.settings?.weekStart;
  if ((weekStart === 0 || weekStart === 1) && (await getSetting("weekStart")) === undefined) await setSetting("weekStart", weekStart);
  return result;
}

/** Record that a year was just backed up, for the "last backup" reminder. */
export async function markBackedUp(year: number, at = new Date()): Promise<void> {
  const data = await loadYear(year);
  if (data) await putChange({ ...data.setup, lastBackupAt: at.toISOString() });
}

/**
 * "habit-tracker-2026_2026-11-11_21-30-05_chrome_linux.json": the year, then when the backup was
 * taken on the reader's own clock, then the browser and system, so backups from different devices
 * can be told apart. To the second, so two backups on one day never overwrite each other.
 */
export function backupFileName(year: number, at: Date, device: Device): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const time = `${two(at.getHours())}-${two(at.getMinutes())}-${two(at.getSeconds())}`;
  const names = [device.browser, device.system].filter((x): x is string => !!x).map((x) => x.toLowerCase().replace(/\s+/g, "-"));
  return [`habit-tracker-${year}`, localToday(at), time, ...names].join("_") + ".json";
}

/** Read a user-picked file as JSON. Throws a readable message if it isn't JSON. */
export async function readJsonFile(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error(`"${file.name}" is not a valid JSON file.`);
  }
}

/** Hand a year file to the browser to download under `name`. */
export function saveYearFile(file: YearFile, name: string): void {
  const blob = new Blob([JSON.stringify(file, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save a year file through the browser's download, then mark the year as backed up. */
export async function downloadYear(year: number): Promise<void> {
  const now = new Date();
  const file = await exportYear(year, now);
  if (!file) throw new Error(`There is no data for ${year}.`);
  saveYearFile(file, backupFileName(year, now, detectDevice()));
  await markBackedUp(year, now);
}
