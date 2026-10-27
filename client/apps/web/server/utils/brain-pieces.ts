import type { BrainMemoryView, BrainPiece } from "#shared/drafting";
import type { SignedIn } from "./accounts";

// What a piece a round read is, for the brain list's modal (docs/web.md, the room screen's brain chip): the brain's memory
// where the round's end names one, read as the person signed in, and otherwise the gate's text of the piece where
// its index lists the path.

interface BrainRow {
  id: number;
  brainId: number;
  key: string | null;
  type: string;
  text: string;
  layerId: number | null;
  subjects: { type: string; key: string }[];
  validFrom: number | null;
  createdAt: number;
}

interface IndexEntry {
  slug: string;
  path: string;
}

interface IndexGroup {
  group: string;
  entries: IndexEntry[];
}

async function brainOf(agent: string, headers: Record<string, string>): Promise<number | null> {
  const page = await unitFetch<{ items: { id: number; agentKey: string }[] }>("BRAIN", `/brains?${new URLSearchParams({ agentKey: agent })}`, { headers });

  return page.items.find((brain) => brain.agentKey === agent)?.id ?? null;
}

async function memoryOf(brainId: number, memoryId: number, headers: Record<string, string>): Promise<BrainMemoryView> {
  const row = await unitFetch<BrainRow>("BRAIN", `/brains/${brainId}/memories/${memoryId}`, { headers });
  const layer = row.layerId === null ? null : await unitFetch<{ name: string }>("BRAIN", `/brains/${brainId}/layers/${row.layerId}`, { headers }).catch(() => null);

  return {
    id: row.id,
    brainId,
    key: row.key ?? null,
    type: row.type,
    text: row.text,
    layer: layer?.name ?? null,
    subjects: row.subjects.map((subject) => ({ type: subject.type, key: subject.key })),
    writtenAt: Math.floor((row.validFrom ?? row.createdAt) / 1000)
  };
}

// The gate's text of a piece its index lists under the path, read without a session so nothing is counted as read.
async function pieceText(chatId: number, agent: string, path: string): Promise<string | null> {
  if (unitAt("GATE") === null) return null;

  const index = await unitFetch<{ groups: IndexGroup[] }>("GATE", `/reference/index?${new URLSearchParams({ room: String(chatId), agent })}`);

  for (const group of index.groups) {
    const entry = group.entries.find((one) => one.path === path);

    if (entry === undefined) continue;

    const piece = await unitFetch<{ text: string }>("GATE", `/reference/pieces/${encodeURIComponent(entry.slug)}?${new URLSearchParams({ room: String(chatId), group: group.group, agent })}`);

    return piece.text;
  }

  return null;
}

export async function brainPiece(signed: SignedIn, chatId: number, agent: string, path: string, memoryId: number | null): Promise<BrainPiece> {
  if (memoryId !== null && unitAt("BRAIN") !== null) {
    const headers = ownerHeaders(signed);
    const brainId = await brainOf(agent, headers);

    if (brainId !== null) return { memory: await memoryOf(brainId, memoryId, headers), text: null };
  }

  return { memory: null, text: await pieceText(chatId, agent, path) };
}
