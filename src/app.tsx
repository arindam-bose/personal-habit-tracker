import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { ComponentType } from "preact";
import { version } from "../package.json";
import { chooseConsent, consentAsked, takeConsentOpener, type Consent } from "./analytics";
import { dateTime } from "./dates";
import { updateReady } from "./offline";
import { backupDue, backupText, lastUpdatedAt, requestPersistence } from "./storage";
import { backUpYear, current, loadSettings, openYear, persistState, years } from "./state";
import { HeatmapsView } from "./views/heatmaps";
import { DashboardView } from "./views/dashboard";
import { HabitsView } from "./views/habits";
import { useDismiss } from "./views/hooks";
import { Icon } from "./views/icons";
import { SettingsView } from "./views/settings";

/** Pages with charts pull in the charting library, so their code is only downloaded when first opened. */
function chartPage(load: () => Promise<ComponentType>): ComponentType {
  return function ChartPage() {
    const view = useSignal<ComponentType | null>(null);
    const failed = useSignal(false);
    useEffect(() => {
      // It can fail when a newer version replaced the files this tab was opened with: a reload fetches the current ones.
      load().then((v) => (view.value = v), () => (failed.value = true));
    }, []);
    const View = view.value;
    if (View) return <View />;
    return failed.value ? (
      <p class="muted">
        The charts couldn't load: this tab is running an older version of the tracker.{" "}
        <button type="button" class="link" onClick={() => location.reload()}>Reload</button>
      </p>
    ) : <p class="muted">Loading charts…</p>;
  };
}

/** Pages, by URL hash (#/reports). Hash links work on any static host with no server setup. */
const PAGES = {
  // The main page: today's log at the top, the year at a glance below it.
  dashboard: { label: "Dashboard", view: DashboardView },
  heatmaps: { label: "Heatmaps", view: HeatmapsView },
  reports: { label: "Reports", view: chartPage(() => import("./views/reports").then((m) => m.ReportsView)) },
  habits: { label: "Habits", view: HabitsView },
  // Only in the menu with two or more years.
  years: { label: "Over the years", view: chartPage(() => import("./views/years").then((m) => m.YearsView)) },
  settings: { label: "Settings", view: SettingsView },
} as const;
type Page = keyof typeof PAGES;

/** Old page names, so bookmarks made before a page moved still open the right one. */
const RENAMED: Record<string, Page> = { today: "dashboard", calendar: "heatmaps" };

function pageFromHash(): Page {
  const name = location.hash.replace(/^#\/?/, "");
  return name in PAGES ? (name as Page) : RENAMED[name] ?? "dashboard";
}

export function App() {
  const page = useSignal<Page>(pageFromHash());
  /** On a phone the page links fold into a menu, opened by ☰. */
  const menuOpen = useSignal(false);

  useEffect(() => {
    requestPersistence().then((s) => (persistState.value = s));
    openYear();
    loadSettings();
    const onHash = () => {
      page.value = pageFromHash();
      menuOpen.value = false;
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useDismiss(menuOpen, ".topbar nav, .menu-btn");

  const View = PAGES[page.value].view;
  /** Over the years covers every year, so the picker, Backup and the last-updated strip step aside there. */
  const allYears = page.value === "years" && years.value.length > 1;
  const setup = current.value?.setup;
  const backupReminder = setup && backupDue(setup, current.value!.days.length > 0) ? backupText(setup.lastBackupAt) : null;
  const updated = setup && lastUpdatedAt(setup);

  async function backUpNow() {
    if (!setup) return;
    try {
      await backUpYear(setup.year);
    } catch (err) {
      alert(`The backup didn't work: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <>
      <header class="topbar">
        <h1><a href="#/" class="home-link">Habit Tracker</a> <span class="version">v{version}</span></h1>
        <nav id="pages" class={menuOpen.value ? "open" : ""} onClick={(e) => (e.target as Element).closest("a") && (menuOpen.value = false)}>
          {(Object.keys(PAGES) as Page[]).filter((p) => p !== "years" || years.value.length > 1).map((p) => (
            <a href={`#/${p}`} class={p === page.value ? "active" : ""} aria-current={p === page.value ? "page" : undefined}>
              {PAGES[p].label}
            </a>
          ))}
        </nav>
        <div class="topbar-right">
          {updateReady.value && (
            <button type="button" class="backup-nag" onClick={() => location.reload()} title="A newer version is downloaded and ready.">
              <span class="long">v{updateReady.value} is ready · </span>Reload
            </button>
          )}
          {setup && !allYears && (
            <button type="button" class={`backup-btn ${backupReminder ? "backup-nag" : ""}`} onClick={backUpNow}
              aria-label={`${backupReminder ? `${backupReminder}. ` : ""}Back up ${setup.year}`}
              title={`${backupReminder ? `${backupReminder}. ` : ""}Downloads ${setup.year} as a JSON file. Your data lives only in this browser.`}>
              <Icon name="export" />
              {backupReminder && !updateReady.value && <span class="long">{backupReminder} · </span>}
              <span class="backup-label">Backup</span>
            </button>
          )}
          {allYears ? <span class="muted">All years</span> : years.value.length > 0 && (
            <select aria-label="Year" value={setup?.year} onChange={(e) => openYear(Number(e.currentTarget.value))}>
              {years.value.map((y) => <option value={y.setup.year}>{y.setup.year}</option>)}
            </select>
          )}
          <button type="button" class="menu-btn" aria-label="Pages" aria-controls="pages" aria-expanded={menuOpen.value}
            onClick={() => (menuOpen.value = !menuOpen.value)}>☰</button>
        </div>
      </header>
      {updated && !allYears && (
        <div class="status-strip">
          <p>Last updated {dateTime(updated)}</p>
        </div>
      )}
      <main>
        <View />
      </main>
      <footer class="footer">
        <p>
          © 2026 - Made with love by <a href="https://arindambose.com/" target="_blank" rel="noopener noreferrer">Arindam Bose</a>,
          powered by <a href="https://claude.ai/" target="_blank" rel="noopener noreferrer">Claude</a>
        </p>
        <p>Your log stays in this browser: nothing is uploaded, and it works offline.</p>
      </footer>
      {consentAsked.value && <ConsentBanner />}
    </>
  );
}

/** The cookie question: on first visit, and again from Cookie settings in the About card. */
function ConsentBanner() {
  const first = useRef<HTMLButtonElement>(null);
  /** Cookie settings, when it opened the banner: focus goes back there once answered. */
  const opener = useRef<HTMLElement | null>(null);
  // Opened from Cookie settings, focus follows it here; on a first visit it doesn't steal focus from the page.
  useEffect(() => {
    const from = takeConsentOpener();
    if (!from) return;
    opener.current = from;
    first.current?.focus();
  }, []);
  const answer = (value: Consent) => {
    chooseConsent(value);
    opener.current?.focus();
  };
  return (
    <section class="consent" aria-label="Cookie consent">
      <p class="consent-text">
        <strong>May we count your visit?</strong> Google Analytics would set cookies to count visits
        to this site. It never sees what you log in the tracker, and nothing loads unless you say yes.
        Every feature works either way, and you can change your mind any time under Cookie settings,
        in the tool's Settings.
      </p>
      <div class="consent-actions">
        <button type="button" ref={first} onClick={() => answer("denied")}>Decline</button>
        <button type="button" class="primary" onClick={() => answer("granted")}>Accept</button>
      </div>
    </section>
  );
}
