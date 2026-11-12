// A demo year to look around with: this year so far, made up but lifelike, with good and bad
// stretches, weekends that slip, and a habit added in spring. The same every time for a given day.

import { STARTER_HABITS } from "./habits";
import { dateRange, localToday, weekday } from "./dates";
import type { DayLog, Habit, YearFile } from "./types";

/** A small seeded random number generator (mulberry32), so the demo is the same on every device. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOTES = ["Travel day", "Ran a 10k!", "Sick, took it easy", "Family visit", "Long day at work", "Hiking trip", "Started a new book"];

/** What the demo downloads as. */
export const demoFileName = (year: number) => `habit-tracker-demo-${year}.json`;

export function demoYear(now = new Date()): YearFile {
  const today = localToday(now);
  const year = Number(today.slice(0, 4));
  const pick = (id: string) => STARTER_HABITS.find((h) => h.id === id)!;
  const habits: Habit[] = [
    pick("h_wake-up-early"), pick("h_meditation"), pick("h_workout"), pick("h_read"), pick("h_no-alcohol"),
    { ...pick("h_water"), from: `${year}-04-01` },
    pick("h_sleep-time"), pick("h_screen-time"),
  ];
  const chance: Record<string, number> = { "h_wake-up-early": 0.45, h_meditation: 0.85, h_workout: 0.6, h_read: 0.7, "h_no-alcohol": 0.85 };
  const random = rng(year);
  const days: DayLog[] = [];
  for (const date of dateRange(`${year}-01-01`, today)) {
    const weekend = weekday(date) === 0 || weekday(date) === 6;
    // Motivation drifts through the year, and weekends slip a little.
    const mood = 0.85 + 0.15 * Math.sin(Number(date.slice(5, 7)) + Number(date.slice(8)) / 9) - (weekend ? 0.1 : 0);
    const values: DayLog["values"] = {};
    for (const [id, p] of Object.entries(chance)) if (random() < p * mood) values[id] = true;
    if (date >= `${year}-04-01`) values.h_water = Math.max(0, Math.round(5 + random() * 5 * mood));
    values["h_sleep-time"] = Math.round(400 + random() * 110 + (weekend ? 25 : 0));
    values["h_screen-time"] = Math.round(220 + random() * 200 + (weekend ? 40 : 0));
    // Now and then a day isn't logged at all.
    if (random() < 0.03 && date !== today) continue;
    const day: DayLog = { date, values };
    if (random() < 0.04) day.note = NOTES[Math.floor(random() * NOTES.length)];
    days.push(day);
  }
  return { app: "habit-tracker", schema: 1, year, exportedAt: now.toISOString(), habits, days };
}
