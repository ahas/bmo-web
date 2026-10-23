import { readManifests } from "../utils/console-manifests";

// The units' manifests (docs/web.md, 「Screens a unit brings」): asked when the server starts and once a minute
// after, so a unit that comes up brings its screen and one that goes takes it with it.
const EVERY_MS = 60_000;

export default defineNitroPlugin((nitro) => {
  let timer: ReturnType<typeof setInterval> | null = null;

  const read = () => {
    readManifests().catch((error: unknown) => console.error("console bundles: the manifests were not read:", error));
  };

  read();
  timer = setInterval(read, EVERY_MS);

  nitro.hooks.hook("close", () => {
    if (timer !== null) clearInterval(timer);

    timer = null;
  });
});
