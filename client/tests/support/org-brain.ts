// The brain standing in for the console's organisation memories (docs/boundary.md, the brain's row of 「Calls the
// console makes」): org brains made and found by their keys, each holding the memories written into it, listed by the
// filters the console names and moved to `invalidated`, with what stands for a topic answered empty. It keeps what it
// is told while the console stands, so a page read again shows what a write left. The base stands from the start with
// one candidate raised from an agent's brain, `agent-a`, waiting for the administrator's decision, and another raised
// whenever none is left, so every run of a file finds one.

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
  labels: Record<string, string>;
}

const brains = new Map<string, number>();
const names = new Map<number, string>();
const memories: Held[] = [];
let next = 1;

function held(brainId: number, text: string, more: Partial<Held> = {}): Held {
  return { id: next++, brainId, key: null, type: "tip", text, subjects: [], locked: false, internalOnly: false, shared: false, status: "active", actorName: "agent-a", validFrom: Date.now(), createdAt: Date.now(), labels: {}, ...more };
}

// An agent's brain holding a tip, and the base holding that tip as a pending candidate whose labels name its source.
const SOURCE = next++;
const BASE = next++;

names.set(SOURCE, "agent-a");
names.set(BASE, "platform");
brains.set("platform/platform", BASE);

const sourceTip = held(SOURCE, "Read the error before retrying a command.");

function candidate(): Held {
  return held(BASE, sourceTip.text, { status: "pending", labels: { sourceBrainId: String(SOURCE), sourceMemoryId: String(sourceTip.id), candidateReason: "It holds for any agent." } });
}

memories.push(sourceTip, candidate());

function listed(brainId: number, query: URLSearchParams): Held[] {
  const types = query.get("type")?.split(",");
  const excluded = query.get("excludeTypes")?.split(",") ?? [];
  const statuses = query.get("status")?.split(",") ?? ["active", "pending"];

  // The base's review never runs dry: where no candidate is left, the source's tip is raised again.
  if (brainId === BASE && statuses.includes("pending") && !memories.some((one) => one.brainId === BASE && one.status === "pending")) memories.push(candidate());

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
    const asked = (await request.json()) as { accountKey: string; agentKey: string; name?: string };
    const id = next++;

    brains.set(`${asked.accountKey}/${asked.agentKey}`, id);
    names.set(id, asked.name ?? asked.agentKey);

    return Response.json({ id, kind: "org" }, { status: 201 });
  }
  if (path === "/org-topics") return Response.json([]);

  const brain = /^\/brains\/(\d+)$/.exec(path);

  if (brain !== null && request.method === "GET" && names.has(Number(brain[1]))) return Response.json({ id: Number(brain[1]), name: names.get(Number(brain[1])) });

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
      createdAt: Date.now(),
      labels: {}
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
