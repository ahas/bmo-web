import { wording } from "#shared/wording";

import { fail } from "../../../utils/fail";
import { saveSkill, skillParam } from "../../../utils/personal-skills";

import type { SkillForm } from "#shared/personal-skills";

// One of the signed-in reader's own skills written from its form, made where none of that name stands, answered as
// it then reads (docs/web.md, 「Settings」, the skills section).
export default defineEventHandler(async (event): Promise<SkillForm> => {
  const name = skillParam(getRouterParam(event, "name"));
  const body = (await readBody<{ description?: unknown; body?: unknown }>(event)) ?? {};

  if (typeof body.description !== "string" || body.description.trim() === "" || typeof body.body !== "string") throw fail(400, wording("skills.error.description_empty"));

  return await saveSkill(await signedInUser(event), name, { description: body.description, body: body.body });
});
