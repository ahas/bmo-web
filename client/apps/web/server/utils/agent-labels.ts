import { agency, agencyCall } from "./agency";

// What each supervisor is called, as the agency holds it (its `GET /supervisors`, `label`): the name a row of its words
// stands under for every reader, whatever console sections they hold (docs/web.md, 「A message stands under the agent
// that said it」). The list changes only as an agent is registered or renamed, so it is kept for a minute; an agency
// that does not answer leaves every agent without a label, and the next read asks again.

const KEPT_MS = 60_000;

let kept: { at: number; labels: Promise<ReadonlyMap<string, string>> } | null = null;

async function readLabels(): Promise<ReadonlyMap<string, string>> {
  const page = await agencyCall(agency().GET("/supervisors"));

  return new Map(
    page.items.flatMap((supervisor) => {
      const label = supervisor.label?.trim() ?? "";

      return label === "" ? [] : [[supervisor.name, label] as const];
    })
  );
}

/** Each supervisor's label by its registration name; an agent with none is not in it. */
export function agentLabels(now: number = Date.now()): Promise<ReadonlyMap<string, string>> {
  if (kept === null || now - kept.at >= KEPT_MS) {
    const held = { at: now, labels: readLabels() };

    kept = held;
    held.labels = held.labels.catch(() => {
      if (kept === held) kept = null;

      return new Map<string, string>();
    });
  }

  return kept.labels;
}
