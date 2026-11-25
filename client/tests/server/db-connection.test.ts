import { describe, expect, test } from "bun:test";

import { connectionOf } from "../../apps/web/server/utils/db";

// What the console's database client is handed for the address `WEB_DATABASE_URL` names (server/utils/db.ts):
// the server a `host` parameter names, read as libpq reads it, and never that parameter passed on to the server.

describe("the console's database address", () => {
  test("an address with no host parameter is handed on as it stands", () => {
    expect(connectionOf("postgres://user-a@db.example.org:5433/bmo_web")).toBe("postgres://user-a@db.example.org:5433/bmo_web");
  });

  test("a socket folder is the socket in that folder, on the port the address names", () => {
    expect(connectionOf("postgres:///bmo_web?host=/run/postgresql&port=5433")).toEqual({
      path: "/run/postgresql/.s.PGSQL.5433",
      database: "bmo_web",
      username: process.env.USER || process.env.LOGNAME,
      password: undefined
    });
  });

  test("a host name or address is that host and port, the parameters kept from the server", () => {
    expect(connectionOf("postgres://user-a:secret-a@localhost/bmo_web?host=127.0.0.1&port=24680")).toEqual({
      hostname: "127.0.0.1",
      port: 24680,
      database: "bmo_web",
      username: "user-a",
      password: "secret-a"
    });
  });

  test("a host with no port is on PostgreSQL's own port", () => {
    expect(connectionOf("postgres:///bmo_web?host=db.example.org")).toMatchObject({ hostname: "db.example.org", port: 5432 });
  });
});
