import { deleteSkill, skillParam } from "../../../utils/personal-skills";

// One of the signed-in reader's own skills deleted, and every attachment of it (docs/web.md, 「Settings」, the skills
// section).
export default defineEventHandler(async (event): Promise<null> => {
  const name = skillParam(getRouterParam(event, "name"));

  await deleteSkill(await signedInUser(event), name);

  return null;
});
