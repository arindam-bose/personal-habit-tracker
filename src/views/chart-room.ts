// How much room a chart leaves at its right for a level line named past its end, apart from
// chart.tsx so the tests can reach it without a browser.

/** The least room: enough for "Average" over "54.7", or "Goal" over "≥ 7:30". */
const MIN_ROOM = 56;

/**
 * The room for a name drawn outside the plot, in pixels: its longest line at the label's 11px, at
 * about 6.2px a character, plus the gap ECharts leaves after the line. A goal like "≥ 100,000" needs
 * more than the usual room, or its last digits run off the chart.
 */
export function outsideLabelRoom(name: string): number {
  const longest = Math.max(...name.split("\n").map((line) => line.length));
  return Math.max(MIN_ROOM, Math.ceil(longest * 6.2) + 12);
}
