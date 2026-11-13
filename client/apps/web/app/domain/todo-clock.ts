import { inject, provide, ref, type InjectionKey, type Ref } from "vue";

import { toUnixSeconds } from "bmo-ui/app/domain/time";

// The second a TODO panel's lines are read against (docs/web.md, the TODO panel's section). The panel keeps it and
// hands it down, and only the parts of a line that show a time read it, so a tick redraws those parts and never the
// list.
const TODO_CLOCK: InjectionKey<Readonly<Ref<number>>> = Symbol("todo-clock");

export function provideTodoClock(clock: Readonly<Ref<number>>): void {
  provide(TODO_CLOCK, clock);
}

// The clock of the panel a part stands in; outside one, the second the part was drawn in, standing still.
export function useTodoClock(): Readonly<Ref<number>> {
  return inject(TODO_CLOCK, () => ref(toUnixSeconds(Date.now())), true);
}
