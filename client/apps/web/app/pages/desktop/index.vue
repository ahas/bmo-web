<template>
  <!-- The desktop app's download page (docs/web.md, 「The desktop app's download page」): the current release's version
       and date, its installers by platform with Windows first, each with its size and SHA-256 to check the download
       by, and the three steps from installing to approving the app's pairing. Where no release is published the body
       says so and links nowhere. -->
  <UDashboardPanel id="desktop">
    <template #header>
      <ConsoleTitleBar :title="$t('desktop.title.page')" icon="i-material-symbols-desktop-windows-outline" />

      <!-- The screen's own row under the bar, holding the way back at its left end, since the page has no place of its
           own in the sidebar (docs/web.md, 「Sidebar」). -->
      <div :class="['flex h-12 shrink-0 items-center gap-2 px-4', TAB_ROW_LINE]" data-screen-row>
        <UTooltip :text="$t('common.action.back')">
          <UButton size="sm" square color="neutral" variant="ghost" icon="i-material-symbols-arrow-back" :aria-label="$t('common.action.back')" data-way-back @click="back" />
        </UTooltip>
      </div>
    </template>

    <template #body>
      <!-- A line that is the whole body stands in its middle: no release published, or the read failed. -->
      <div v-if="state === 'none' || state === 'failed'" class="flex min-h-full flex-col items-center justify-center gap-4 p-4 text-center" data-desktop-state>
        <p class="text-sm text-muted">{{ state === "none" ? $t("desktop.status.none") : failure }}</p>
        <UButton v-if="state === 'failed'" color="neutral" variant="subtle" icon="i-material-symbols-refresh" :loading="reading" :label="$t('common.action.refresh')" @click="read" />
      </div>

      <div v-else class="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4" :aria-busy="state === 'loading'">
        <ContentSkeleton v-if="release === null" :rows="1" :label="$t('desktop.status.loading')">
          <div class="flex flex-col gap-8">
            <div class="pair-list gap-x-4 gap-y-1">
              <SkeletonLine width="w-16" />
              <SkeletonLine width="w-24" />
              <SkeletonLine width="w-16" />
              <SkeletonLine width="w-48" />
            </div>
            <div class="flex flex-col gap-4">
              <SkeletonLine size="lg" width="w-24" />
              <div class="flex items-center justify-between gap-4">
                <SkeletonLine size="base" width="w-20" />
                <SkeletonBar class="h-8 w-24" />
              </div>
              <div class="pair-list gap-x-4 gap-y-1">
                <SkeletonLine width="w-16" />
                <SkeletonLine width="w-56" />
                <SkeletonLine width="w-16" />
                <SkeletonLine width="w-40" />
                <!-- The digest's name stands with its copy mark, a line as tall as the mark. -->
                <div class="flex h-6 items-center"><SkeletonBar class="h-4 w-20" /></div>
                <SkeletonLine width="w-full" class="self-center" />
              </div>
            </div>
          </div>
        </ContentSkeleton>

        <template v-else>
          <dl class="pair-list gap-x-4 gap-y-1 text-sm" data-desktop-release>
            <dt class="text-muted">{{ $t("desktop.label.version") }}</dt>
            <dd class="font-medium text-highlighted tabular-nums" data-desktop-version>{{ release.version }}</dd>
            <dt class="text-muted">{{ $t("desktop.label.published") }}</dt>
            <dd class="text-highlighted tabular-nums">{{ published }}</dd>
          </dl>

          <section v-for="group in platforms" :key="group.platform" class="flex flex-col gap-4" :data-desktop-platform="group.platform">
            <h2 class="text-lg font-semibold text-highlighted">{{ platformName(group.platform) }}</h2>

            <div v-for="file in group.files" :key="file.file" class="flex flex-col gap-2" :data-desktop-file="file.format">
              <div class="flex items-center justify-between gap-4">
                <h3 class="min-w-0 break-words text-base font-medium text-highlighted">{{ formatName(file) }}</h3>
                <UButton
                  :to="file.url"
                  external
                  download
                  icon="i-material-symbols-download"
                  :color="file === primary ? 'primary' : 'neutral'"
                  :variant="file === primary ? 'solid' : 'subtle'"
                  :label="$t('desktop.action.download')"
                  data-desktop-download
                />
              </div>

              <dl class="pair-list gap-x-4 gap-y-1 text-sm">
                <dt class="text-muted">{{ $t("desktop.label.file") }}</dt>
                <dd class="whitespace-nowrap font-mono text-toned">{{ file.file }}</dd>
                <dt class="text-muted">{{ $t("desktop.label.size") }}</dt>
                <dd class="text-toned tabular-nums">{{ $t("desktop.label.size_value", { size: fileSizeText(file.size), bytes: file.size.toLocaleString("ko-KR") }) }}</dd>
                <!-- The copy mark stands beside the name, so it stays in view on a phone, where the digest keeps its
                     whole width and the list scrolls sideways under it. -->
                <dt class="flex items-center gap-1 text-muted">
                  {{ $t("desktop.label.sha256") }}
                  <UTooltip :text="copied === file.file ? $t('common.status.copied') : $t('common.action.copy')">
                    <UButton
                      size="xs"
                      square
                      color="neutral"
                      variant="ghost"
                      :icon="copied === file.file ? 'i-material-symbols-check' : 'i-material-symbols-content-copy-outline'"
                      :aria-label="$t('common.action.copy')"
                      @click="copy(file)"
                    />
                  </UTooltip>
                </dt>
                <dd class="self-center whitespace-nowrap font-mono text-toned" data-desktop-sha256>{{ file.sha256 }}</dd>
              </dl>

              <UAlert v-if="file.format === 'nsis'" color="warning" variant="subtle" icon="i-material-symbols-warning-outline" :description="$t('desktop.message.unsigned')" :ui="{ description: 'whitespace-pre-line' }" data-desktop-unsigned />
            </div>
          </section>

          <section class="flex flex-col gap-4">
            <h2 class="text-lg font-semibold text-highlighted">{{ $t("desktop.label.steps") }}</h2>
            <ol class="flex list-decimal flex-col gap-2 ps-6 text-base text-toned" data-desktop-steps>
              <li>{{ $t("desktop.message.step_install") }}</li>
              <li>{{ $t("desktop.message.step_open") }}</li>
              <li>{{ $t("desktop.message.step_approve") }}</li>
            </ol>
          </section>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { copyText } from "bmo-ui/app/domain/clipboard";
