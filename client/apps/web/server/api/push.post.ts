import { wording } from "#shared/wording";

import type { PushState } from "#shared/types";

// A device subscribing, or one already subscribed saying which news it wants. It is written
// against the account that is logged in, so nothing can arrange to be rung about this room
// without first being someone who may read it.
export default defineEventHandler(async (event): Promise<PushState> => {
  const session = await requireUserSession(event);
  const body = (await readBody(event)) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    kinds?: unknown;
  };
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";

  // Without all three there is nothing to ring: the endpoint says where and the two keys are
  // what the payload is sealed to.
  if (endpoint === "" || p256dh === "" || auth === "") {
    throw fail(400, wording("push.error.bad_subscription"));
  }

  // The console sends wherever the endpoint points, so it is held to where a push service stands.
  if (!pushEndpointAllowed(endpoint)) {
    throw fail(400, wording("push.error.bad_endpoint"));
  }

  const saved = await saveDevice({
    user: session.user.name,
    endpoint,
    p256dh,
    auth,
    kinds: askedKinds(body.kinds),
    now: Math.floor(Date.now() / 1000)
  });

  // A subscription another account holds stays that account's until it lets it go.
  if (!saved) {
    throw fail(409, wording("push.error.device_taken"));
  }

  return { configured: pushPublicKey() !== null, publicKey: pushPublicKey(), devices: await devicesOf(session.user.name) };
});
