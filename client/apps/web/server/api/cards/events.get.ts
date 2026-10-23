import { createParser } from "eventsource-parser";

import { CONTROL_UNREACHABLE } from "#shared/config";
import { wording } from "#shared/wording";

import type { Cluster } from "../../utils/cards";

// The card master's pictures as they change (docs/web.md, 「Monitor's services tab」): each `cluster.changed` event
// of its stream handed on as one `state` event carrying the picture in the board's shape. A master that is not
// there ends the stream, and the browser opens it again.
export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const aborted = new AbortController();
  event.node.res?.on("close", () => aborted.abort());

  let answer: Response | null;

  try {
    answer = await cardsStream(aborted.signal);
  } catch {
    answer = null;
  }

  if (answer === null || !answer.ok || answer.body === null) throw fail(503, wording(CONTROL_UNREACHABLE));

  const upstream = answer.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const parser = createParser({
        onEvent(one) {
          if (one.event !== "cluster.changed") return;

          try {
            const frame = JSON.parse(one.data) as { data?: Cluster };

            if (frame.data !== undefined) controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify(cardsStateOf(frame.data))}\n\n`));
          } catch {
            // A frame that does not read is followed by a whole one.
          }
        }
      });

      try {
        for (;;) {
          const chunk = await upstream.read();

          if (chunk.done) break;

          parser.feed(decoder.decode(chunk.value, { stream: true }));
        }
      } catch {
        // The master went away, or the browser did.
      } finally {
        controller.close();
      }
    },
    cancel() {
      aborted.abort();
    }
  });

  return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no" } });
});
