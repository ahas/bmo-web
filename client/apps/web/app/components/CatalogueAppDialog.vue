<template>
  <!-- One shared app's details (docs/web.md, 「App catalogue」): what it is and who made it, what it asks for, its review
       report and its source, and what the reader may do with it — install, update, delete and clone their copy, turn
       it on for a unit they head or recall it there, withdraw it, approve it and put it forward as a platform app.
       Every act that changes what runs on a PC is asked first. -->
  <SettingsDialog v-model:open="open" :title="props.app.title" wide>
    <div class="flex flex-col gap-6" data-catalogue-dialog>
      <p v-if="props.app.description" class="break-keep break-words text-sm text-default">{{ props.app.description }}</p>

      <div class="flex items-start justify-between gap-4">
        <PropertyList :rows="properties" class="min-w-0 flex-1" data-catalogue-properties />
        <UDropdownMenu v-if="menu.length > 0" :items="menu" :content="{ align: 'end' }">
          <UTooltip :text="$t('common.aria.menu_of', { name: props.app.title })">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-more-vert"
              :loading="busy !== null && SECONDARY.includes(busy)"
              :aria-label="$t('common.aria.menu_of', { name: props.app.title })"
              data-catalogue-menu
            />
          </UTooltip>
        </UDropdownMenu>
      </div>

      <p v-if="refusal !== ''" role="alert" class="text-sm text-error" data-catalogue-refusal>{{ refusal }}</p>

      <SettingsGroup v-if="units.length > 0" :title="$t('app_catalogue.title.unit')" data-catalogue-units>
        <SettingsRow v-if="mayTurnOn" :label="$t('app_catalogue.label.lock')">
          <USwitch v-model="lock" :aria-label="$t('app_catalogue.label.lock')" data-catalogue-lock />
        </SettingsRow>
        <SettingsRow :label="$t('app_catalogue.label.unit')">
          <ChoiceSelect v-model="unit" :items="units" value-key="value" size="sm" class="w-40" :aria-label="$t('app_catalogue.label.unit')" data-catalogue-unit />
          <IconButton
            v-if="mayTurnOn"
            size="sm"
            icon="i-material-symbols-toggle-on-outline"
            :label="$t('app_catalogue.action.turn_on')"
            :loading="busy === 'unit-on'"
            :disabled="busy !== null"
            data-catalogue-unit-on
            @click="void switchUnit(true)"
          />
          <IconButton
            v-if="mayTurnOn"
            size="sm"
            icon="i-material-symbols-toggle-off-outline"
            :label="$t('app_catalogue.action.turn_off')"
            :loading="busy === 'unit-off'"
            :disabled="busy !== null"
            data-catalogue-unit-off
            @click="void switchUnit(false)"
          />
          <IconButton
            v-if="mayRecall"
            size="sm"
            color="error"
            icon="i-material-symbols-block"
            :label="$t('app_catalogue.action.recall')"
            :loading="busy === 'recall'"
            :disabled="busy !== null"
            data-catalogue-recall
            @click="void recall()"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="$t('app_catalogue.label.permissions')" data-catalogue-permissions>
        <AppPermissionList :permissions="props.app.permissions" :reach="props.catalogue.reach" class="py-3" />
      </SettingsGroup>

      <SettingsGroup :title="$t('app_catalogue.label.review')" data-catalogue-review>
        <p class="whitespace-pre-line break-keep break-words py-3 text-sm" :class="props.app.review.state === 'written' ? 'text-default' : 'text-muted'" data-catalogue-review-text>
          {{ reviewText }}
        </p>
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
import { ASKED_ACTS, personName, sourceBlock } from "~/domain/app-catalogue";
import { permissionText } from "~/domain/app-permissions";

import { linkUnit } from "#shared/app-catalogue";

import type { Catalogue, CatalogueApp, CatalogueSource, CatalogueTarget } from "#shared/app-catalogue";

interface Props {
  app: CatalogueApp;
  catalogue: Catalogue;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ changed: [app: CatalogueApp] }>();
const { t } = useI18n();
const confirm = useConfirm();

const busy = ref<string | null>(null);

// The acts the menu holds, which its button spins for while one goes.
const SECONDARY: readonly string[] = ["clone", "uninstall", "approve", "promote", "withdraw"];
const refusal = ref("");
const source = ref<CatalogueSource | null>(null);
const lock = ref(false);

// The units the reader heads on their path, by the links the agency names them by.
const units = computed(() => {
  const links = [...new Set([...props.app.may.turnOn, ...props.app.may.recall])];

  return links.flatMap((link) => {
    const id = linkUnit(link);

    return id === null ? [] : [{ value: id, label: props.catalogue.units[String(id)] ?? String(id) }];
  });
});
const unit = ref<number | null>(null);

watch(units, (now) => (unit.value = unit.value !== null && now.some((one) => one.value === unit.value) ? unit.value : (now.at(-1)?.value ?? null)), { immediate: true });

const mayTurnOn = computed(() => unit.value !== null && props.app.may.turnOn.includes(`unit:${unit.value}`));
const mayRecall = computed(() => unit.value !== null && props.app.may.recall.includes(`unit:${unit.value}`));

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

// What an install or an update asks for and what its review says, said in the question.
function asksEffect(effect: string): string {
  return [t("app_catalogue.label.permissions"), permissionText(t, props.app.permissions, props.catalogue.reach), "", effect].join("\n");
}

async function install(): Promise<void> {
  const asked = { title: t("app_catalogue.title.install"), item: props.app.title, effect: asksEffect(t("app_catalogue.message.install_effect")), confirm: t("app_catalogue.action.install") };

  if (await confirm(asked)) await act("install");
}

async function update(): Promise<void> {
  const effect = props.app.permissionsGrown ? t("app_catalogue.message.update_grown") : t("app_catalogue.message.update_effect");

  if (await confirm({ title: t("app_catalogue.title.update"), item: props.app.title, effect: asksEffect(effect), confirm: t("app_catalogue.action.update") })) await act("update");
}

// A clone, a delete, a withdrawal and a request to make it a platform app, each asked first.
async function simple(kind: keyof typeof ASKED_ACTS): Promise<void> {
  const asked = ASKED_ACTS[kind];

  if (!(await confirm({ title: t(asked.title), item: props.app.title, effect: t(asked.effect), confirm: t(asked.confirm) }))) return;

  if (kind === "uninstall") await act("uninstall", {}, "install", "DELETE");
  else await act(kind);
}

async function switchUnit(on: boolean): Promise<void> {
  if (unit.value === null) return;

  await act(on ? "unit-on" : "unit-off", { on, lock: on && lock.value }, `units/${unit.value}`);
}

async function recall(): Promise<void> {
  if (unit.value === null) return;

  const name = units.value.find((one) => one.value === unit.value)?.label ?? "";

  if (await confirm({ title: t("app_catalogue.title.recall"), item: `${props.app.title} · ${name}`, effect: t("app_catalogue.message.recall_effect"), confirm: t("app_catalogue.action.recall") })) {
    await act("recall", { unit: unit.value });
  }
}
</script>
