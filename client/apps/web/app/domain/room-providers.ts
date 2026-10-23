// A room's chat providers as its dialog turns them (docs/web.md, the room screen's chat providers): the whole list
// is written at each turn of a switch, a provider turned on added at its end and one turned off taken out, the rest
// in the order they stood.

/** The room's list once the switch of `key` was turned `on` or off. */
export function providersTurned(on: readonly string[], key: string, turnedOn: boolean): string[] {
  const rest = on.filter((one) => one !== key);

  return turnedOn ? [...rest, key] : rest;
}
