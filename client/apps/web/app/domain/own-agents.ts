import type { OwnProvider, OwnRoad } from "#shared/own-agents";

// A road as one line a person reads (docs/web.md, 「Settings」, the own-agents section; 「Organisation」, the agents
// tab): the provider by its label, the model and the effort, joined by middle dots; a road naming none by the words the
// screen says that stands for.

/** The line a road stands as, `none` where it names none. */
export function roadLine(road: OwnRoad | null, providers: readonly OwnProvider[], none: string): string {
  if (road === null) return none;

  const label = providers.find((one) => one.name === road.provider)?.label ?? road.provider;

  return [label, road.model, road.effort].filter((part): part is string => part !== null && part !== "").join(" · ");
}
