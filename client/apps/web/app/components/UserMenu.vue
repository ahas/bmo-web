<template>
  <!-- The account menu, dropped from the sidebar's foot. It takes the width every menu of the
       console takes — its own content's — rather than the width of the button it drops from, which
       is the panel's and says nothing about what is in the menu. Folded to its avatar, the button
       names the account in a tooltip, the name it no longer shows. The screens units bring into the reader's own
       menu stand above its own items, and a positive count one of them carries puts a dot on the avatar's rim,
       spread and folded alike (docs/web.md, 「Sidebar」). Each of those screens is drawn through the slot its item
       names, `ACCOUNT_ITEM_SLOT`, whose end carries its count badge. -->
  <UDropdownMenu :items="items" :content="{ side: 'top', align: 'start', collisionPadding: 12 }">
    <UTooltip :text="name" :disabled="!props.collapsed" :content="{ side: 'right' }">
      <UButton
        :label="props.collapsed ? undefined : name"
        :aria-label="props.collapsed ? name : undefined"
        :aria-description="unread ?? undefined"
        :trailing-icon="props.collapsed ? undefined : 'i-material-symbols-unfold-more'"
        :avatar="avatar"
        color="neutral"
        variant="ghost"
        block
        :square="props.collapsed"
      />
    </UTooltip>
    <!-- A reader's own screen named in a reading keeps the maker's name in its tooltip, as its sidebar row does. -->
    <template #account-screen-label="{ item }">
      <SidebarReadName v-if="item.original !== undefined" :name="String(item.label)" :original="item.original" />
      <template v-else>{{ item.label }}</template>
    </template>
    <template #account-screen-trailing="{ item }">
      <UBadge v-if="item.badge !== undefined" v-bind="item.badge" />
    </template>
  </UDropdownMenu>
</template>

<script setup lang="ts">
import { useDesktopApp } from "~/domain/desktop-app";
import { namedBy } from "~/domain/own-screen-names";
import { accountItems, accountUnread } from "~/domain/screens";
import { openSettings, useSettings } from "~/domain/settings-dialog";

import type { AvatarProps, DropdownMenuItem } from "@nuxt/ui";
import type { ReadName } from "~/domain/own-screen-names";
import type { AccountItem, Screen, ScreenCounts } from "~/domain/screens";

interface Props {
  collapsed?: boolean;
  // The screens the shell lists for the reader, of which the menu holds those its section places in it.
  screens?: readonly Screen[];
  // The sidebar counts as the shell last read them, by the address of the screen each stands on.
  counts?: ScreenCounts;
  // The reader's own screens named by their reading, by address, as the sidebar names them (docs/web.md, 「Sidebar」).
  readNames?: ReadonlyMap<string, ReadName>;
}

const { t } = useI18n();
const props = withDefaults(defineProps<Props>(), { collapsed: false, screens: () => [], counts: () => ({}), readNames: () => new Map() });

const screenEntries = computed<AccountItem[]>(() => accountItems(namedBy(t, props.readNames), props.screens, props.counts, props.readNames));
const unread = computed<string | null>(() => accountUnread(namedBy(t, props.readNames), props.screens, props.counts));
const avatar = computed<AvatarProps>(() => ({
  icon: "i-material-symbols-person-outline",
  ...(unread.value === null ? {} : { chip: { color: "primary" as const, position: "top-right" as const } })
}));

const colorMode = useColorMode();
const settings = useSettings();
// In the desktop app's window the app is already there, so its download page is not offered (docs/web.md, 「Sidebar」).
const desktopApp = useDesktopApp();
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

const items = computed<(DropdownMenuItem | AccountItem)[][]>(() => [
  [{ type: "label", label: user.value === null ? "" : name.value }],
  ...(screenEntries.value.length === 0 ? [] : [screenEntries.value]),
  [
    { label: t("settings.title.settings"), icon: "i-material-symbols-settings-outline", onSelect: () => openSettings(settings) },
    ...(desktopApp.value === null ? [{ label: t("desktop.title.page"), icon: "i-material-symbols-desktop-windows-outline", to: "/desktop" }] : []),
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
