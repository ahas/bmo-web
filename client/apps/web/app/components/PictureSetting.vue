<template>
  <!-- One picture the console sets (docs/web.md, 「Profile photos」, a picture set in the console): the one standing
       now, a file picked and shown in its place until it is saved or let go, and the way back to the provider's.
       What it saves goes to the receiver's kept pictures through the console's relay. -->
  <div class="flex min-w-0 items-center gap-4" :data-picture-setting="props.kind">
    <UAvatar v-bind="shown" size="3xl" class="shrink-0" />

    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <p v-if="picked !== null" class="text-sm text-muted">{{ $t("picture.label.preview_note") }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="picked === null">
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-material-symbols-add-photo-alternate-outline"
            :label="$t('picture.action.choose')"
            :disabled="busy !== null"
            data-picture-choose
            @click="chooser?.click()"
          />
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-material-symbols-undo"
            :label="$t('picture.action.clear')"
            :loading="busy === 'clear'"
            :disabled="busy !== null"
            data-picture-clear
            @click="clear"
          />
        </template>
        <template v-else>
          <UButton size="sm" icon="i-material-symbols-check" :label="$t('common.action.save')" :loading="busy === 'save'" :disabled="busy !== null" data-picture-save @click="save" />
          <UButton size="sm" color="neutral" variant="ghost" :label="$t('common.action.cancel')" :disabled="busy !== null" @click="letGo" />
        </template>
      </div>
      <p v-if="said !== ''" role="status" class="text-sm text-muted">{{ said }}</p>
      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </div>

    <!-- The picker this section's own key opens, never drawn: the native attribute, which the console's own
         rule holds hidden against a unit bundle's styles (docs/web.md, 「Screens a unit brings」). -->
    <input ref="chooser" type="file" accept="image/*" hidden :aria-label="$t('picture.action.choose')" @change="pick" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { pictureRoute, refusalKey } from "~/domain/picture-setting";

import type { PictureKind } from "~/domain/picture-setting";
import type { AvatarProps } from "@nuxt/ui";

interface Props {
  kind: PictureKind;
  // The room's or the person's number, or the agent's registration name.
  subject: number | string;
  // The picture standing now, or the letter where none stands.
  avatar: AvatarProps;
}

const props = defineProps<Props>();
const { t } = useI18n();

const chooser = useTemplateRef<HTMLInputElement>("chooser");
const picked = ref<File | null>(null);
const previewSrc = ref<string | null>(null);
const busy = ref<"save" | "clear" | null>(null);
const said = ref("");
const failure = ref("");

const shown = computed<AvatarProps>(() => (previewSrc.value === null ? props.avatar : { ...props.avatar, src: previewSrc.value }));

function release(): void {
  if (previewSrc.value !== null) URL.revokeObjectURL(previewSrc.value);

  previewSrc.value = null;
}

function pick(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;

  input.value = "";

  if (file === null) return;

  release();
  picked.value = file;
  previewSrc.value = URL.createObjectURL(file);
  said.value = "";
  failure.value = "";
}

function letGo(): void {
  picked.value = null;
  release();
}

// The receiver's refusal in the pack's words for its code, and the section's own sentence otherwise.
function refused(error: unknown): string {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
  const key = refusalKey(typeof code === "string" ? code : null);

  return key === null ? failureText(error, t("picture.error.failed")) : t(key);
}

// Every screen reads its pictures again, this one at once; the others as the receiver tells of the change.
async function reread(): Promise<void> {
  await refreshNuxtData(["avatars", "agent-faces"]);
}

async function save(): Promise<void> {
  if (picked.value === null) return;

  const form = new FormData();

  form.append("picture", picked.value);
  busy.value = "save";
  failure.value = "";

  try {
    await $fetch(pictureRoute(props.kind, props.subject), { method: "PUT", body: form });
    await reread();
    letGo();
    said.value = t("picture.message.saved");
  } catch (error) {
    failure.value = refused(error);
  } finally {
    busy.value = null;
  }
}

async function clear(): Promise<void> {
  busy.value = "clear";
  failure.value = "";
  said.value = "";

  try {
    await $fetch(pictureRoute(props.kind, props.subject), { method: "DELETE" });
    await reread();
    said.value = t("picture.message.cleared");
  } catch (error) {
    failure.value = refused(error);
  } finally {
    busy.value = null;
  }
}

onBeforeUnmount(release);
</script>
