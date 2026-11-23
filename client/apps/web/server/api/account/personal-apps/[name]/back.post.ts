import { backPersonalApp, personalAppParam } from "../../../../utils/personal-apps";

// The signed-in reader's app sent back to the version before the one in place (docs/web.md, 「Settings」, the personal
// apps section).
export default defineEventHandler(async (event): Promise<null> => {
  const name = personalAppParam(getRouterParam(event, "name"));

  await backPersonalApp(await signedInUser(event), name);

  return null;
});
