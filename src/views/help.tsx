// A round ? that shows a description on hover or focus: in a card's top right corner (CardTitle),
// or on its own, at the end of a row of controls (Help).
// The same as the Money Tracker's.

import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";

/**
 * The ? and its tip. The tip is drawn by CSS on hover and on focus, so a keyboard (Tab), a click
 * or a tap shows it too; Esc, or a tap elsewhere, hides it again. Screen readers hear it as the button's description.
 */
export function Help(props: { label: string; children: ComponentChildren }) {
  const id = useId();
  return (
    <span class="help">
      <button type="button" class="help-btn" aria-label={props.label} aria-describedby={id}
        // Safari doesn't focus a button it clicks or taps, and the tip shows on focus: focus it here.
        onClick={(e) => e.currentTarget.focus()}
        onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}>?</button>
      <span class="help-tip" role="tooltip" id={id}>{props.children}</span>
    </span>
  );
}

/** A card's title, with the ? in the card's top right corner. */
export function CardTitle(props: { title: ComponentChildren; children: ComponentChildren }) {
  return (
    <div class="card-title">
      <h3>{props.title}</h3>
      <span class="card-help"><Help label="About this card">{props.children}</Help></span>
    </div>
  );
}

