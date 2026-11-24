import { guideOpensFor } from "../../../utils/guides";

// Whether the start guide opens by itself for the signed-in reader (docs/web.md, 「The start guide」): a member whose own
// supply is required and holds none on, or the administrator whose flow stands neither finished nor put aside. The
// administrator's question reads the platform's sources; a member's reads their chain alone.
export default defineEventHandler(async (event): Promise<{ opens: boolean }> => {
  return { opens: await guideOpensFor(event, await signedInUser(event)) };
});