import { failureText } from "bmo-ui/app/domain/errors";
import { TAB_ROW_LINE } from "bmo-ui/app/domain/tabs";
import { formatClock, formatDay } from "bmo-ui/app/domain/time";

import { fileSizeText } from "#shared/file-sizes";
import { screenKey } from "~/domain/route-key";

import type { DesktopRelease, DesktopReleaseFile, DesktopReleaseRead } from "#shared/desktop-release";

definePageMeta({ key: (route) => screenKey(route, []), member: true });

const { t } = useI18n();
const router = useRouter();

// The platforms in the order the page lists them: Windows first, then Linux, then any other by its name.
const PLATFORM_ORDER = ["windows", "linux"];
// How long a copy mark stands as a check once its value is copied.
const COPIED_MS = 1_500;

const release = ref<DesktopRelease | null>(null);
// Where the read stands: under way, read with or without a release, or failed.
const state = ref<"loading" | "read" | "none" | "failed">("loading");
const failure = ref("");
const reading = ref(false);
const copied = ref<string | null>(null);

const published = computed(() => {
  if (release.value === null) return "";

  const seconds = Date.parse(release.value.date) / 1000;

  return `${formatDay(t, seconds)} ${formatClock(seconds)}`;
});

const platforms = computed(() => {
  const files = release.value?.files ?? [];
  const names = [...new Set(files.map((file) => file.platform))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  return names.map((platform) => ({ platform, files: files.filter((file) => file.platform === platform) }));
});

// The one installer the page leads with: Windows's, else the first listed.
const primary = computed<DesktopReleaseFile | null>(() => platforms.value[0]?.files[0] ?? null);

function rank(platform: string): number {
  const at = PLATFORM_ORDER.indexOf(platform);

  return at === -1 ? PLATFORM_ORDER.length : at;
}

// The words for the platforms and the formats the release contract names today. One the pack has no word for stands by
// its own name, as the release names it: a platform by its key, an installer by its file name.
const PLATFORM_WORDS: Record<string, string> = { windows: "desktop.label.windows", linux: "desktop.label.linux" };
const FORMAT_WORDS: Record<string, string> = { nsis: "desktop.label.nsis", appimage: "desktop.label.appimage", deb: "desktop.label.deb" };

function platformName(platform: string): string {
  const key = PLATFORM_WORDS[platform];

  return key === undefined ? platform : t(key);
}

function formatName(file: DesktopReleaseFile): string {
  const key = FORMAT_WORDS[file.format];

  return key === undefined ? file.file : t(key);
}

async function read(): Promise<void> {
  reading.value = true;

  try {
    release.value = (await $fetch<DesktopReleaseRead>("/api/desktop/release")).release;
    state.value = release.value === null ? "none" : "read";
  } catch (error) {
    failure.value = failureText(error, t("desktop.error.unreadable"));
    state.value = "failed";
  } finally {
    reading.value = false;
  }
}

async function copy(file: DesktopReleaseFile): Promise<void> {
  if (!(await copyText(file.sha256))) return;

  copied.value = file.file;
  setTimeout(() => {
    if (copied.value === file.file) copied.value = null;
  }, COPIED_MS);
}

// Back to the screen the reader came from, or home where the page was opened first.
function back(): void {
  if (window.history.state?.back) router.back();
  else void navigateTo("/");
}

onMounted(() => void read());
</script>
