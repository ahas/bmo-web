<template>
  <!-- The settings (docs/web.md, 「Settings」): one large dialog over whatever screen is open, the list
       of sections in a column at its left and the open section beside it, its content scrolling under
       its name. On a narrow screen the dialog fills the screen and holds the list alone, and a section
       gone into stands over it as a sheet of its own, so the back gesture returns to the list before
       it closes the dialog; filling the screen, the sheet stands and goes at once. Everything in it takes effect as it is changed, so it closes at once. -->
  <UModal :key="openings" v-model:open="open" :title="$t('settings.title.settings')" :fullscreen="narrow" :content="DIALOG" :ui="{ content: narrow ? '' : SIZE }">
    <template #content="{ close }">
      <div v-if="narrow" class="flex h-full min-h-0 flex-col">
        <div class="flex h-14 shrink-0 items-center gap-2 px-4">
          <h2 class="min-w-0 flex-1 truncate ps-2.5 text-lg font-semibold text-highlighted">{{ $t("settings.title.settings") }}</h2>
          <ShellClose @close="close()" />
        </div>

        <div ref="listBody" tabindex="-1" class="min-h-0 flex-1 overflow-y-auto px-4 pb-4 outline-none">
          <UNavigationMenu :items="listItems" orientation="vertical" />
        </div>

        <USlideover v-model:open="entered" side="right" :overlay="false" :transition="false" :title="sectionLabel" :content="SHEET" :ui="{ content: 'max-w-none' }">
          <template #content>
            <div class="flex h-full min-h-0 flex-col">
              <div class="flex h-14 shrink-0 items-center gap-2 px-4">
                <UTooltip :text="$t('settings.action.back')">
                  <UButton color="neutral" variant="ghost" icon="i-material-symbols-arrow-back" :aria-label="$t('settings.action.back')" @click="entered = false" />
                </UTooltip>
                <h2 class="min-w-0 flex-1 truncate text-lg font-semibold text-highlighted">{{ sectionLabel }}</h2>
                <ShellClose @close="close()" />
              </div>

              <div ref="sheetBody" tabindex="-1" class="min-h-0 flex-1 overflow-y-auto px-4 pb-4 outline-none">
                <component :is="sectionComponent" />
              </div>
            </div>
          </template>
        </USlideover>
      </div>

      <div v-else class="flex h-full min-h-0">
        <nav class="flex w-56 shrink-0 flex-col gap-2 overflow-y-auto border-e border-default p-4" :aria-label="$t('settings.title.settings')">
          <h2 class="flex h-8 items-center px-2.5 text-lg font-semibold text-highlighted">{{ $t("settings.title.settings") }}</h2>
          <UNavigationMenu :items="listItems" orientation="vertical" />
        </nav>

        <div class="flex min-w-0 flex-1 flex-col">
          <div class="flex h-16 shrink-0 items-center gap-2 px-4">
            <h2 class="min-w-0 flex-1 truncate text-lg font-semibold text-highlighted">{{ sectionLabel }}</h2>
            <ShellClose @close="close()" />
          </div>

          <div ref="sectionBody" tabindex="-1" class="min-h-0 flex-1 overflow-y-auto px-4 pb-4 outline-none">
            <component :is="sectionComponent" />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useAdministrator, useSignedUser } from "~/domain/access";
import { useOpenings } from "bmo-ui/app/domain/openings";
import { organizationAddress, organizationMovedAway, organizationTabNamed } from "~/domain/organization";
import { SETTINGS_SECTIONS, openSettings, sectionOf, sectionsFor, settingsAsked, useSettings } from "~/domain/settings-dialog";
import { useNarrow } from "bmo-ui/app/domain/screen";

import type { NavigationMenuItem } from "@nuxt/ui";
import type { Component } from "vue";

