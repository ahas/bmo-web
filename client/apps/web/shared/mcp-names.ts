// The MCP server and tool a logged call was, read out of the name its road wrote the line under: the Claude
// road's `mcp__<server>__<tool>`, and Codex's `<server>/<tool>`. The agency's run log writes both shapes, and a
// screen reading a log line asks this rather than spelling either shape itself.

export interface LoggedMcpCall {
  server: string;
  tool: string;
}

const claudeMcpName = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/;
const codexMcpName = /^([A-Za-z0-9][\w.-]*)\/([\w.-]+)$/;

export function mcpCallOf(name: string | null | undefined): LoggedMcpCall | null {
  const found = name === null || name === undefined ? null : (claudeMcpName.exec(name) ?? codexMcpName.exec(name));

  return found === null ? null : { server: found[1]!, tool: found[2]! };
}

// The brain's tools start their own name so: `brain_list`, `brain_similar`, `brain_recall` and the rest (docs/web.md,
// the room screen's brain chip). A road whose session reaches the tools through the shell runs them as
// `bmo use <server>/<tool>`, so such a command names the tool too.
const BRAIN_TOOL = /^brain_/;
const SHELL_TOOL_USE = /\bbmo\s+use\s+(?:[\w.-]+\/)?(brain_[\w-]+)/;

/** Whether a logged call, by the name its road wrote it under and the arguments it was sent with, used the brain. */
export function isBrainCall(name: string | null | undefined, text = ""): boolean {
  const tool = mcpCallOf(name)?.tool ?? name ?? "";

  return BRAIN_TOOL.test(tool) || SHELL_TOOL_USE.test(text);
}
