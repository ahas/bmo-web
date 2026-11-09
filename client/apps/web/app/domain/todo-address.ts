import { todoOfQuery } from "#shared/paths";

// The item the address asks the TODO panel to open (docs/web.md, the TODO panel's section): the item the query names,
// unless the reader closed that item and came back onto the address by a step through the history. Closing a row
// takes the item off the entry the reader stands on, which under a drawer is the drawer's own entry: the page's
// entry beneath still names the item, and going back onto it would open the row the reader has just done with.

// The items the reader closed, for as long as the page stands.
const closed = new Set<number>();

// Whether the navigation that brought the address the reader now stands at was a step through the history rather
// than a link followed.
let stepped = false;
let listening = false;

// Says the reader closed an item, however they closed it.
export function todoClosed(id: number): void {
  closed.add(id);
}

/** The item an address asks for, given how the address was arrived at: none where the reader closed it and stepped
 * back onto it, and the item itself, no longer held closed, where a link named it. */
export function askedOf(query: unknown, arrivedByStep: boolean): { open: number | null; drop: boolean } {
  const id = todoOfQuery(query);

  if (id === null) return { open: null, drop: false };
  if (arrivedByStep && closed.has(id)) return { open: null, drop: true };

  closed.delete(id);

  return { open: id, drop: false };
}

// For a test to begin with nothing closed.
export function forgetClosedTodos(): void {
  closed.clear();
}

// The item the address asks for, read as the address moves. An address the reader stepped back onto that names an
// item they closed has the item taken off it, on the entry it stands in.
export function useAskedTodo(): () => number | null {
  const route = useRoute();
  const router = useRouter();

  if (import.meta.client && !listening) {
    listening = true;

    // The router's history says a move was a step through the history as the step lands; the route moves a moment
    // later, once the navigation's guards have run, and the move is read when it has.
    let stepping = false;

    router.options.history.listen((_to, _from, information) => {
      if (information.type === "pop") stepping = true;
    });
    router.afterEach(() => {
      stepped = stepping;
      stepping = false;
    });
  }

  return () => {
    const asked = askedOf(route.query.todo, stepped);

    if (asked.drop) void router.replace({ query: { ...route.query, todo: undefined } });

    return asked.open;
  };
}
