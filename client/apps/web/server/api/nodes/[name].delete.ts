// A node taken off the monitor by the administrator (docs/web.md, 「Monitor screen」): with `leave`, a hub node's agent is
// sent a leave first, so it uninstalls itself and departs; the node service's refusal, as a leave its hub did not take,
// comes back as it said it.
export default defineEventHandler(async (event): Promise<null> => {
  await requireAdministrator(event);

  const name = getRouterParam(event, "name", { decode: true }) ?? "";
  const leave = getQuery(event).leave === "true";

  await removeNode(name, leave);
  setResponseStatus(event, 204);

  return null;
});
