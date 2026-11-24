// What reaches each of a reader's agents beyond what their line carries (docs/web.md, 「Organisation」, the agents tab
// at the reader's own node; the agency's `docs/api.md`, 「attachments」): the skills and MCP items the reader attached to it, from those
// they own or installed. A skill or an MCP item reaches no agent it is not attached to.

/** The two kinds of item an agent is given by attaching. */
export type AttachedKind = "skills" | "mcp";

/** One agent that takes attachments: one of the reader's supervisors, their BMO first, or one of their role agents. */
export interface AttachmentHolder {
  kind: "supervisor" | "agent";
  name: string;
  label: string | null;
  role: string | null;
  line: string | null;
  // Whether the agent's line takes attached skills and attached MCP items at all.
  takes: Record<AttachedKind, boolean>;
  skills: string[];
  mcp: string[];
}

/** An item the reader may attach: its name, its title in the maker's language and by locale, and whether it is the
 * reader's own or installed from the store. */
export interface AttachableItem {
  name: string;
  title: string | null;
  titles: Record<string, string>;
  origin: "own" | "installed";
}

/** The reader's holders and every item they may attach to them. */
export interface Attachments {
  holders: AttachmentHolder[];
  skills: AttachableItem[];
  mcp: AttachableItem[];
}

/** What a holder is given, written whole. */
export interface AttachmentChange {
  skills: string[];
  mcp: string[];
}
