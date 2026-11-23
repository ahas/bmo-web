import { MAX_NAME_LENGTH, MAX_PASSWORD_LENGTH, MIN_NAME_LENGTH, MIN_PASSWORD_LENGTH } from "#shared/config";

export interface WebUser {
  name: string;
  passwordHash: string;
  createdAt: number;
}

const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

// Verifying against this when the name is unknown keeps a wrong name and a wrong password
// the same amount of work, so the response time tells them apart no better than the message does.
let absentUserHash: string | null = null;

export async function findWebUser(name: string): Promise<WebUser | null> {
  return await useWebSql().get(`SELECT name, password_hash AS "passwordHash", created_at AS "createdAt" FROM web_users WHERE name = $1`, name) as WebUser | null;
}

export async function checkPassword(user: WebUser | null, password: string): Promise<boolean> {
  absentUserHash ??= await Bun.password.hash("bmo-web-absent-user", { algorithm: "argon2id" });

  const matched = await Bun.password.verify(password, user?.passwordHash ?? absentUserHash);

  return user !== null && matched;
}

// The tables whose rows belong to one account by its name, which move with it when it is renamed:
// the devices it rings, the tabs each screen stands with, how far it has read each room, its theme, its
// palette and its language. A row left under the old name would belong to nobody.
const ACCOUNT_TABLES = ["web_push_devices", "web_tab_states", "web_room_reads", "web_themes", "web_palettes", "web_languages"] as const;

export async function renameWebUser(from: string, to: string): Promise<void> {
  const sql = useWebSql();

  await sql.transaction(async () => {
    await sql.run("UPDATE web_users SET name = $1 WHERE name = $2", to, from);

    for (const table of ACCOUNT_TABLES) {
      await sql.run(`UPDATE ${table} SET user_name = $1 WHERE user_name = $2`, to, from);
    }
  });
}

export async function changePassword(name: string, password: string): Promise<void> {
  const hash = await Bun.password.hash(password, { algorithm: "argon2id" });

  await useWebSql().run("UPDATE web_users SET password_hash = $1 WHERE name = $2", hash, name);
}

// The name as it will be stored, or null when it is not a name this app accepts.
export function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const name = value.trim();

  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    return null;
  }

  return NAME_PATTERN.test(name) ? name : null;
}

export function normalizePassword(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value.length >= MIN_PASSWORD_LENGTH && value.length <= MAX_PASSWORD_LENGTH ? value : null;
}
