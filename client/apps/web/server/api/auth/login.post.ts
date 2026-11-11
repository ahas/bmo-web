import { sessionUser, signIn, userNode, userOf } from "../../utils/account-service";
import { settleMachine } from "../../utils/person-node";

import { wording } from "#shared/wording";

import type { AccountUser } from "#shared/types";

interface LoginBody {
  name?: unknown;
  password?: unknown;
  remember?: unknown;
}

export default defineEventHandler(async (event): Promise<{ user: AccountUser }> => {
  const body = await readBody<LoginBody>(event);
  const name = normalizeName(body?.name);
  const password = normalizePassword(body?.password);
  // Keeping the login is off unless the switch was on, so a request that says nothing about it —
  // an older screen, a road taken by hand — gets the browser-session login rather than the kept one.
  const remember = body?.remember === true;

  if (name === null || password === null) {
    throw fail(401, wording("app.error.wrong_credentials"));
  }

  const model = await consoleModel();

  // On the multi-user model the sign-in is the account service's, and its session is held inside
  // this console's own seal (docs/web.md, 「Access」); a service that does not answer signs nobody in.
  if (model === "down") {
    throw fail(503, wording("app.error.accounts_down"));
  }

  if (model === "on") {
    const address = browserAddress(event);
    const sid = await signIn(name, password, address);

    if (sid === null) {
      throw fail(401, wording("app.error.wrong_credentials"));
    }

    const session = await sessionUser(sid, address);
    const user = session === null ? null : await userOf(session.id);

    if (user === null) {
      throw fail(401, wording("app.error.wrong_credentials"));
    }

    // An account bound to a machine is used only while the hub holds that machine (docs/accounts.md,
    // 「Invitations and a person's machine」).
    if (!user.administrator) {
      const node = await userNode(user.id);

      if (node.agent !== undefined && !node.attached) {
        throw fail(403, wording("app.error.machine_gone"));
      }

      // A machine the administrator bound the account to is proven, and set as its node, at the first sign-in
      // after it attaches; nobody reads a refusal here, so it goes to the log.
      if (typeof node.agent === "string" && (node.provenAt ?? null) === null) {
        await settleMachine(user.id).catch((error: unknown) => console.error(`account ${user.id}: its machine could not be settled: ${String(error)}`));
      }
    }

    await setUserSession(event, { user: { name, id: Number(user.id) }, sid, administrator: user.administrator, loggedInAt: Date.now(), remember }, sessionLife(remember));

    return { user: { name } };
  }

  const user = await findWebUser(name);

  if (!(await checkPassword(user, password))) {
    throw fail(401, wording("app.error.wrong_credentials"));
  }

  await setUserSession(event, { user: { name }, loggedInAt: Date.now(), remember }, sessionLife(remember));

  return { user: { name } };
});
