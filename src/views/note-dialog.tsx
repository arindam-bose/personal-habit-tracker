// A day's note in a dialog, for the Week view and the Notes page, and the reasons a day can't be changed.

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { longDate } from "../dates";
import { setNote, today } from "../state";
import type { IsoDate } from "../types";
import { Modal } from "./modal";

/** Why a day can't be logged, or null when it can. */
export function lockedReason(date: IsoDate, start: IsoDate, closed: boolean, year: number): string | null {
  if (closed) return `${year} is closed, so it can only be looked at. Reopen it on the Settings page to change it.`;
  if (date < start) return `Tracking starts on ${longDate(start)}.`;
  if (date > today.value) return "This day hasn't come yet.";
  return null;
}

/** Report a save that failed, in words. */
export function failed(err: unknown): void {
  alert(err instanceof Error ? err.message : String(err));
}
/**
 * A day's note, from the Week view or the Notes page: read it, or write and save it. Save (or Ctrl+Enter) keeps it;
 * Cancel, Esc or a click outside leaves it as it was. A day that can't be logged only shows it.
 */
export function NoteDialog(props: { date: IsoDate; note: string; locked: string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const text = useSignal(props.note);
  useEffect(() => {
    dialog.current?.showModal();
    // Writing is what it's for, so start in the box, after what's there.
    const el = box.current;
    if (el && !props.locked) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);
  function save() {
    const changed = text.value.trim() !== props.note;
    dialog.current?.close();
    if (changed) setNote(props.date, text.value).catch(failed);
  }
  return (
    <Modal dialogRef={dialog} title={`📝 ${longDate(props.date)}`} class="note-dialog" onClose={props.onClose}>
      {props.locked && <p class="muted small">{props.locked}</p>}
      <textarea ref={box} rows={5} value={text.value} disabled={!!props.locked} aria-label={`Note for ${longDate(props.date)}`}
        placeholder={props.locked ? "" : "Anything worth remembering about the day"}
        onInput={(e) => (text.value = e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          }
        }} />
      <div class="form-actions">
        {props.locked ? (
          <button type="button" onClick={() => dialog.current?.close()}>Close</button>
        ) : (
          <>
            <button type="button" onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="button" class="primary" onClick={save}>Save</button>
          </>
        )}
      </div>
    </Modal>
  );
}
