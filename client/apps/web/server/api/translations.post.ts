import { wording } from "#shared/wording";

import { gateReadings, READINGS_PER_CALL } from "../utils/gate";

// A worker's or a job's text read in the reader's language, for the console's own screens (docs/web.md, 「The
// original, and its translation under it」): handed to the gate's translating route on the console's own credential
// and for the reader's role, as the relay would hand a bundle's — but asked here, since the relay judges a call by
// the page it came from, and the TODO dialog stands over a bundle's screen as much as over the console's own.
// The gate answers one reading for each original, in order, and keeps every translation it makes.

export default defineEventHandler(async (event): Promise<{ readings: { text: string; whole: boolean }[] }> => {
  await requireAdministrator(event);

  const body = await readBody<{ language?: unknown; originals?: unknown }>(event);
  const language = typeof body?.language === "string" ? body.language : "";
  const originals = Array.isArray(body?.originals) ? body.originals.filter((one): one is string => typeof one === "string") : [];

  if (language === "" || originals.length === 0 || originals.length > READINGS_PER_CALL) throw fail(400, wording("common.error.translation_failed"));
  if (unitAt("GATE") === null) throw fail(503, wording("common.error.translation_failed"));

  const readings = await gateReadings(language, originals, "administrator");

  if (readings.length !== originals.length) throw fail(502, wording("common.error.translation_failed"));

  return { readings };
});
