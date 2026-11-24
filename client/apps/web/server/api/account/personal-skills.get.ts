import { ownSkills } from "../../utils/personal-skills";

import type { PersonalSkills } from "#shared/personal-skills";

// The signed-in reader's skills, own and installed (docs/web.md, 「Settings」, the skills section).
export default defineEventHandler(async (event): Promise<PersonalSkills> => await ownSkills(await signedInUser(event)));
