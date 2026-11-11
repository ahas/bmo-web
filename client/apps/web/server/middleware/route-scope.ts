import { withoutBase } from "ufo";

import { readSupervisors } from "../utils/axes";
import { attachedService, readerMay } from "../utils/console-manifests";
import { openedRoute } from "../utils/opened-routes";
import { sectionAccessOf } from "../utils/section-access";
import { mayRead, mayWrite } from "#shared/sections";

import type { Reader } from "../utils/console-manifests";

// A user other than the platform administrator reaches only the routes opened to them, each read under its
// scope and its console section (docs/web.md, 「Access」); every other route answers them as if nothing stood
// there. The administrator, a console login and a request nobody signed pass on to the route itself, which
// refuses the last as it always has. A route is named by its path under the console's base, as its file names
// it. The relay of a service a manifest names opens to every reader the manifest's role and owner key allow,
// since the service guards each of its own routes by the role it is handed (docs/web.md, 「Screens a unit
// brings」).
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const path = withoutBase(event.path.split("?")[0] ?? "", config.app.baseURL);

  if (!path.startsWith("/api/") || !carriesSession(event)) {
    return;
  }

  const session = await getUserSession(event);

  if (session.sid === undefined || session.administrator === true) {
    return;
  }

  // The login this request acts for, as the seal holds it: its user, and the member role the administrator
  // check above did not answer.
  const id = session.user?.id;
  const key = id === undefined ? null : String(id);
  const reader: Reader = { role: "member", keyed: key !== null };

  const service = /^\/api\/([^/]+)\//.exec(path)?.[1];
  const attached = service === undefined ? null : attachedService(service);

  if (attached !== null && readerMay(reader, attached.manifest)) {
    event.context.routeScope = "user";

    return;
  }

  // A person reads their own BMO's log and turns, whatever sections they hold (docs/web.md, 「Access」).
  if (event.method === "GET" && id !== undefined && (await ownAgentRead(path, Number(id)))) {
    event.context.routeScope = "user";

    return;
  }

  const opened = openedRoute(event.method, path);

  if (opened === null || opened.administrator === true) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  if (opened.sections !== undefined && opened.sections.length > 0) {
    if (key === null) {
      throw createError({ statusCode: 404, statusMessage: "Not Found" });
    }

    const access = await sectionAccessOf(key, { key, role: "member" });
    const asked = opened.access ?? "read";

    if (!opened.sections.some((section) => (asked === "write" ? mayWrite(access, section) : mayRead(access, section)))) {
      throw createError({ statusCode: 404, statusMessage: "Not Found" });
    }
  }

  event.context.routeScope = opened.scope;
});

// Whether a path reads the log or the turns of a supervisor whose owner account is the reader.
async function ownAgentRead(path: string, reader: number): Promise<boolean> {
  const name = /^\/api\/agents\/([^/]+)\/(?:log|turns)$/.exec(path)?.[1];

  if (name === undefined || !Number.isSafeInteger(reader)) return false;

  const agent = decodeURIComponent(name);
  const supervisors = await readSupervisors().catch(() => []);

  return supervisors.some((supervisor) => supervisor.name === agent && supervisor.ownerAccount === reader);
}
