import { appParam, appWord, appsFailure, setOwnApp } from "../../../utils/apps";

// The signed-in reader's own word on an app: `on`, true or false, or null to follow their organisation (docs/web.md,
// 「Settings」, the own apps section). A lock above refuses it at the account service.
export default defineEventHandler(async (event): Promise<null> => {
  const app = appParam(getRouterParam(event, "app"));
  const body = await readBody<{ on?: unknown }>(event);

  try {
    await setOwnApp(await signedInUser(event), app, appWord(body?.on));

    return null;
  } catch (error) {
    throw appsFailure(error);
  }
});
