import { NOTICE_SWITCH_KINDS } from "#shared/rest";
import { wording } from "#shared/wording";

import type { NoticeSwitchesView, NoticeSwitchKind } from "#shared/rest";

// One of the owner's private chat's notice switches set (the receiver's `docs/api.md`, 「Notices」): `restart` or
// `rest`, by `on`. The answer is both switches as the receiver then holds them.
export default defineEventHandler(async (event): Promise<NoticeSwitchesView> => {
  await requireAdministrator(event);

  const kind = getRouterParam(event, "kind");
  const on = (await readBody<{ on?: unknown }>(event))?.on;

  if (!NOTICE_SWITCH_KINDS.includes(kind as NoticeSwitchKind) || typeof on !== "boolean") throw fail(400, wording("common.error.bad_action"));

  return await setNoticeSwitch(kind as NoticeSwitchKind, on);
});
