import { readItemTestbedTurns } from "../../utils/testbed-turns";

import type { ItemTestbedTurn } from "#shared/types";

// Each running item's turn in the testbed's queue, which its TODO row's testbed line says (docs/web.md, the TODO
// panel's section). Every tab reads it again on the stream's `testbed` word and whenever its stream opens.
export default defineEventHandler(async (event): Promise<{ items: ItemTestbedTurn[] }> => {
  await requireUserSession(event);

  return { items: await readItemTestbedTurns() };
});
