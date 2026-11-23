import { deletePersonalApp, personalAppParam } from "../../../utils/personal-apps";

// The signed-in reader's app deleted at home and on their PC; its source and data stay on the PC (docs/web.md,
// 「Settings」, the personal apps section).
export default defineEventHandler(async (event): Promise<null> => {
  const name = personalAppParam(getRouterParam(event, "name"));

  await deletePersonalApp(await signedInUser(event), name);

  return null;
});
