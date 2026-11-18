import { PAGING } from "#shared/config";
import { SKIPPED_STAGE } from "#shared/types";
import { SKIPPED_OUTCOME } from "./events";

import type { JudgementMark, LatestSkipReason, SkipReason, SkipReasonPage } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { Ref } from "vue";
import type { RoomOutcome } from "./events";

// Why a silent turn sent nothing, on a second line under the line saying it did not answer (docs/web.md, 「A turn the
// chat agent chose not to answer」). The console's server reads each reason from the turn's verdict and translates it
// into the reader's language; the page carries each verdict as its mark alone, so the reasons are read once the rows
// stand, and each verdict is asked about once for the screen's life.

/** The newest silent turn's mark among a row's verdicts, or none: two silent turns over one message stand the newer
 * one's reason alone. */
export function newestSkipped(judgements: readonly JudgementMark[]): JudgementMark | null {
  let newest: JudgementMark | null = null;

  for (const one of judgements) {
    if (one.stage !== SKIPPED_STAGE) continue;
    if (newest === null || one.createdAt > newest.createdAt || (one.createdAt === newest.createdAt && one.id > newest.id)) newest = one;
  }

  return newest;
}

/** The line saying why a silent turn sent nothing: the reason it named, or that it named none. */
export function skipReasonLine(t: Translate, reason: SkipReason): string {
  return reason.kind === "named" ? t("room.status.outcome_skipped_reason", { reason: reason.text }) : t("room.status.outcome_skipped_reason_none");
}

/** The reasons of the silent turns among `marks`, by their verdicts' numbers, read in `language` as the marks come. A
 * read that fails leaves its lines with no reason. */
export function useSkipReasons(chatId: number, language: () => string, marks: () => readonly JudgementMark[]): Ref<ReadonlyMap<number, SkipReason>> {
  const reasons = ref<ReadonlyMap<number, SkipReason>>(new Map()) as Ref<ReadonlyMap<number, SkipReason>>;
  const asked = new Set<number>();

  async function ask(due: readonly JudgementMark[]): Promise<void> {
    const times = due.map((mark) => mark.createdAt);

    try {
      const page = await $fetch<SkipReasonPage>(`/api/rooms/${chatId}/skip-reasons`, {
        query: { ids: due.map((mark) => mark.id).join(","), from: Math.min(...times), to: Math.max(...times), language: language() }
      });
      const next = new Map(reasons.value);

      for (const [id, reason] of Object.entries(page.reasons)) next.set(Number(id), reason);

      reasons.value = next;
    } catch {
      // The line stands as it did, with no reason under it.
    }
  }

  watch(
    () => marks().filter((mark) => mark.stage === SKIPPED_STAGE && !asked.has(mark.id)),
    (due) => {
      for (const mark of due) asked.add(mark.id);

      for (let at = 0; at < due.length; at += PAGING.maxSize) void ask(due.slice(at, at + PAGING.maxSize));
    },
    { immediate: true }
  );

  return reasons;
}

/** Why the room's newest silent turn sent nothing, while the passing reason `outcome` gives is a silent turn's; none
 * before it is read, while another passing reason stands, and where that turn named nothing at all. */
export function useLatestSkipReason(chatId: number, language: () => string, outcome: () => RoomOutcome | null): Ref<SkipReason | null> {
  const reason = ref<SkipReason | null>(null) as Ref<SkipReason | null>;
  let generation = 0;

  watch(
    outcome,
    async (now) => {
      const mine = ++generation;

      reason.value = null;

      if (now?.key !== SKIPPED_OUTCOME) return;

      try {
        const read = await $fetch<LatestSkipReason>(`/api/rooms/${chatId}/skip-reasons/latest`, { query: { language: language() } });

        if (mine === generation) reason.value = read.latest?.reason ?? null;
      } catch {
        // The passing reason stands with no reason under it.
      }
    },
    { immediate: true }
  );

  return reason;
}
