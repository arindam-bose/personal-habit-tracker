// Small hooks the views share.

import type { Signal } from "@preact/signals";
import { useEffect } from "preact/hooks";

/** Closes an open menu on Esc, or on a tap outside what `inside` selects. */
export function useDismiss(open: Signal<boolean>, inside: string) {
  useEffect(() => {
    if (!open.value) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest(inside)) open.value = false;
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open.value]);
}
