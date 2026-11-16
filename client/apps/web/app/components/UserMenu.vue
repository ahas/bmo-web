<template>
  <!-- The account menu, dropped from the sidebar's foot. It takes the width every menu of the
       console takes — its own content's — rather than the width of the button it drops from, which
       is the panel's and says nothing about what is in the menu. Folded to its avatar, the button
       names the account in a tooltip, the name it no longer shows. -->
  <UDropdownMenu :items="items" :content="{ side: 'top', align: 'start', collisionPadding: 12 }">
    <UTooltip :text="name" :disabled="!props.collapsed" :content="{ side: 'right' }">
      <UButton
        :label="props.collapsed ? undefined : name"
        :aria-label="props.collapsed ? name : undefined"
        :trailing-icon="props.collapsed ? undefined : 'i-material-symbols-unfold-more'"
        :avatar="{ icon: 'i-material-symbols-person-outline' }"
        color="neutral"
        variant="ghost"
        block
        :square="props.collapsed"
      />
    </UTooltip>
  </UDropdownMenu>
</template>

<script setup lang="ts">
import { openSettings, useSettings } from "~/domain/settings-dialog";

import type { DropdownMenuItem } from "@nuxt/ui";

interface Props {
  collapsed?: boolean;
}

const { t } = useI18n();
const props = withDefaults(defineProps<Props>(), { collapsed: false });

const colorMode = useColorMode();
const settings = useSettings();
const { user, clear } = useUserSession();
// The person's name people read the account by, its login where none stands (docs/accounts.md, 「Users and senders」).
const name = computed(() => (user.value?.fullName || user.value?.name) ?? t("app.label.account"));

async function logout(): Promise<void> {
  await $fetch("/api/auth/logout", { method: "POST" });
  await clear();
  await navigateTo("/login");
}

function appearance(label: string, icon: string, preference: string): DropdownMenuItem {
  return {
    label,
    icon,
    type: "checkbox",
    checked: colorMode.preference === preference,
    onSelect(event: Event) {
      event.preventDefault();

      colorMode.preference = preference;
    }
  };
}

const items = computed<DropdownMenuItem[][]>(() => [
  [{ type: "label", label: user.value === null ? "" : name.value }],
  [
    { label: t("settings.title.settings"), icon: "i-material-symbols-settings-outline", onSelect: () => openSettings(settings) },
    { label: t("desktop.title.page"), icon: "i-material-symbols-desktop-windows-outline", to: "/desktop" },
    {
      label: t("app.label.color_mode"),
      icon: "i-material-symbols-contrast",
      children: [
        appearance(t("app.label.mode_light"), "i-material-symbols-light-mode-outline", "light"),
        appearance(t("app.label.mode_dark"), "i-material-symbols-dark-mode-outline", "dark"),
        appearance(t("app.label.mode_system"), "i-material-symbols-desktop-windows-outline", "system")
      ]
    }
  ],
  [{ label: t("app.action.logout"), icon: "i-material-symbols-logout", onSelect: () => void logout() }]
]);
</script>
