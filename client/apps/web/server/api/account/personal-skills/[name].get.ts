import { ownSkill, skillParam } from "../../../utils/personal-skills";

import type { SkillForm } from "#shared/personal-skills";

// One of the signed-in reader's skills as its form reads it: the description, the body and the reference files
// (docs/web.md, 「Settings」, the skills section).
export default defineEventHandler(async (event): Promise<SkillForm> => {
  const name = skillParam(getRouterParam(event, "name"));

  return await ownSkill(await signedInUser(event), name);
});
