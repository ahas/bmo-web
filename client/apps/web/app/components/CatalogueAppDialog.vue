<template>
  <!-- One shared item's details (docs/web.md, 「App catalogue」): what it is and who made it, what it asks for — an
       app's and an MCP server's reach, a skill's none — how an MCP server connects, its review report and its source,
       and what the reader may do with it — install, update, delete and clone their copy, withdraw it, approve it, fill
       its other languages and put it forward as a platform app, and for a head the way to the unit's apps tab. Every
       act that changes what the reader holds is asked first. Its text stands in the reader's language where the item
       carries it, else read through the translator on view, its title following its description's line. -->
  <SettingsDialog v-model:open="open" :title="shownTitle" wide>
    <div class="flex flex-col gap-6" :data-catalogue-dialog="props.app.kind">
      <div v-if="shown.description !== '' || shown.machine" class="flex min-w-0 flex-col gap-1" data-catalogue-description>
        <TranslatedText v-if="!shown.own && shown.description !== ''" :text="shown.description" text-class="break-keep text-sm text-default" @shown="described = $event" />
        <p v-else-if="shown.description !== ''" class="break-keep break-words text-sm text-default">{{ shown.description }}</p>
        <p v-if="shown.machine" class="flex items-center gap-1 text-sm text-muted" data-catalogue-machine>
          <UIcon name="i-material-symbols-translate" class="size-4 shrink-0" />
          <span>{{ $t("app_catalogue.label.machine") }}</span>
        </p>
      </div>

      <div class="flex items-start justify-between gap-4">
        <PropertyList :rows="properties" class="min-w-0 flex-1" data-catalogue-properties />
        <UDropdownMenu v-if="menu.length > 0" :items="menu" :content="{ align: 'end' }">
          <UTooltip :text="$t('common.aria.menu_of', { name: shownTitle })">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-more-vert"
              :loading="busy !== null && SECONDARY.includes(busy)"
              :aria-label="$t('common.aria.menu_of', { name: shownTitle })"
              data-catalogue-menu
            />
          </UTooltip>
        </UDropdownMenu>
      </div>

      <p v-if="refusal !== ''" role="alert" class="text-sm text-error" data-catalogue-refusal>{{ refusal }}</p>

      <!-- A head turns the app on, locks it and recalls it for a unit on the organisation screen's apps tab, like every
           other app: a door to the nearest unit they head on their path. -->
      <SettingsGroup v-if="nearest !== null" :title="$t('app_catalogue.title.unit')" data-catalogue-units>
        <SettingsRow :label="nearest.label" :description="$t('app_catalogue.label.unit_door')">
          <UButton color="neutral" variant="outline" trailing-icon="i-material-symbols-arrow-forward" :label="$t('common.action.open')" :to="unitAddress" data-catalogue-unit-door @click="open = false" />
        </SettingsRow>
      </SettingsGroup>

      <!-- How an MCP server connects: an address the reader's agents reach with the secret their own secret space holds
           by its name, or a program run on the reader's PC. -->
      <SettingsGroup v-if="props.app.kind === 'mcp'" :title="$t('app_catalogue.label.connection')" data-catalogue-connection>
        <ContentSkeleton v-if="connection === undefined" :rows="2" listClass="flex flex-col gap-2 py-3" :label="$t('app_catalogue.status.loading')">
          <SkeletonLine width="w-1/2" />
        </ContentSkeleton>
        <p v-else-if="connection === null" class="py-3 text-sm text-muted" data-catalogue-connection-none>{{ $t("app_catalogue.label.connection_unread") }}</p>
        <PropertyList v-else :rows="connectionRows" class="py-3" />
        <p v-if="missingSecret !== null" class="pb-3 text-sm text-warning" data-catalogue-connection-missing>
          {{ $t("app_permissions.label.secrets_missing") }}
          <span class="ms-1 font-mono">{{ missingSecret }}</span>
        </p>
      </SettingsGroup>

      <SettingsGroup :title="$t('app_catalogue.label.permissions')" data-catalogue-permissions>
        <ul v-if="props.app.kind === 'skill'" class="flex min-w-0 flex-col gap-1 py-3 text-sm" data-app-permissions>
          <li class="text-default" data-app-permission="none">{{ $t("app_catalogue.label.skill_permissions") }}</li>
          <li class="break-keep text-muted" data-app-permission="none-note">{{ $t("app_catalogue.label.skill_permissions_note") }}</li>
        </ul>
        <AppPermissionList v-else :permissions="props.app.permissions" :reach="props.catalogue.reach" class="py-3" />
      </SettingsGroup>

      <SettingsGroup :title="$t('app_catalogue.label.review')" data-catalogue-review>
        <div class="min-w-0 py-3" data-catalogue-review-text>
          <TranslatedText v-if="props.app.review.state === 'written'" :text="reviewText" kind="document" text-class="break-words text-sm" />
          <p v-else class="whitespace-pre-line break-keep break-words text-sm text-muted">{{ reviewText }}</p>
        </div>
      </SettingsGroup>

      <SettingsGroup :title="$t('app_catalogue.label.source')" data-catalogue-source>
        <div v-if="source === null" class="flex items-center justify-start py-3">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-material-symbols-code"
            :label="$t('app_catalogue.action.source')"
            :loading="busy === 'source'"
            :disabled="busy !== null"
            data-catalogue-source-open
            @click="void readSource()"
          />
        </div>
        <div v-else class="flex min-w-0 flex-col gap-4 py-3">
          <div v-for="(text, path) in source.files" :key="path" class="flex min-w-0 flex-col gap-2" :data-catalogue-file="path">
            <span class="font-mono text-sm text-highlighted">{{ path }}</span>
            <MarkdownText :text="sourceBlock(String(path), text)" class="min-w-0 overflow-x-auto" />
          </div>
        </div>
      </SettingsGroup>
    </div>

    <template v-if="props.app.may.install || props.app.may.update" #footer>
      <UButton v-if="props.app.may.install" :label="$t('app_catalogue.action.install')" :loading="busy === 'install'" :disabled="busy !== null" data-catalogue-install @click="void install()" />
      <UButton v-else :label="$t('app_catalogue.action.update')" :loading="busy === 'update'" :disabled="busy !== null" data-catalogue-update @click="void update()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import { useConfirm } from "~/domain/confirm";
