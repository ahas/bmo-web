// GitHub's webhook deliveries, the one call this app takes with no sign-in (docs/web.md, 「Access」): GitHub posts
// them and nobody signs in to post them. The body is handed on unchanged to the agency's `POST /github/deliveries`
// with GitHub's own headers and the agency's token, and the agency's answer is handed back: whether a delivery is
// GitHub's is the agency's to say, by its signature, and this app judges nothing of it.

/** The most a delivery may carry; GitHub's are far below it for the events the agency reads. */
const DELIVERY_MAX_BYTES = 1024 * 1024;

// The headers a delivery is handed on with.
const HANDED: readonly string[] = ["content-type", "x-github-event", "x-github-delivery", "x-hub-signature-256"];

// How long the agency has to answer a delivery; GitHub itself gives up at ten seconds.
const ANSWER_MS = 9_000;

export default defineEventHandler(async (event) => {
  const declared = Number.parseInt(getRequestHeader(event, "content-length") ?? "", 10);

  if (Number.isSafeInteger(declared) && declared > DELIVERY_MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "Payload Too Large" });
  }

  const body = (await readRawBody(event, false)) ?? new Uint8Array();

  if (body.byteLength > DELIVERY_MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "Payload Too Large" });
  }

  const unit = unitAt("AGENCY");

  if (unit === null) {
    throw createError({ statusCode: 502, statusMessage: "Bad Gateway" });
  }

  const headers: Record<string, string> = { ...unitHeaders(unit) };

  for (const name of HANDED) {
    const value = getRequestHeader(event, name);

    if (value !== undefined) headers[name] = value;
  }

  const kind = getRequestHeader(event, "x-github-event") ?? "-";
  const delivery = getRequestHeader(event, "x-github-delivery") ?? "-";
  let answer: Response;

  try {
    answer = await fetch(`${unit.address}/github/deliveries`, { method: "POST", headers, body: new Uint8Array(body), signal: AbortSignal.timeout(ANSWER_MS) });
  } catch {
    console.info(`github delivery ${delivery} (${kind}): the agency did not answer`);
    throw createError({ statusCode: 502, statusMessage: "Bad Gateway" });
  }

  console.info(`github delivery ${delivery} (${kind}): ${answer.status}`);

  return sendWebResponse(
    event,
    new Response(await answer.arrayBuffer(), {
      status: answer.status,
      headers: { "content-type": answer.headers.get("content-type") ?? "application/json" }
    })
  );
});
