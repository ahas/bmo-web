<template>
  <!-- The machine share requests (docs/web.md, 「Organisation」, the invitations tab; docs/accounts.md, 「A machine shared at an
       invitation's ask」): the asks into the company chosen that the reader may decide, standing only where one waits,
       each by the person's name, where they were invited, the machine and the accounts already on it, and when they
       asked, with approve and refuse, each done at once. -->
  <SettingsGroup v-if="shown.length > 0" :title="$t('invites.label.shares')" data-share-asks>
    <SettingsRow v-for="ask in shown" :key="ask.user" :label="ask.fullName || ask.login" data-share-ask>
      <template #description>
        <span class="break-keep text-sm text-muted">{{ placeOf(ask) }} · {{ formatStamp(ask.askedAt / 1000) }}</span>
        <span class="break-all text-sm text-toned">{{ $t("invites.label.share_machine", { machine: ask.machine }) }}</span>
        <span class="break-keep text-sm text-muted">{{ holdersLine(ask) }}</span>
      </template>
      <UButton color="neutral" variant="subtle" :label="$t('invites.action.refuse')" :loading="deciding === `${ask.user}:refuse`" :disabled="deciding !== ''" data-share-refuse @click="decide(ask, 'refuse')" />
      <UButton :label="$t('invites.action.approve')" :loading="deciding === `${ask.user}:approve`" :disabled="deciding !== ''" data-share-approve @click="decide(ask, 'approve')" />
    </SettingsRow>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";
import { formatStamp } from "bmo-ui/app/domain/time";

import { placeOf } from "~/domain/invites";

import type { ShareAskRow } from "@web/server-client";

interface Props {
  // The company the organisation screen has chosen; only asks into it stand here.
  company: { id: number; name: string };
}

const props = defineProps<Props>();

const { t } = useI18n();
const island = useIsland(t);
const asks = ref<ShareAskRow[]>([]);
// The ask being decided, as `<user>:<approve|refuse>`, so its button turns while the others wait.
const deciding = ref("");
const shown = computed(() => asks.value.filter((ask) => ask.company.id === props.company.id));

function holdersLine(ask: ShareAskRow): string {
  if (ask.holders.length === 0) return t("invites.label.share_no_holders");

  return t("invites.label.share_holders", { names: ask.holders.map((holder) => holder.fullName || holder.login).join(", ") });
}

// A read that fails leaves the list as it stood: the asks stand only where they can be decided.
async function load(): Promise<void> {
  try {
    asks.value = await $fetch<ShareAskRow[]>("/api/invites/shares");
  } catch {
    asks.value = [];
  }
}

async function decide(ask: ShareAskRow, how: "approve" | "refuse"): Promise<void> {
  const name = ask.fullName || ask.login;

  deciding.value = `${ask.user}:${how}`;
  try {
    await $fetch(`/api/invites/shares/${encodeURIComponent(ask.user)}/${how}`, { method: "POST" });
    asks.value = asks.value.filter((one) => one.user !== ask.user);
    island.say({ title: t(how === "approve" ? "invites.status.share_approved" : "invites.status.share_refused", { name }), tone: "success" });
  } catch (error) {
    island.say({ title: failureText(error, t("invites.error.failed")), tone: "error" });
    void load();
  } finally {
    deciding.value = "";
  }
}

onMounted(() => void load());
</script>
