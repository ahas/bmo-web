import { wording } from "#shared/wording";
import { completionsAddress, REGISTRY_ROAD } from "#shared/guide";

import { keepLocalAi, localAiAsked, localAiIncomplete } from "../../../utils/local-ai";

// A local AI added in the start guide (docs/web.md, 「The start guide」): a member's own, kept by the agency as theirs;
// the administrator's, the model registered with the agency under its name, and its one address set on node `local`,
// naming the key file the console's secret store wrote in the platform's space where one was given (the agency's `docs/api.md`, 「providers, models and model files」). A
// registration whose address the agency refuses is taken away again, so nothing half made stands.
const NODE = "local";

export default defineEventHandler(async (event): Promise<{ model: string }> => {
  const signed = await signedInUser(event);

  // A member's own local AI, reached from their PC: its key their own secret by name, tried there first and kept once
  // it answers (docs/web.md, 「The start guide」; the agency's `docs/supply.md`, 「A person's local AI」).
  if (!signed.administrator) {
    const asked = localAiAsked(await readBody<Record<string, unknown>>(event));

    if (asked === null) throw localAiIncomplete();

    return { model: (await keepLocalAi(event, asked)).model };
  }

  const body = await readBody<{ name?: unknown; url?: unknown; model?: unknown; keyFile?: unknown }>(event);
  const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
  const name = text(body?.name);
  const url = text(body?.url);
  const model = text(body?.model);
  const keyFile = text(body?.keyFile);

  if (name === "" || url === "" || model === "") throw fail(400, wording("guide.error.local_fields"));

  const key = `${REGISTRY_ROAD}::${name}`;
  const fields = { name: "guide.error.local_name", node: "guide.error.local_url", url: "guide.error.local_url", model: "guide.error.local_model", key: "guide.error.local_key", keyFile: "guide.error.local_key" };

  // The agency reads the registration's key; its name is the same key, as the registry's other callers send it.
  await agencyCall(agency(event).POST("/models", { body: { key, name: key, model } }), { fields });

  try {
    await agencyCall(
      agency(event).PUT("/models/{modelKey}/addresses/{node}", {
        params: { path: { modelKey: key, node: NODE } },
        body: { url: completionsAddress(url), keyFile: keyFile === "" ? null : keyFile }
      }),
      { fields }
    );
  } catch (error) {
    await agency(event)
      .DELETE("/models/{modelKey}", { params: { path: { modelKey: key } } })
      .catch(() => undefined);

    throw error;
  }

  return { model: name };
});
