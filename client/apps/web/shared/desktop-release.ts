// The desktop app's current release as the download page reads it (docs/web.md, 「The desktop app's download
// page」): the release read jake publishes beside the app's builds (jake's docs/desktop.md, 「The read the console
// uses」), checked and handed on by the console's server.

/** One installer of a release: the platform and format it is for, and the file a person downloads and checks. */
export interface DesktopReleaseFile {
  platform: string;
  arch: string;
  format: string;
  file: string;
  size: number;
  sha256: string;
  url: string;
}

/** The channel a release stands on: a stable release, or a preview (an alpha, beta or release candidate). */
export type DesktopReleaseChannel = "stable" | "preview";

/** The current release: its version, when it was published, its installers, and the channel it stands on. */
export interface DesktopRelease {
  version: string;
  date: string;
  files: DesktopReleaseFile[];
  channel: DesktopReleaseChannel;
}

/** What the console's server answers the page with: the current release, or null where none is published. */
export interface DesktopReleaseRead {
  release: DesktopRelease | null;
}
