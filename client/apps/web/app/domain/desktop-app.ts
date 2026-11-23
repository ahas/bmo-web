import type { Ref } from "vue";

// The desktop app's bridge (docs/web.md, 「The desktop app's window」): the app's commands the app grants the console's
// own address in its window, and nothing else. The console tells it runs in the app by the bridge answering alone; a
// browser has none, so nothing of the app is drawn there.

/** Who draws the window's controls: the console at its title bar's right end, or the system inset at the top left. */
export type WindowControls = "console" | "inset";

/** One of the app's switches as the app hands it over: its key and whether it is on. */
export interface DesktopSwitch {
  switch: string;
  on: boolean;
}

/** The app's settings as the bridge reads them. */
export interface DesktopSettings {
  switches: DesktopSwitch[];
  // Why the app cannot change its settings file, where it cannot.
  unreadable: string | null;
  windowControls: WindowControls;
}

/** What the console knows of the app it runs in, once the bridge answered. */
export interface DesktopApp {
  windowControls: WindowControls;
}

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

interface BridgeWindow {
  __TAURI_INTERNALS__?: { invoke?: Invoke };
}

/** The switches the console has words for (jake's docs/desktop.md, 「Settings」): each one's name and, where the name
 *  needs it, the muted line under it, by their keys in the language pack. */
export const DESKTOP_SWITCH_WORDS = {
  keepControlWhileLocked: { label: "desktop.label.keep_control_while_locked", hint: "desktop.message.keep_control_while_locked" },
  closeToTray: { label: "desktop.label.close_to_tray", hint: "desktop.message.close_to_tray" },
  startAtSignIn: { label: "desktop.label.start_at_sign_in", hint: null },
  startInTray: { label: "desktop.label.start_in_tray", hint: "desktop.message.start_in_tray" },
  keepAwake: { label: "desktop.label.keep_awake", hint: "desktop.message.keep_awake" }
} as const satisfies Record<string, { label: string; hint: string | null }>;

export type DesktopSwitchKey = keyof typeof DESKTOP_SWITCH_WORDS;

export function isKnownSwitch(key: string): key is DesktopSwitchKey {
  return Object.hasOwn(DESKTOP_SWITCH_WORDS, key);
}

// The bridge's one call, where a bridge stands in this page.
function bridge(): Invoke | null {
  if (typeof window === "undefined") return null;

  const invoke = (window as BridgeWindow).__TAURI_INTERNALS__?.invoke;

  return typeof invoke === "function" ? invoke : null;
}

function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = bridge();

  if (invoke === null) return Promise.reject(new Error("no desktop app bridge"));

  return invoke(command, args) as Promise<T>;
}

/** The app the console runs in, or nothing in a browser or before the bridge answered; read once per page. */
export function useDesktopApp(): Ref<DesktopApp | null> {
  return useState<DesktopApp | null>("desktop-app", () => null);
}

/** The app's settings, read through the bridge. */
export function readDesktopSettings(): Promise<DesktopSettings> {
  return call<DesktopSettings>("settings");
}

/** One setting changed through the bridge; the app's settings as they then stand. */
export function changeDesktopSetting(key: DesktopSwitchKey, on: boolean): Promise<DesktopSettings> {
  return call<DesktopSettings>("change_setting", { setting: key, on });
}

/** Asks the bridge whether the page stands in the app, and what the app says of its window; nothing where none answers. */
export async function probeDesktopApp(): Promise<DesktopApp | null> {
  if (bridge() === null) return null;

  try {
    const { windowControls } = await readDesktopSettings();

    return { windowControls: windowControls === "inset" ? "inset" : "console" };
  } catch {
    return null;
  }
}

/** The window's own commands the bridge grants for the frame the console draws. */
export const windowFrame = {
  minimize: (): Promise<void> => call("plugin:window|minimize"),
  toggleMaximize: (): Promise<void> => call("plugin:window|toggle_maximize"),
  close: (): Promise<void> => call("plugin:window|close"),
  isMaximized: (): Promise<boolean> => call("plugin:window|is_maximized"),
  title: (): Promise<string> => call("plugin:window|title")
};
