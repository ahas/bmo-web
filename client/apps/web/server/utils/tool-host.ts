import { readFile } from "node:fs/promises";

// A hosted tool called on the tool host's control socket under the console's own tool session (docs/boundary.md,
// 「The web beyond the units」). The socket and the file the host writes the session's token to are the console's
// settings, and the token is read from its file on every call, since the host issues it again where it is revoked.

/** One piece of a tool's answer: words under `text`, or bytes in base64 under `data` with their `mimeType`. */
export interface ToolContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

/** A tool's answer, as the tool wrote it. */
export interface ToolResult {
  content?: ToolContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

/** Where the console's tool session reaches the tool host: its control socket and the file holding the token. */
export interface ToolSession {
  socket: string;
  tokenFile: string;
}

/** A call the host refused, the tool answered as failed, or the host answered in no shape a call reads. */
export class HostedToolFailed extends Error {}

/** The tool session the console's settings name; null where they name no socket or no token file. */
export function settingsToolSession(env: NodeJS.ProcessEnv = process.env): ToolSession | null {
  const socket = env.BMO_MCP_HOST_SOCKET?.trim() ?? "";
  const tokenFile = env.POCKET_SESSION_TOKEN_FILE?.trim() ?? "";

  return socket === "" || tokenFile === "" ? null : { socket, tokenFile };
}

/** Calls one hosted tool and answers its result, waiting at most `waitMs` for it; throws where no result comes. */
export async function callHostedTool(
  session: ToolSession,
  tool: { namespace: string; name: string },
  input: Record<string, unknown>,
  waitMs: number
): Promise<ToolResult> {
  const token = (await readFile(session.tokenFile, "utf8")).trim();
  // The host name is never resolved: the request goes to the socket, which answers every name.
  const response = await fetch("http://tool-host/tool-calls", {
    unix: session.socket,
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ ...tool, input }),
    signal: AbortSignal.timeout(waitMs)
  });
  const full = `${tool.namespace}/${tool.name}`;

  if (!response.ok) throw new HostedToolFailed(`the tool host refused ${full} with ${response.status}`);

  const result = ((await response.json()) as { result?: ToolResult }).result;

  if (typeof result !== "object" || result === null) throw new HostedToolFailed(`the tool host answered ${full} with no result`);
  if (result.isError === true) throw new HostedToolFailed(`${full} answered a failure`);

  return result;
}