// Wide enough for the list beside a section whose rows hold a name and a control side by side, and
// one height whichever section is open, so moving between them does not move the dialog's edges.
const SIZE = "sm:max-w-4xl h-[min(44rem,calc(var(--bmo-screen)-var(--bmo-safe-top)-var(--bmo-safe-bottom)-4rem))]";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const administrator = useAdministrator();
const signedUser = useSignedUser();
const narrow = useNarrow();
const state = useSettings();

// What the dialog and a section gone into hand the focus to as they open: the region that scrolls,
// read from its top, rather than the first control in them, which would stand ringed and named in
// its tooltip over the first row — a tooltip that would then take the back gesture's Esc for
// itself. The keyboard's next Tab still reaches the first control.
const listBody = useTemplateRef<HTMLElement>("listBody");
const sheetBody = useTemplateRef<HTMLElement>("sheetBody");
const sectionBody = useTemplateRef<HTMLElement>("sectionBody");

function focusing(region: () => HTMLElement | null): { onOpenAutoFocus: (event: Event) => void } {
  return {
    onOpenAutoFocus: (event) => {
      event.preventDefault();
      region()?.focus({ preventScroll: true });
    }
  };
}

const DIALOG = focusing(() => (narrow.value ? listBody.value : sectionBody.value));
const SHEET = focusing(() => sheetBody.value);

const sections = computed(() => sectionsFor(administrator.value, signedUser.value !== null));
const section = computed(() => sectionOf(state.value.section, sections.value));
const sectionLabel = computed(() => t(section.value.label));

// Mounted afresh at each opening, so it stands over whatever was open when it was asked for: the
// narrow screen's sidebar drawer it is opened from is mounted after it (docs/web.md, 「Floating
// things」).
const openings = useOpenings(() => state.value.open);

const open = computed({
  get: () => state.value.open,
  set: (standing: boolean) => {
    state.value = { ...state.value, open: standing, entered: standing && state.value.entered };
  }
});

// Gone into a section, on a narrow screen; on a wide one the section always stands beside the list.
const entered = computed({
  get: () => narrow.value && state.value.open && state.value.entered,
  set: (inside: boolean) => {
    state.value = { ...state.value, entered: inside };
  }
});

// Each section's component, made once and loaded the first time it is opened.
const components = new Map<string, Component>();
const sectionComponent = computed(() => {
  const { key, load } = section.value;

  if (!components.has(key)) {
    components.set(key, defineAsyncComponent(load));
  }

  return components.get(key)!;
});

const listItems = computed<NavigationMenuItem[]>(() =>
  sections.value.map((one) => ({
    label: t(one.label),
    icon: one.icon,
    active: !narrow.value && one.key === section.value.key,
    trailingIcon: narrow.value ? "i-material-symbols-chevron-right" : undefined,
    onSelect: () => {
      state.value = { ...state.value, section: one.key, entered: true };
    }
  }))
);

// An address carrying `?settings=<section>` opens the dialog there, and is given back without it as
// the dialog opens: what is open over a screen is not a place, so the back gesture closes it rather
// than walking back through an address (docs/web.md, 「Settings」).
async function answerAddress(): Promise<void> {
  const asked = settingsAsked(route.query);

  if (asked === null) {
    return;
  }

  // A key the dialog holds no section for was made before its section moved away: one a tab of the organisation
  // settings screen holds leads to that tab, and one that moved on from there to where it stands now, the dialog
  // staying shut (docs/web.md, 「Settings」).
  const own = SETTINGS_SECTIONS.some((one) => one.key === asked.key);
  const tab = own ? null : organizationTabNamed(asked.key);
  const moved = own ? null : tab !== null ? organizationAddress(tab.value) : organizationMovedAway(asked.key);

  if (moved !== null) {
    await router.replace(moved);

    return;
  }

  await router.replace({ path: route.path, query: asked.rest, hash: route.hash });
  openSettings(state, sectionOf(asked.key, sections.value).key);
}

onMounted(() => {
  void answerAddress();
  watch(() => route.query, () => void answerAddress());
});
</script>