import { ASKED_ACTS, KIND_ASKS, KIND_WORDS, personName, shownText, sourceBlock } from "~/domain/app-catalogue";
import { permissionText } from "~/domain/app-permissions";
import { useAutoTranslate, useFollowedReading } from "~/domain/text-reading";

import { linkUnit } from "#shared/app-catalogue";

import type { Catalogue, CatalogueApp, CatalogueConnection, CatalogueSource, CatalogueTarget } from "#shared/app-catalogue";

interface Props {
  app: CatalogueApp;
  catalogue: Catalogue;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ changed: [app: CatalogueApp] }>();
const { t, locale } = useI18n();
const confirm = useConfirm();

const busy = ref<string | null>(null);

// The acts the menu holds, which its button spins for while one goes.
const SECONDARY: readonly string[] = ["clone", "uninstall", "approve", "promote", "withdraw", "translate"];
const refusal = ref("");
const source = ref<CatalogueSource | null>(null);

// The item's text as the reader's locale reads it; where it is the maker's in another language, the title follows the
// description's line into the reader's language, or the browser's own reading where there is no description to carry it.
const shown = computed(() => shownText(props.app, locale.value));
const auto = useAutoTranslate();
const described = ref(false);
const followedTitle = useFollowedReading(
  () => props.app.title,
  () => !shown.value.own && (shown.value.description === "" ? auto.value : described.value)
);
const shownTitle = computed(() => (shown.value.own ? shown.value.title : followedTitle.value));

// How an MCP item connects, read as its details open: undefined while it is read, null where it reads as none.
const connection = ref<CatalogueConnection | null | undefined>(undefined);

