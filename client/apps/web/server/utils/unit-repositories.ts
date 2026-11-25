import { wording } from "#shared/wording";

import { agency, agencyCall } from "./agency";
import { changeRepository, readProviderModels, readProviders, readWorkNodes, repositoryViewOf } from "./axes";
import { fail } from "./fail";
import { unitRepositories } from "./organisation-agents";

import type { SignedIn } from "./accounts";
import type { components } from "@agency/client/schema";
import type { H3Event } from "h3";
import type { ProviderModelsView, RepositoryView, UnitRepositoryDetail } from "#shared/axes";

// A unit's repository on the organisation screen (docs/web.md, 「System and organisation」, the agents tab, the unit's repositories): the same
// dialog as agent management's repository tab, read and saved through the unit's own routes, so a head needs no part of
// agent management. The console stands each call on the unit's link of repository management, which the chain answers
// the unit's heads and the administrator; the agency's list and its choices are read as the deployment's own, and a
// change is asked in the reader's name, the agency judging by whether they head the unit.

// The unit's repository by its name, refused where the reader holds no link of the unit or the unit owns none so named.
async function heldRepository(unit: number, name: string, signed: SignedIn): Promise<void> {
  if (!(await unitRepositories(unit, signed)).some((one) => one.name === name)) throw fail(404, wording("agents.error.agency_not_found"));
}

/** The unit's repository whole, with the nodes and the providers its dialog offers. */
export async function unitRepositoryDetail(unit: number, name: string, signed: SignedIn): Promise<UnitRepositoryDetail> {
  await heldRepository(unit, name, signed);

  const [list, nodes, providers] = await Promise.all([agencyCall(agency().GET("/repositories")), readWorkNodes(), readProviders()]);
  const held = list.items.find((one) => one.name === name);

  if (held === undefined) throw fail(404, wording("agents.error.agency_not_found"));

  return { repository: repositoryViewOf(held), nodes, providers };
}

/** The unit's repository changed in the reader's name, every field the dialog sends. */
export async function changeUnitRepository(event: H3Event, unit: number, name: string, change: components["schemas"]["RepositoryAsk"], signed: SignedIn): Promise<RepositoryView> {
  await heldRepository(unit, name, signed);

  return await changeRepository(name, change, event);
}

/** The models a pinned model of the unit's repository may name on one provider. */
export async function unitRepositoryModels(unit: number, name: string, provider: string, signed: SignedIn): Promise<ProviderModelsView> {
  await heldRepository(unit, name, signed);

  return await readProviderModels(provider);
}
