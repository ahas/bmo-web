import { readDesktopRelease } from "../../utils/desktop-release";

import type { DesktopReleaseRead } from "#shared/desktop-release";

// The desktop app's current release for the download page (docs/web.md, 「The desktop app's download page」), read by
// every signed-in login.
export default defineEventHandler(async (): Promise<DesktopReleaseRead> => ({ release: await readDesktopRelease() }));
