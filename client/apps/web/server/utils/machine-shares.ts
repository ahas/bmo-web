import { setPersonNode } from "./person-node";

import type { ShareAnswer } from "@web/server-client";

/**
 * A share bound at an invitation's ask followed into agency (docs/accounts.md, 「A machine shared at an invitation's
 * ask」): every account already on the machine has its record set as shared, so the asking account's record may name
 * the machine beside theirs as its proof sets it. A refusal is written to the log and the share stands.
 */
export async function followShare(answer: ShareAnswer): Promise<void> {
  if (answer.state !== "bound") return;

  for (const holder of answer.holders) {
    await setPersonNode(holder, answer.machine, true).catch((error: unknown) =>
      console.error(`account ${holder}: its node ${answer.machine} could not be set shared: ${String(error)}`)
    );
  }
}
