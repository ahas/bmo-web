import { askReset } from "../../utils/account-security";
import { browserAddress } from "../../utils/accounts";
import { linkBase } from "../../utils/sign-in";

// A reset link asked from the login screen with no sign-in (docs/web.md, 「Pages with no sign-in」): answered the same
// whatever was asked, and sent on only where the console's public address is set, which the link is written under.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody<{ who?: unknown }>(event).catch(() => null);
  const who = typeof body?.who === "string" ? body.who.trim().slice(0, 254) : "";
  const base = linkBase(event, false);

  if (who !== "" && base !== null) {
    await askReset(who, base, browserAddress(event)).catch((error: unknown) => console.error(`a reset link was not asked: ${String(error)}`));
  }

  return { ok: true };
});
