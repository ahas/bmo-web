// The brain standing in for the console's organisation memories (docs/boundary.md, the brain's row of 「Calls the
// console makes」): org brains made and found by their keys, each holding the memories written into it, listed by the
// filters the console names and moved to `invalidated`, with what stands for a topic answered empty. It keeps what it
// is told while the console stands, so a page read again shows what a write left.

interface Held {
  id: number;
  brainId: number;
  key: string | null;
  type: string;
  text: string;
  subjects: { type: string; key: string }[];
  locked: boolean;
  internalOnly: boolean;
  shared: boolean;
  status: string;
  actorName: string;
  validFrom: number;
  createdAt: number;
}

const brains = new Map<string, number>();
const memories: Held[] = [];
let next = 1;

function listed(brainId: number, query: URLSearchParams): Held[] {
  const types = query.get("type")?.split(",");
  const excluded = query.get("excludeTypes")?.split(",") ?? [];
  const statuses = query.get("status")?.split(",") ?? ["active", "pending"];

  return memories
    .filter((one) => one.brainId === brainId && statuses.includes(one.status))
    .filter((one) => (types === undefined || types.includes(one.type)) && !excluded.includes(one.type));
}

/** One call of the brain answered, or none where it serves no such route. */
export async function orgBrainAnswer(path: string, request: Request): Promise<Response | null> {
  const query = new URL(request.url).searchParams;

  if (path === "/brains" && request.method === "GET") {
    const id = brains.get(`${query.get("accountKey")}/${query.get("agentKey")}`);

    return Response.json({ items: id === undefined ? [] : [{ id, kind: "org" }], more: false });
  }
  if (path === "/brains" && request.method === "POST") {
    const asked = (await request.json()) as { accountKey: string; agentKey: string };
    const id = next++;

    brains.set(`${asked.accountKey}/${asked.agentKey}`, id);

    return Response.json({ id, kind: "org" }, { status: 201 });
  }
  if (path === "/org-topics") return Response.json([]);

  const many = /^\/brains\/(\d+)\/memories$/.exec(path);

  if (many !== null && request.method === "GET") return Response.json({ items: listed(Number(many[1]), query), more: false });
  if (many !== null && request.method === "POST") {
    const asked = (await request.json()) as Partial<Held> & { standing?: string };
    const memory: Held = {
      id: next++,
      brainId: Number(many[1]),
      key: null,
      type: asked.standing === "member" ? "rumor" : (asked.type ?? "fact"),
      text: asked.text ?? "",
      subjects: asked.subjects ?? [],
      locked: asked.locked ?? false,
      internalOnly: asked.internalOnly ?? true,
      shared: asked.shared ?? false,
      status: "active",
      actorName: asked.actorName ?? "",
      validFrom: Date.now(),
      createdAt: Date.now()
    };

    memories.push(memory);

    return Response.json(memory, { status: 201 });
  }

  const one = /^\/brains\/(\d+)\/memories\/(\d+)$/.exec(path);
  const memory = one === null ? undefined : memories.find((each) => each.id === Number(one[2]));

  if (memory !== undefined && request.method === "GET") return Response.json(memory);
  if (memory !== undefined && request.method === "PATCH") {
    memory.status = ((await request.json()) as { status: string }).status;

    return Response.json(memory);
  }

  return null;
}
