import type { CardsState } from "#shared/cards";

// The card master's whole picture (docs/web.md, 「Monitor's services tab」). A master that does not answer is this
// console's sentence for a unit not reached; the console changes nothing there.
export default defineEventHandler(async (event): Promise<CardsState> => {
  await requireUserSession(event);

  return await readCards();
});
