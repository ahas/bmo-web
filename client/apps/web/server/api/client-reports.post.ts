import { wording } from "#shared/wording";

// What a screen measured where its layout went wrong — today a bar at a screen's foot standing below what is
// visible — written as one line of the console's log, so a browser that covers it is measured the next time it does
// (docs/web.md, 「Layout fundamentals」). Only numbers of a known kind are taken; nothing is stored.
const NUMBERS = ["windowHeight", "visualHeight", "visualTop", "visualScale", "dynamicHeight", "footTop", "footBottom", "scrollY"] as const;

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const session = await requireUserSession(event);
  const body = await readBody<Record<string, unknown>>(event);

  if (body?.kind !== "foot-covered") throw fail(400, wording("common.error.bad_action"));

  const read = NUMBERS.map((name) => {
    const value = body[name];

    return `${name}=${typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : "-"}`;
  });
  const agent = (getRequestHeader(event, "user-agent") ?? "-").slice(0, 160);
  // The boxes around the bar, each a tag with its top and height, written as they came and cut to a short line.
  const boxes = Array.isArray(body.boxes) ? body.boxes.filter((one): one is string => typeof one === "string").slice(0, 8).map((one) => one.slice(0, 60).replace(/\s/g, "")) : [];

  console.info(`client report foot-covered by ${session.user?.name ?? "-"}: ${read.join(" ")} boxes=${boxes.join(",") || "-"} agent=${agent}`);

  return { ok: true };
});
