// The content units' four removal routes as the console-driven browser files meet them (docs/boundary.md, 「Calls the
// console makes」, the permanent delete): each unit counts and removes a fixed few records of an account and of an
// organisation unit, a kind the pack holds no word for among them, so the dialog's lines and its other records are
// read; a second removal answers every kind at none, as a unit does. A unit answers at the account path it serves, the
// agency's and bmo-mail's under `/owners`, every other unit's under `/accounts`.

// What each unit keeps of an account and of an organisation unit, by its settings' name.
const KEPT: Readonly<Record<string, { owners: boolean; account: Record<string, number>; unit: Record<string, number> }>> = {
  AGENCY: { owners: true, account: { supervisors: 1, "role-agents": 2, "slot-requests": 1, "unheard-of": 3 }, unit: { repositories: 1 } },
  RECEIVER: { owners: false, account: { "private-rooms": 1, messages: 1250 }, unit: {} },
  ORG_BRAIN: { owners: false, account: { brains: 1, memories: 40 }, unit: { brains: 1, memories: 2 } },
  ARTIFACT: { owners: false, account: { documents: 3, "member-shares": 0 }, unit: { "unit-shares": 1 } },
  MAIL: { owners: true, account: { accounts: 1, servers: 0 }, unit: { servers: 0, "servers-in-use": 0 } }
};

// The subjects already removed, by unit and path, so a removal again answers none.
const removed = new Set<string>();

function zeroed(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.keys(counts).map((kind) => [kind, 0]));
}

/** The unit's answer to one of its removal routes, or null for any other path. */
export function removalAnswer(unit: string, path: string, request: Request): Response | null {
  const kept = KEPT[unit];

  if (kept === undefined) return null;

  const accounts = kept.owners ? "owners" : "accounts";
  const account = new RegExp(`^/${accounts}/(\\d+)(/removal)?$`).exec(path);
  const orgUnit = /^\/org-units\/(\d+)(\/removal)?$/.exec(path);
  const matched = account ?? orgUnit;

  if (matched === null) return null;

  const counts = account !== null ? kept.account : kept.unit;
  const subject = `${unit}:${account !== null ? "account" : "unit"}:${matched[1]}`;
  const reading = matched[2] !== undefined;

  if (reading && request.method === "GET") return Response.json({ counts: removed.has(subject) ? zeroed(counts) : counts });
  if (!reading && request.method === "DELETE") {
    const answer = removed.has(subject) ? zeroed(counts) : counts;

    removed.add(subject);

    return Response.json({ removed: answer });
  }

  return null;
}
