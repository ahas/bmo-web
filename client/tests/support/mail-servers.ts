// bmo-mail standing in for the organisation screen's mail servers tab (docs/boundary.md, bmo-mail's row of 「Calls the
// console makes」; bmo-mail's `docs/api.md`, 「Servers」): the servers of a link listed, kept, changed, removed and
// tested, each change writing the link's list of ids on the account service's chain in the caller's name first, naming
// bmo-mail as the kind's declarer, so a refusal there — 403 `forbidden`, 409 `locked`, 404 `not-found` — is the
// route's and nothing of the server changes. It keeps what it is told while the console stands.
//
// What a real server would say is fixed by the host a test names: a server on `IN_USE_HOST` has accounts standing on
// it, so its removal is refused 409 `server-in-use`, and a host ending in `.invalid` is never reached by a test.

/** The host of a server the stand-in counts accounts on. */
export const IN_USE_HOST = "in-use.example.com";

interface Kept {
  id: number;
  link: string;
  protocol: "imap" | "pop3" | "smtp";
  name: string;
  host: string;
  port: number;
  security: string;
  tlsName: string | null;
  auth: string;
}

const KIND = "mail.servers";
const USUAL: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  imap: { tls: 993, starttls: 143, none: 143 },
  pop3: { tls: 995, none: 110 },
  smtp: { tls: 465, starttls: 587, none: 25 }
};

const kept: Kept[] = [];
let next = 1;

const refused = (status: number, code: string) => Response.json({ code, error: code }, { status });

/** The answer to a call of bmo-mail's, or null for a path it does not serve; `chain` is the account service's address
 * and `token` its service token. */
export async function mailServersAnswer(path: string, request: Request, chain: string, token: string): Promise<Response | null> {
  const owner = request.headers.get("owner-key") ?? "";
  const entryOf = async (link: string) =>
    await fetch(`${chain}/chain/kinds/${KIND}/links/${encodeURIComponent(link)}`, { headers: { authorization: `Bearer ${token}`, "owner-key": owner } });
  // The link's list written on the chain as the caller, the chain's refusal handed on as the route's.
  const written = async (link: string, ids: number[]): Promise<Response | null> => {
    const answer = await fetch(`${chain}/chain/kinds/${KIND}/links/${encodeURIComponent(link)}/value`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "owner-key": owner, "declared-by": "mail", "content-type": "application/json" },
      body: JSON.stringify({ value: ids })
    });

    if (answer.ok) return null;

    const { code } = (await answer.json().catch(() => ({}))) as { code?: string };

    return answer.status === 409 && code === "locked" ? refused(409, "locked") : answer.status === 404 ? refused(404, "not-found") : refused(403, "forbidden");
  };
  const idsOf = (link: string, but: number | null = null, more: number[] = []) => [...kept.filter((one) => one.link === link && one.id !== but).map((one) => one.id), ...more];
  const shown = (one: Kept, mayChange: boolean) => ({
    ...one,
    direction: one.protocol === "smtp" ? "outgoing" : "incoming",
    holder: { link: one.link, name: null },
    mayChange,
    accountCount: one.host === IN_USE_HOST ? 2 : 0
  });

  if (path === "/servers" && request.method === "GET") {
    const link = new URL(request.url).searchParams.get("link") ?? "";
    const entry = await entryOf(link);

    if (!entry.ok) return refused(entry.status === 404 ? 404 : 403, entry.status === 404 ? "not-found" : "forbidden");

    const { writable } = (await entry.json()) as { writable: boolean };

    return Response.json({ items: kept.filter((one) => one.link === link).map((one) => shown(one, writable)), more: false });
  }

  if (path === "/servers" && request.method === "POST") {
    const body = (await request.json()) as Partial<Kept> & { link: string };
    const protocol = body.protocol!;
    const security = body.security ?? (protocol === "smtp" ? "starttls" : "tls");

    if (typeof body.host !== "string" || body.host === "" || USUAL[protocol]?.[security] === undefined) return refused(400, "bad-request");

    const id = next++;
    const refusal = await written(body.link, idsOf(body.link, null, [id]));

    if (refusal !== null) return refusal;

    const server: Kept = {
      id, link: body.link, protocol, name: body.name || body.host, host: body.host, port: body.port ?? USUAL[protocol]![security]!, security, tlsName: body.tlsName ?? null, auth: body.auth ?? "password"
    };

    kept.push(server);

    return Response.json(shown(server, true), { status: 201 });
  }

  if (path === "/server-tests" && request.method === "POST") {
    const { host } = (await request.json()) as { host?: string };

    return Response.json({ reached: typeof host === "string" && !host.endsWith(".invalid"), signedIn: null, failure: host?.endsWith(".invalid") ? "unreachable" : null });
  }

  const id = Number(/^\/servers\/(-?\d+)$/.exec(path)?.[1]);
  const server = kept.find((one) => one.id === id);

  if (server === undefined) return null;

  if (request.method === "PATCH") {
    const change = (await request.json()) as Partial<Kept>;
    const refusal = await written(server.link, idsOf(server.link));

    if (refusal !== null) return refusal;

    for (const key of ["name", "host", "port", "security", "auth"] as const) {
      if (change[key] !== undefined && change[key] !== null) Object.assign(server, { [key]: change[key] });
    }
    if (change.tlsName !== undefined && change.tlsName !== null) server.tlsName = change.tlsName === "" ? null : change.tlsName;

    return Response.json(shown(server, true));
  }

  if (request.method === "DELETE") {
    if (server.host === IN_USE_HOST) return refused(409, "server-in-use");

    const refusal = await written(server.link, idsOf(server.link, server.id));

    if (refusal !== null) return refusal;

    kept.splice(kept.indexOf(server), 1);

    return new Response(null, { status: 204 });
  }

  return null;
}
