import type { NoticeSwitchesView } from "#shared/rest";

// The owner's private chat's notice switches (docs/web.md, 「Administration」, the providers tab; the receiver's
// `docs/api.md`, 「Notices」): the platform administrator's alone.
export default defineEventHandler(async (event): Promise<NoticeSwitchesView> => {
  await requireAdministrator(event);

  return await readNoticeSwitches();
});
