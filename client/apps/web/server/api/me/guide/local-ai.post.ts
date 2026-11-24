import { wording } from "#shared/wording";
import { completionsAddress, REGISTRY_ROAD } from "#shared/guide";

// A local AI added for the administrator's start guide (docs/web.md, 「The start guide」): the model registered with the
// agency under its name, and its one address set on node `local`, naming the key file the console's secret store wrote
// in the platform's space where one was given (the agency's `docs/api.md`, 「providers, models and model files」). A
// registration whose address the agency refuses is taken away again, so nothing half made stands.
const NODE = "local";

export default defineEventHandler(async (event): Promise<{ model: string }> => {
  await requireAdministrator(event);

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
