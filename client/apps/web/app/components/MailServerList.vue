<template>
  <!-- One node's mail servers (docs/web.md, 「Organisation」, the mail servers tab): the platform's or a company's or a
       unit's, bmo-mail's records in two groups, the incoming and the outgoing, each row changed in the server form or removed,
       asked first; what the units below may do with them, saved as it is chosen; and the tab row's add opening the
       form on a new server. Where bmo-mail is not installed, one muted line and nothing else. -->
  <div class="flex flex-col gap-4" :data-mail-servers="props.link">
    <p v-if="view?.installed === false" class="text-sm text-muted" data-mail-not-installed>{{ $t("org_mail.message.not_installed") }}</p>

    <FailedRead v-else-if="view === null && failure !== ''" :message="failure" :reading="reading" data-mail-failed @retry="read" />

    <template v-else>
      <SettingsGroup v-for="group in groups" :key="group.key" :title="group.title" :data-mail-group="group.key">
        <ContentSkeleton v-if="view === null" :rows="1" list-class="flex flex-col divide-y divide-default" :label="$t('org_mail.status.loading')">
          <div class="flex items-center gap-4 py-3">
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <SkeletonLine width="w-1/3" />
              <SkeletonLine width="w-2/3" />
            </div>
            <SkeletonBar class="h-6 w-24 shrink-0 rounded-md" />
          </div>
        </ContentSkeleton>

        <template v-else>
          <SettingsRow v-if="group.servers.length === 0" :label="group.none" :data-mail-none="group.key" />
          <SettingsRow v-for="server in group.servers" :key="server.id" :label="server.name" :data-mail-server="server.name">
            <!-- A host runs on with no space in it, so it breaks where it must rather than running off a phone's side. -->
            <template #description>
              <span class="text-sm text-muted [overflow-wrap:anywhere]" data-mail-server-line>{{ serverLine($t, server, countText) }}</span>
            </template>
            <UButton color="neutral" variant="ghost" size="sm" :label="$t('org_mail.action.edit')" :disabled="busy || !changeable(server)" data-mail-edit @click="openForm(server)" />
            <UButton color="error" variant="ghost" size="sm" :label="$t('common.action.delete')" :disabled="busy || !changeable(server)" data-mail-delete @click="remove(server)" />
          </SettingsRow>
        </template>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow :label="$t('org_agents.label.below')" :description="lockLine" data-mail-below>
          <ContentSkeleton v-if="loaded === null" :rows="1" :label="$t('org_mail.status.loading')">
            <SkeletonBar class="h-8 w-40 rounded-md" />
          </ContentSkeleton>
          <ChoiceSelect
            v-else
            :model-value="loaded.delegation"
            :items="delegations"
            value-key="value"
            class="w-40"
            :loading="delegating"
            :disabled="busy || delegating || !loaded.writable"
            :aria-label="$t('org_agents.aria.delegation', { name: $t('org_mail.label.tab') })"
            data-mail-delegation
            @update:model-value="(value: unknown) => void delegate(value)"
          />
        </SettingsRow>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-mail-failure>{{ failure }}</p>
    </template>

    <MailServerDialog v-model:open="editing" :link="props.link" :server="chosen" @saved="read()" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { decidedLine } from "~/domain/chain-decided";
import { useConfirm } from "~/domain/confirm";
import { serverLine } from "~/domain/mail-servers";
import { countText } from "~/domain/numbers";

import type { MailLink, MailServerView, MailServersView } from "#shared/mail-servers";

interface Props {
  // The link of the chain whose servers are shown: the platform's, or a company's or a unit's.
  link: MailLink;
}

const props = defineProps<Props>();

const { t } = useI18n();
const confirm = useConfirm();

const view = ref<MailServersView | null>(null);
const failure = ref("");
const reading = ref(false);
const busy = ref(false);
const delegating = ref(false);
const editing = ref(false);
// The server the form is open on, null for a new one.
const chosen = ref<MailServerView | null>(null);

// The view once bmo-mail answered it, none while it is first read or where bmo-mail is not installed.
const loaded = computed(() => (view.value?.installed === true ? view.value : null));

const groups = computed(() => [
  { key: "incoming", title: t("org_mail.label.incoming"), none: t("org_mail.label.incoming_none"), servers: loaded.value?.incoming ?? [] },
  { key: "outgoing", title: t("org_mail.label.outgoing"), none: t("org_mail.label.outgoing_none"), servers: loaded.value?.outgoing ?? [] }
]);

const delegations = computed(() => [
  { value: "inherit", label: t("org_agents.label.delegation_inherit") },
  { value: "allow", label: t("org_agents.label.delegation_allow") },
  { value: "lock", label: t("org_agents.label.delegation_lock") }
]);

// Who locks the link above it, where a lock does.
const lockLine = computed(() => {
  if (loaded.value === null || loaded.value.lockedBy === null) return "";

  return decidedLine(t, loaded.value.locker) ?? t("org_agents.label.decided_unit");
});

function changeable(server: MailServerView): boolean {
  return loaded.value !== null && loaded.value.writable && server.mayChange;
}

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";
  try {
    view.value = await $fetch<MailServersView>("/api/organization/mail-servers", { query: { link: props.link } });
  } catch (error) {
    view.value = null;
    failure.value = failureText(error, t("org_mail.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

function openForm(server: MailServerView | null): void {
  chosen.value = server;
  editing.value = true;
}

async function remove(server: MailServerView): Promise<void> {
  const taken = await confirm({ title: t("org_mail.message.delete_confirm"), item: server.name, confirm: t("common.action.delete") });

  if (!taken) return;

  busy.value = true;
  failure.value = "";
  try {
    await $fetch("/api/organization/mail-servers", { method: "DELETE", query: { id: server.id } });
  } catch (error) {
    failure.value = failureText(error, t("org_mail.error.failed"));
  } finally {
    busy.value = false;
  }

  await readKeeping();
}

async function delegate(value: unknown): Promise<void> {
  if (typeof value !== "string" || loaded.value === null || value === loaded.value.delegation) return;

  delegating.value = true;
  failure.value = "";
  try {
    await $fetch("/api/organization/mail-servers", { method: "PUT", body: { link: props.link, delegation: value } });
  } catch (error) {
    failure.value = failureText(error, t("org_mail.error.failed"));
  } finally {
    delegating.value = false;
  }

  await readKeeping();
}

// Reads the node again, keeping the refusal a change was answered with.
async function readKeeping(): Promise<void> {
  const kept = failure.value;

  await read();
  if (failure.value === "") failure.value = kept;
}

// Read once the page stands in the browser, and again for another link.
onMounted(() => watch(() => props.link, () => void read(), { immediate: true }));

// The tab row's add: a new server, while the node is read and the reader may change its servers; none where bmo-mail
// is not installed.
defineExpose({
  addLabel: computed(() => (view.value?.installed === false ? null : t("org_mail.action.add"))),
  addDisabled: computed(() => busy.value || loaded.value === null || !loaded.value.writable),
  openAdd: () => openForm(null)
});
</script>
