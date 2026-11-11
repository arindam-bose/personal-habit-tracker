#!/usr/bin/env python3
"""Convert a Notion "Habit Tracker" export folder into the habit-tracker JSON (schema 1).

Usage: python3 -I tools/notion_import.py <export_dir> <year> <out.json>

e.g.   python3 -I tools/notion_import.py data/notion/2026 2026 habit-tracker-2026.json

What it reads: the entries database ("Habits Tracker Entries 2026 ..._all.csv", or
"Habits Database 2025 ..._all.csv"), one row per day.

- Every Yes/No column is a check habit ("🧘 Meditation"), except Notion's own formula
  columns ("Sleep Time OK", "Screen Time OK", "Perfect Score OK").
- "💤 Sleep Time (hh:mm)" and "📱 Screen Time (hh:mm)" become time habits. Their goals come from
  Notion's own OK columns: Sleep Time's is at least the shortest sleep Notion called OK
  (7:30 in 2026, 8:00 in 2025), Screen Time's at most the longest screen time it called OK.
- Habits are ordered as in the database's main view (the plain CSV's header), and their ids come
  from their names ("h_meditation"), so the same habit in two years is matched up.
- Days with nothing ticked, no time and no note are left out: they score 0 either way.

Import both years into the tracker, then close the earlier one there: its streaks running on
December 31 carry into the later year.
"""
import csv, glob, json, os, re, sys
from datetime import datetime, timezone

SKIP = {"Tracking", "Date", "Day", "Display Date", "Month", "Relative Date", "Summary", "Week",
        "Perfect Score OK", "Sleep Time OK", "Screen Time OK"}
TIME_COLUMN = re.compile(r"\(hh:mm\)\s*$")


def slug(name):
    return "h_" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def split_emoji(column):
    """'🧘 Meditation' -> ('🧘', 'Meditation'); '❄️🚿 Cold Shower' -> ('❄️🚿', 'Cold Shower')."""
    text = TIME_COLUMN.sub("", column).strip()
    m = re.match(r"^([^A-Za-z0-9]*?)\s*([A-Za-z0-9].*)$", text)
    return (m.group(1).strip(), m.group(2).strip()) if m else ("", text)


def minutes(hhmm):
    hhmm = (hhmm or "").strip()
    if not hhmm:
        return None
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def find(export_dir, all_rows):
    suffix = "_all.csv" if all_rows else "[0-9a-f].csv"
    for pattern in ("*Entries*", "*Habits Database*"):
        hits = glob.glob(os.path.join(export_dir, "**", pattern + suffix), recursive=True)
        if hits:
            return hits[0]
    return None


def read(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def header(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return next(csv.reader(f), [])


def convert(export_dir, year):
    path = find(export_dir, True)
    if not path:
        sys.exit(f"No entries database (*Entries*_all.csv or *Habits Database*_all.csv) under {export_dir}")
    rows = [r for r in read(path) if r.get("Date", "").strip()]
    columns = list(rows[0].keys())
    view = find(export_dir, False)
    order = [c for c in (header(view) if view else []) if c in columns] or columns
    order += [c for c in columns if c not in order]

    habits, checks, times = [], [], []
    for col in order:
        if col.strip() in SKIP or "(mins)" in col or "Daily Progress" in col or "Notes" in col:
            continue
        if TIME_COLUMN.search(col):
            emoji, name = split_emoji(col)
            ok_col = f"{name} OK"
            values = [(minutes(r[col]), r.get(ok_col)) for r in rows]
            ok = [m for m, flag in values if m is not None and flag == "Yes"]
            if name.lower().startswith("sleep"):
                goal = {"op": "atLeast", "value": min(ok) if ok else 450}
            else:
                goal = {"op": "atMost", "value": max(ok) if ok else 360}
            habit = {"id": slug(name), "name": name, "emoji": emoji, "kind": "duration", "goal": goal}
            habits.append(habit)
            times.append((col, habit["id"]))
        elif all(r[col] in ("Yes", "No", "") for r in rows) and any(r[col] in ("Yes", "No") for r in rows):
            emoji, name = split_emoji(col)
            habit = {"id": slug(name), "name": name, "emoji": emoji, "kind": "check"}
            habits.append(habit)
            checks.append((col, habit["id"]))

    note_col = next((c for c in columns if "Notes" in c), None)
    days = []
    for r in rows:
        date = datetime.strptime(r["Date"].strip(), "%B %d, %Y").date()
        if date.year != year:
            continue
        values = {hid: True for col, hid in checks if r[col] == "Yes"}
        for col, hid in times:
            m = minutes(r[col])
            if m is not None:
                values[hid] = m
        note = (r.get(note_col) or "").strip() if note_col else ""
        if values or note:
            day = {"date": date.isoformat(), "values": values}
            if note:
                day["note"] = note
            days.append(day)
    days.sort(key=lambda d: d["date"])
    return {
        "app": "habit-tracker",
        "schema": 1,
        "year": year,
        "exportedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "habits": habits,
        "days": days,
    }


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    export_dir, year, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    data = convert(export_dir, year)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    names = ", ".join(f"{h['emoji']} {h['name']}".strip() for h in data["habits"])
    print(f"{year}: {len(data['habits'])} habits ({names}), {len(data['days'])} days logged -> {out}")


if __name__ == "__main__":
    main()
