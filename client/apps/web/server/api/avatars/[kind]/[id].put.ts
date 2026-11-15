import { setPicture } from "../../../utils/pictures";

// A picture set in the console for a room, a person or an agent, for the administrator (docs/web.md, 「Profile
// photos」).
export default defineEventHandler(async (event) => await setPicture(event));
