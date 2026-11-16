import tailwind from "tailwindcss/colors";

// The component library's colour and text tokens as a stylesheet, for a contrast check that draws the
// console's own stylesheet on a page of its own rather than the whole console: every colour scale the
// console names in its app config, the library's own colour for each token it does not, each tone at the
// step the library paints it from in either mode, and the text and surface tokens of either mode. The
// console's stylesheet goes after it, as on the console's page, and states what it changes.

(globalThis as { defineAppConfig?: unknown }).defineAppConfig = (config: unknown) => config;

const appConfig = "../../apps/web/app/app.config";
const { ui } = (await import(appConfig)).default as { ui: { colors: Record<string, string> } };

const colors: Record<string, string> = { secondary: "blue", success: "green", info: "blue", warning: "yellow", error: "red", ...ui.colors };
const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

// Every coloured token, the neutral grey left out.
export const TONES = Object.keys(colors).filter((key) => key !== "neutral");

// A coloured word as the layer's theme draws it: the colour's word token where one is stated, and the
// colour itself where none is.
export const word = (key: string): string => `var(--bmo-ink-${key}, var(--ui-${key}))`;

export function libraryTokens(): string {
  const scale = Object.entries(colors)
    .flatMap(([key, name]) => shades.map((shade) => `--ui-color-${key}-${shade}: ${(tailwind as any)[name][shade]};`))
    .join("\n");
  const pick = (shade: number) => TONES.map((key) => `--ui-${key}: var(--ui-color-${key}-${shade});`).join("\n");
  const text = (dimmed: number, muted: number, words: number, inverted: string) =>
    `--ui-text-dimmed: var(--ui-color-neutral-${dimmed}); --ui-text-muted: var(--ui-color-neutral-${muted}); --ui-text: var(--ui-color-neutral-${words}); --ui-text-inverted: ${inverted};`;

  return `:root { ${scale} }
    :root { ${pick(500)} ${text(400, 500, 700, "#fff")} --ui-bg: #fff; --ui-bg-muted: var(--ui-color-neutral-50); --ui-bg-elevated: var(--ui-color-neutral-100); }
    .dark { ${pick(400)} ${text(500, 400, 200, "var(--ui-color-neutral-900)")} --ui-bg: var(--ui-color-neutral-900); --ui-bg-muted: var(--ui-color-neutral-800); --ui-bg-elevated: var(--ui-color-neutral-800); }`;
}

// The console's own stylesheet whole as it ships, which the browser reads as it reads any stylesheet,
// passing over the build's own imports and at-rules it has no use for.
export const CONSOLE_CSS = await Bun.file(new URL("../../apps/web/app/assets/css/main.css", import.meta.url)).text();
