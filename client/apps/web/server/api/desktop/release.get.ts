import { readDesktopRelease } from "../../utils/desktop-release";

import type { DesktopReleaseRead } from "#shared/desktop-release";

// The desktop app's current release for the download page (docs/web.md, 「The desktop app's download page」), read with
// or without a session: the desktop app reads it to tell a BMO console before it keeps a server's address
// (docs/web.md, 「Access」).
export default defineEventHandler(async (): Promise<DesktopReleaseRead> => ({ release: await readDesktopRelease() }));
