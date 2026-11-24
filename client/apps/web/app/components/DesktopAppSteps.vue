<template>
  <!-- The desktop app's way of connecting a person's machine (docs/web.md, 「The join page」 and 「The start guide」): the
       release's installers, the reader's own platform's first; the console's address the app asks for, with its copy
       mark; and the code from the app's title bar, which the page that holds these steps approves. Where no release is
       published, or it cannot be read, the download step says the app cannot be downloaded yet and offers nothing,
       and the other two steps still pair an app already installed. -->
  <ContentSkeleton v-if="releaseState === 'loading'" :rows="1" :label="$t('desktop.status.loading')">
    <SkeletonLine width="w-2/3" />
  </ContentSkeleton>
  <ol v-else class="flex list-decimal flex-col gap-4 ps-6">
    <li class="ps-1 marker:font-medium marker:text-highlighted" data-join-step-download><div class="flex flex-col gap-2">
      <span class="flex flex-wrap items-center gap-2 font-medium text-highlighted">
        {{ $t("join.label.step_download") }}
        <UBadge v-if="installers.length > 0 && release?.channel === 'preview'" color="warning" variant="subtle" size="sm" :label="`${$t('desktop.label.preview')} ${release.version}`" data-join-preview />
      </span>
      <p v-if="installers.length === 0" class="whitespace-pre-line break-keep text-sm text-toned" data-join-desktop-unavailable>{{ unavailable ?? $t("join.message.desktop_unavailable") }}</p>
      <p v-else class="break-keep text-sm text-toned">{{ $t("join.message.desktop_download") }}</p>
      <div v-if="installers.length > 0" class="flex flex-wrap gap-2">
        <UButton
          v-for="file in installers"
          :key="file.file"
          :to="file.url"
          external
          download
          icon="i-material-symbols-download"
          :color="file.platform === platform ? 'primary' : 'neutral'"
          :variant="file.platform === platform ? 'solid' : 'subtle'"
          :label="$t('join.label.installer', { platform: platformName(file.platform), format: formatName(file) })"
          :data-join-download="file.platform"
        />
      </div>
    </div></li>
    <li class="ps-1 marker:font-medium marker:text-highlighted"><div class="flex flex-col gap-2">
      <span class="font-medium text-highlighted">{{ $t("join.label.step_open") }}</span>
      <p class="break-keep text-sm text-toned">{{ $t("join.message.desktop_open") }}</p>
      <div class="flex items-start gap-2">
        <code class="min-w-0 flex-1 break-all rounded-md bg-elevated p-2 text-sm" data-join-server>{{ serverAddress }}</code>
        <IconButton
          :icon="copied ? 'i-material-symbols-check' : 'i-material-symbols-content-copy-outline'"
          :label="copied ? $t('invites.status.copied') : $t('join.action.copy')"
          data-server-copy
          @click="void copy()"
        />
      </div>
    </div></li>
    <li class="ps-1 marker:font-medium marker:text-highlighted"><div class="flex flex-col gap-2">
      <span class="font-medium text-highlighted">{{ $t("join.label.step_code") }}</span>
      <template v-if="!approved">
        <p class="break-keep text-sm text-toned">{{ $t("join.message.desktop_code") }}</p>
        <UForm :id="formId" :state="pairForm" class="flex items-start gap-2" @submit="submit">
          <UFormField name="code" :error="codeFailure || emptyFailure || undefined" class="min-w-0 flex-1">
            <UInput v-model="pairForm.code" class="w-full" :aria-label="$t('pairing.label.code')" autocomplete="off" autocapitalize="characters" spellcheck="false" :ui="{ base: 'font-mono uppercase' }" data-join-code />
          </UFormField>
          <UButton type="submit" :label="$t('join.action.connect')" :loading="pairing" data-join-connect />
        </UForm>
      </template>
      <p v-else class="text-sm text-toned" data-join-approved>{{ $t("join.message.desktop_connecting") }}</p>
    </div></li>
  </ol>
</template>

<script setup lang="ts">
import { useIsland } from "bmo-ui/app/domain/island";

import { copyText } from "~/domain/copy";
import { installersFor, readerPlatform, typedCode } from "~/domain/join-desktop";

import type { DesktopRelease, DesktopReleaseFile, DesktopReleaseRead } from "#shared/desktop-release";

interface Props {
  // Whether the code was approved, from which the holder waits for the app to attach.
  approved: boolean;
  // Whether an approval is under way.
  pairing: boolean;
  // A refusal of the code, said under the field.
  codeFailure: string;
  // The id of the code's form.
  formId: string;
  // What the download step says where the app cannot be downloaded yet, the join page's sentence where none is given.
  unavailable?: string;
  // The address the app asks for, where the page holding these steps names it.
  address?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  // A code typed, read in either case with or without its hyphen.
  pair: [code: string];
  // Whether a release stands to download, once it has been read.
  release: [available: boolean];
}>();

const { t } = useI18n();
const island = useIsland(t);

const release = ref<DesktopRelease | null>(null);
const releaseState = ref<"loading" | "read">("loading");
// The platform the reader's browser names, whose installer leads.
const platform = ref<string | null>(null);
const installers = computed(() => (release.value === null ? [] : installersFor(release.value, platform.value)));
// The address the app asks for: the console's public address, else the address the page was reached at.
const { baseURL } = useRuntimeConfig().app;
const ownAddress = ref(String(useRuntimeConfig().public.consoleAddress ?? "").trim());
const serverAddress = computed(() => (props.address !== undefined && props.address !== "" ? props.address : ownAddress.value));
const copied = ref(false);
const pairForm = reactive({ code: "" });
const emptyFailure = ref("");

// The words for the platforms and the formats the release contract names; one the pack has no word for stands by its
// own name, a platform by its key and an installer by its file name.
const PLATFORM_WORDS: Record<string, string> = { windows: "desktop.label.windows", linux: "desktop.label.linux" };
const FORMAT_WORDS: Record<string, string> = { nsis: "desktop.label.nsis", appimage: "desktop.label.appimage", deb: "desktop.label.deb" };

function platformName(name: string): string {
  const key = PLATFORM_WORDS[name];

  return key === undefined ? name : t(key);
}

function formatName(file: DesktopReleaseFile): string {
  const key = FORMAT_WORDS[file.format];

  return key === undefined ? file.file : t(key);
}

// The release read with no sign-in; none published, or a read that fails, leaves the desktop app unavailable.
async function readRelease(): Promise<void> {
  try {
    release.value = (await $fetch<DesktopReleaseRead>("/api/desktop/release")).release;
  } catch {
    release.value = null;
  }
  releaseState.value = "read";
  emit("release", installers.value.length > 0);
}

function submit(): void {
  const code = typedCode(pairForm.code);

  emptyFailure.value = code === "" ? t("join.error.code_empty") : "";
  if (code !== "") emit("pair", code);
}

// The address copied carries a check in place of its copy mark; a copy the browser refuses says so on the island.
async function copy(): Promise<void> {
  copied.value = await copyText(serverAddress.value);
  if (!copied.value) island.say({ title: t("common.error.copy_failed"), tone: "error" });
}

watch(
  () => props.approved,
  (approved) => {
    if (approved) pairForm.code = "";
  }
);

onMounted(() => {
  platform.value = readerPlatform(navigator.userAgent);
  if (ownAddress.value === "") ownAddress.value = `${location.origin}${baseURL}`;
  void readRelease();
});
</script>
