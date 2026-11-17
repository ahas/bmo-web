import { useWebSql } from "./db";

// Each account's switch to show its presence (docs/web.md, 「Presence and typing」; docs/accounts.md, 「Showing one's
// presence」): on unless the account turned it off, and kept as a row of `web_presence_hidden` for each account that
// did. Every stream reads the set on every presence it hands, so the set is held in memory, read once as this server
// starts and kept as this server writes it; until it is read nobody's presence may be shown.

export class PresenceSwitches {
  private hiddenSet: Set<number> | null = null;

  /** The accounts showing no presence, or null until the switches are read. */
  hidden(): ReadonlySet<number> | null {
    return this.hiddenSet;
  }

  /** The switches read from the table, replacing whatever was held. */
  async read(): Promise<void> {
    const rows = (await useWebSql().all("SELECT user_id FROM web_presence_hidden")) as { user_id: number | string }[];

    this.hiddenSet = new Set(rows.map((row) => Number(row.user_id)));
  }

  /** Whether the account shows its presence, read from the table. */
  async shown(account: number): Promise<boolean> {
    return (await useWebSql().get("SELECT 1 AS hidden FROM web_presence_hidden WHERE user_id = $1", account)) === null;
  }

  /** The account's switch set, kept in the table and in the set every stream reads. */
  async set(account: number, shown: boolean, now: number): Promise<void> {
    if (shown) {
      await useWebSql().run("DELETE FROM web_presence_hidden WHERE user_id = $1", account);
    } else {
      await useWebSql().run(
        "INSERT INTO web_presence_hidden (user_id, hidden_at) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET hidden_at = excluded.hidden_at",
        account,
        now
      );
    }

    if (this.hiddenSet === null) {
      await this.read();
    } else if (shown) {
      this.hiddenSet.delete(account);
    } else {
      this.hiddenSet.add(account);
    }
  }
}

/** The one record this server keeps. */
export const presenceSwitches = new PresenceSwitches();
