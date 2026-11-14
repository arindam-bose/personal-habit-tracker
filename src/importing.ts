// Importing backup files: from Settings, the top bar's Import, or a file dropped on any page. One
// loop for all three, so each checks a file the same way and asks before replacing a stored year.

import { importYear, readJsonFile } from "./backup";
import { openYear, years, type YearSummary } from "./state";
import type { YearFile } from "./types";
import { validateYearFile } from "./validate";

/** Whether to replace a stored year with the file's: the answer comes from the "Replace?" dialog. */
export type AskReplace = (fileName: string, stored: YearSummary, file: YearFile) => Promise<boolean>;

export interface ImportOutcome {
  /** The years imported, in order, with how many days each has logged. */
  imported: { year: number; days: number }[];
  /** What went wrong, by file: its name, then each problem. */
  errors: string[];
}

/**
 * Import files one after another. A file that isn't a valid year changes nothing; a year already
 * stored is replaced only if `ask` says yes. The last year imported is opened.
 */
export async function importFiles(files: File[], ask: AskReplace): Promise<ImportOutcome> {
  const out: ImportOutcome = { imported: [], errors: [] };
  for (const f of files) {
    try {
      const data = await readJsonFile(f);
      const check = validateYearFile(data);
      if (!check.ok) {
        out.errors.push(`${f.name}:`, ...check.errors);
        continue;
      }
      // Read fresh each time: an earlier file in this import may have added the year.
      const stored = years.value.find((y) => y.setup.year === check.file.year);
      if (stored && !(await ask(f.name, stored, check.file))) continue;
      const r = await importYear(data);
      if (!r.ok) {
        out.errors.push(`${f.name}:`, ...r.errors);
        continue;
      }
      out.imported.push({ year: r.file.year, days: r.file.days.length });
      await openYear(r.file.year);
    } catch (err) {
      out.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return out;
}