async function readConnection(): Promise<void> {
  connection.value = undefined;

  try {
    connection.value = await $fetch<CatalogueConnection | null>(`/api/account/app-catalogue/${props.app.id}/connection`, { query: { company: props.catalogue.company } });
  } catch {
    connection.value = null;
  }
}

watch(
  () => [open.value, props.app.id, props.app.version] as const,
  ([standing]) => {
    if (standing && props.app.kind === "mcp") void readConnection();
  },
  { immediate: true }
);

const AUTH_WORDS: Readonly<Record<"none" | "bearer" | "header", string>> = {
  none: "app_catalogue.label.auth_none",
  bearer: "app_catalogue.label.auth_bearer",
  header: "app_catalogue.label.auth_header"
};

const connectionRows = computed(() => {
  const held = connection.value;

  if (held === null || held === undefined) return [];
  if (held.transport === "local") {
    return [
      { label: t("app_catalogue.label.transport"), value: t("app_catalogue.label.transport_local") },
      { label: t("app_catalogue.label.command"), value: held.command.join(" "), mono: true }
    ];
  }

  return [
    { label: t("app_catalogue.label.transport"), value: t("app_catalogue.label.transport_remote") },
    { label: t("app_catalogue.label.address"), value: held.url, mono: true },
    { label: t("app_catalogue.label.auth"), value: t(AUTH_WORDS[held.auth], { header: held.header ?? "" }) },
    ...(held.secret === null ? [] : [{ label: t("app_catalogue.label.secret"), value: held.secret, mono: true }])
  ];
});

// The secret a remote MCP item reads that the reader's own secret space does not hold.
const missingSecret = computed(() => {
  const held = connection.value;

  return held?.transport === "remote" && held.secret !== null && !props.catalogue.reach.held.includes(held.secret) ? held.secret : null;
});

// The units the reader heads on their path, by the links the agency names them by.
const units = computed(() => {
  const links = [...new Set([...props.app.may.turnOn, ...props.app.may.recall])];

  return links.flatMap((link) => {
    const id = linkUnit(link);

    return id === null ? [] : [{ value: id, label: props.catalogue.units[String(id)] ?? String(id) }];
  });
});
// The nearest of them, which the door leads to, and the organisation screen's apps tab at it.
const nearest = computed(() => units.value.at(-1) ?? null);
const unitAddress = computed(() => {
  const company = props.catalogue.company;
  const unit = nearest.value === null || String(nearest.value.value) === company ? {} : { unit: String(nearest.value.value) };

  return { path: "/organization", query: { company, ...unit, tab: "apps" } };
});

// Whom a target names, in words.
function targetWord(target: CatalogueTarget): string {
  if ("team" in target) return t("app_catalogue.label.scope_team");
  if ("heads" in target) return t("app_catalogue.label.scope_heads");
  if ("company" in target) return t("app_catalogue.label.scope_company");
  if ("person" in target) return personName(props.catalogue, String(target.person));

  return t("app_catalogue.label.scope_direct");
}

const properties = computed(() => {
  const latest = props.app.versions.at(-1);

  return [
    { label: t("app_catalogue.label.kind"), value: t(KIND_WORDS[props.app.kind]) },
    { label: t("app_catalogue.label.maker"), value: personName(props.catalogue, props.app.maker) },
    { label: t("app_catalogue.label.version"), value: props.app.version, mono: true },
    ...(latest ? [{ label: t("app_catalogue.label.shared"), value: formatStamp(Math.floor(latest.sharedAt / 1000)) }] : []),
    { label: t("app_catalogue.label.installs"), value: t("app_catalogue.label.installs_count", { count: props.app.installs.toLocaleString() }) },
    { label: t("app_catalogue.label.targets"), value: props.app.targets.map(targetWord).join(", ") }
  ];
});

