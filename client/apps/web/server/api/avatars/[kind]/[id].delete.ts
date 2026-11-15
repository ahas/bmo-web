import { dropPicture } from "../../../utils/pictures";

// The console's picture of a room, a person or an agent dropped, so the provider's stands again, for the
// administrator (docs/web.md, 「Profile photos」).
export default defineEventHandler(async (event) => await dropPicture(event));
