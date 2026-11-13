// Which page an address opens: #/reports, or an old name for a page that moved.

/**
 * The page a hash names (without "#/"): one of `pages`, a renamed one's new name, or `fallback`.
 * Only the tables' own names count, so "toString" or "constructor" opens the fallback, not a crash.
 */
export function pageFor<P extends string>(name: string, pages: Record<P, unknown>, renamed: Record<string, P>, fallback: P): P {
  if (Object.hasOwn(pages, name)) return name as P;
  return Object.hasOwn(renamed, name) ? renamed[name]! : fallback;
}
