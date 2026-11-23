import { REACH_KINDS } from "#shared/app-permissions";

import { listSecrets, resolveChain } from "./account-service";
import { secretSpaceOf } from "./secrets";

import type { SignedIn } from "./accounts";
import type { PermissionReach } from "#shared/app-permissions";

// What a reader's personal apps may have of what they ask for (docs/web.md, 「App catalogue」): the chain's two flags
// resolved for the reader, the administrator held to neither as the agency holds them, and the names the reader's
// own secret space holds. A flag that does not resolve allows nothing, and a space that cannot be read holds nothing,
// as the agency and the tool host read them.

async function allows(key: string, person: string): Promise<boolean> {
  try {
    return (await resolveChain(key, { person })).value === true;
  } catch {
    return false;
  }
}

async function heldNames(signed: SignedIn): Promise<string[]> {
  const space = secretSpaceOf(signed);

  if (space === null) return [];

  try {
    return (await listSecrets(space)).map((secret) => secret.name);
  } catch {
    return [];
  }
}

/** What the signed-in reader's personal apps may reach, and the secrets their space holds by name. */
export async function readerReach(signed: SignedIn): Promise<PermissionReach> {
  const held = heldNames(signed);

  if (signed.administrator || signed.id === null) return { network: signed.administrator, secrets: signed.administrator, held: await held };

  const person = String(signed.id);
  const [network, secrets] = await Promise.all([allows(REACH_KINDS.network, person), allows(REACH_KINDS.secrets, person)]);

  return { network, secrets, held: await held };
}
