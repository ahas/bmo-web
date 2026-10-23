import type { H3Event } from "h3";

// A route's handler as a test calls it. A test stands `defineEventHandler` in as the identity, so a route's default
// export is the function its file wrote; it is called with the event the test's own stand-in helpers read, and it
// answers what the route's own type says it answers.

type Answer<Handler> = Handler extends (event: H3Event) => infer Answered ? Awaited<Answered> : never;

export function standInHandler<Handler extends (event: H3Event) => unknown>(handler: Handler): (event: object) => Promise<Answer<Handler>> {
  // The route's type takes h3's event, which no stand-in helper reads; the test hands it the one they do.
  return handler as (event: object) => Promise<Answer<Handler>>;
}
