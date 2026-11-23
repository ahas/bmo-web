import { appParam, appsFailure, liftRecall } from "../../../../utils/apps";

// An app's recall lifted, so its publisher's declaration and every link below stand again (docs/web.md,
// 「Administration」, the apps tab): the administrator's.
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await requireAdministrator(event);
  const app = appParam(getRouterParam(event, "app"));

  try {
    await liftRecall(app, signed);

    return null;
  } catch (error) {
    throw appsFailure(error);
  }
});