// The acts beside the install and the update, in a menu of their own: those the agency lets the reader take.
const menu = computed(() => {
  const may = props.app.may;
  const item = (shown: boolean, label: string, icon: string, act: () => void, color?: "error") => (shown ? [{ label, icon, color, onSelect: act }] : []);

  return [
    ...item(may.approve, t("app_catalogue.action.approve"), "i-material-symbols-check-circle-outline", () => void act("approve", { version: props.app.version })),
    ...item(may.clone, t("app_catalogue.action.clone"), "i-material-symbols-content-copy-outline", () => void simple("clone")),
    ...item(may.translate, t("app_catalogue.action.translate"), "i-material-symbols-translate", () => void act("translate")),
    ...item(may.promote && props.app.promotion === null, t("app_catalogue.action.promote"), "i-material-symbols-rocket-launch-outline", () => void simple("promote")),
    ...item(may.uninstall, t("common.action.delete"), "i-material-symbols-delete-outline", () => void simple("uninstall"), "error"),
    ...item(may.withdraw, t("app_catalogue.action.withdraw"), "i-material-symbols-block", () => void simple("withdraw"), "error")
  ];
});

const reviewText = computed(() => {
  if (props.app.review.state === "written") return props.app.review.report ?? "";
  if (props.app.review.state === "failed") return t("app_catalogue.label.review_failed");

  return t("app_catalogue.label.review_pending");
});

// The source of the app's newest version, read once it is asked for.
async function readSource(): Promise<void> {
  busy.value = "source";
  refusal.value = "";

  try {
    source.value = await $fetch<CatalogueSource>(`/api/account/app-catalogue/${props.app.id}/source`, { query: { company: props.catalogue.company } });
  } catch (error) {
    refusal.value = failureText(error, t("app_catalogue.error.source_failed"));
  } finally {
    busy.value = null;
  }
}

// One act on the app, the app as the agency then answers it handed up; a refusal is said in the dialog.
async function act(kind: string, body: Record<string, unknown> = {}, path = kind, method: "POST" | "DELETE" = "POST"): Promise<void> {
  busy.value = kind;
  refusal.value = "";

  try {
    // The company the catalogue was read in, which the console's server hands on for the administrator alone.
    const query = { company: props.catalogue.company };

    emit("changed", await $fetch<CatalogueApp>(`/api/account/app-catalogue/${props.app.id}/${path}`, { method, query, body: method === "POST" ? body : undefined }));
  } catch (error) {
    refusal.value = failureText(error, t("app_catalogue.error.act_failed"));
  } finally {
    busy.value = null;
  }
}

// What an install or an update asks for and what it does, said in the question: an app's and an MCP server's reach,
// and a skill's none.
function asksEffect(effect: string): string {
  const permissions = props.app.kind === "skill" ? t("app_catalogue.label.skill_permissions") : permissionText(t, props.app.permissions, props.catalogue.reach);

  return [t("app_catalogue.label.permissions"), permissions, "", effect].join("\n");
}

async function install(): Promise<void> {
  const asks = KIND_ASKS[props.app.kind];
  const asked = { title: t(asks.install), item: shownTitle.value, effect: asksEffect(t(asks.installEffect)), confirm: t("app_catalogue.action.install") };

  if (await confirm(asked)) await act("install");
}

async function update(): Promise<void> {
  const effect = props.app.permissionsGrown ? t("app_catalogue.message.update_grown") : t("app_catalogue.message.update_effect");
  const asked = { title: t(KIND_ASKS[props.app.kind].update), item: shownTitle.value, effect: asksEffect(effect), confirm: t("app_catalogue.action.update") };

  if (await confirm(asked)) await act("update");
}

// A clone, a delete, a withdrawal and a request to make it a platform app, each asked first.
async function simple(kind: keyof typeof ASKED_ACTS): Promise<void> {
  const asked = ASKED_ACTS[kind];

  if (!(await confirm({ title: t(asked.title), item: shownTitle.value, effect: t(asked.effect), confirm: t(asked.confirm) }))) return;

  if (kind === "uninstall") await act("uninstall", {}, "install", "DELETE");
  else await act(kind);
}
</script>
