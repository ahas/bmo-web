import { appParam, appsFailure, recallApp } from "../../../../utils/apps";

// An app recalled: off everywhere at once under the platform's lock (docs/web.md, 「Administration」, the apps tab): the
// administrator's.
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await requireAdministrator(event);
  const app = appParam(getRouterParam(event, "app"));

  try {
    await recallApp(app, signed);

    return null;
  } catch (error) {
    throw appsFailure(error);
  }
});
