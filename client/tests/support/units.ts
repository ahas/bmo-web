import { afterAll } from "bun:test";

// A unit stood in for on a loopback port: every call the console makes on it is kept, and answered as the test
// says. The console finds it at the address its settings name, `<NAME>_ADDRESS`, as it finds the real one.

export interface Asked {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  // The body as it was sent, where it is no JSON: a multipart form's frame and its fields among it.
  raw?: string;
  // The request's headers, by lower-case name, which a call a person makes carries the owner it acts for in.
  headers?: Record<string, string>;
}

export interface StandIn {
  asked: Asked[];
  address: string;
}

/** A JSON answer with its status. */
export function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** What the stand-in keeps of each call beyond its method, path and body. */
export interface StandInOptions {
  // Whether each call's headers are kept beside its method, path and body, for a test that reads what a call carried
  // beyond its shape.
  headers?: boolean;
}

/** The unit `name` stood in for until the test file ends, answering each call with what `reply` gives. */
export function standIn(name: string, reply: (asked: Asked) => Response | Promise<Response>, options: StandInOptions = {}): StandIn {
  const asked: Asked[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const text = await request.text();
      const json = (request.headers.get("content-type") ?? "").includes("multipart/") ? null : text;
      const one: Asked = {
        method: request.method,
        path: `${url.pathname}${url.search}`,
        body: json === null || json === "" ? null : (JSON.parse(json) as Record<string, unknown>),
        ...(json === null ? { raw: text } : {}),
        ...(options.headers === true ? { headers: Object.fromEntries(request.headers.entries()) } : {})
      };

      asked.push(one);

      return await reply(one);
    }
  });
  const address = `http://127.0.0.1:${server.port}`;

  process.env[`${name}_ADDRESS`] = address;
  afterAll(() => {
    void server.stop(true);
    delete process.env[`${name}_ADDRESS`];
  });

  return { asked, address };
}
