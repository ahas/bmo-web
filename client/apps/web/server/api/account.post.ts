import { changeUserPassword, renameUser } from "../utils/account-service";

import { wording } from "#shared/wording";

import type { AccountUser } from "#shared/types";

interface AccountBody {
  currentPassword?: unknown;
  name?: unknown;
  password?: unknown;
}

export default defineEventHandler(async (event): Promise<{ user: AccountUser }> => {
  const session = await requireUserSession(event);
  const body = await readBody<AccountBody>(event);

  const currentPassword = normalizePassword(body?.currentPassword);

  if (currentPassword === null) {
    throw fail(400, wording("account.error.current_password_empty"));
  }

  const nextName = body?.name === undefined || body.name === "" ? session.user.name : normalizeName(body.name);

  if (nextName === null) {
    throw fail(400, wording("account.error.bad_user_id"));
  }

  const nextPassword = body?.password === undefined || body.password === "" ? null : normalizePassword(body.password);

  if (body?.password !== undefined && body.password !== "" && nextPassword === null) {
    throw fail(400, wording("account.error.bad_new_password"));
  }

  const signed = await signedInUser(event);
  // The console's own account of this name, which the services on this machine still check their
  // login against, so it moves with the account until the contraction (docs/web.md, 「Access」).
  const own = await findWebUser(session.user.name);

  if (signed.id !== null) {
    // On the multi-user model the account is sumida's user: the current password is checked there,
    // and the name and the password change there.
    if (!(await changeUserPassword(signed.id, currentPassword, nextPassword ?? currentPassword))) {
      throw fail(401, wording("account.error.current_password_wrong"));
    }

    if (nextName !== session.user.name && !(await renameUser(signed.id, nextName))) {
      throw fail(409, wording("account.error.user_id_taken"));
    }
  } else if (!(await checkPassword(own, currentPassword))) {
    throw fail(401, wording("account.error.current_password_wrong"));
  }

  if (own !== null) {
    if (nextName !== session.user.name) {
      if (await findWebUser(nextName) !== null) {
        throw fail(409, wording("account.error.user_id_taken"));
      }

      await renameWebUser(session.user.name, nextName);
    }

    if (nextPassword !== null) {
      await changePassword(nextName, nextPassword);
    }
  }

  // The session is written again under the new name, and it is written with the life it already
  // had: a reader who asked to keep the login does not lose it by changing their own password. A
  // sumida session it holds stays the same session.
  const remember = sessionRemembers(session);

  await replaceUserSession(event, {
    user: {
      name: nextName,
      ...(session.user.id === undefined ? {} : { id: session.user.id }),
      ...(session.user.fullName === undefined ? {} : { fullName: session.user.fullName })
    },
    ...(session.sid === undefined ? {} : { sid: session.sid, administrator: session.administrator === true }),
    loggedInAt: Date.now(),
    remember,
  }, sessionLife(remember));

  return { user: { name: nextName } };
});
