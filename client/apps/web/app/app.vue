<template>
  <!-- The console says everything it has to say on the one island at the top of the screen
       (`~/domain/island`), so the component library's own toaster is not stood up at all. Left
       standing it would be a second road for news, and a road nobody watches is a road news is
       lost down. -->
  <UApp :locale="locale" :tooltip="TOOLTIP_PROVIDER" :toaster="null">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <!-- A page with no shell has no title bar, so in the desktop app's window the console lays the window's bar over
         its top edge (docs/web.md, 「The desktop app's window」). -->
    <DesktopWindowStrip v-if="desktopApp !== null && route.meta.layout === false" />
    <SettingsModal v-if="loggedIn" />
    <SecretRequestHost v-if="loggedIn" />
    <MessageIsland />
    <CutLineTip />
    <MarkupButtonTip />
  </UApp>
</template>

<script setup lang="ts">
import { ko } from "@nuxt/ui/locale";
import { TOOLTIP_PROVIDER } from "bmo-ui/app/domain/tooltip";
import { consoleName } from "#shared/agent-names";
import { useDesktopApp } from "~/domain/desktop-app";

const { t } = useI18n();
const { loggedIn } = useUserSession();
const route = useRoute();
const desktopApp = useDesktopApp();

// The sidebar's drawer names itself with keys Nuxt UI's own locales do not carry, so a screen
// reader would read the key; the console supplies them. Its fold button is named as the console
// names every fold button, and that name is the tooltip it wears. An input menu's open button, on
// the console's screens and on a bundle's alike, is named by the console's word (docs/web.md,
// 「Wording and the language pack」).
const locale = extendLocale(ko, {
  messages: {
    dashboardSidebar: { title: t("app.label.sidebar"), description: t("app.label.sidebar_description") },
    dashboardSidebarCollapse: { collapse: t("common.action.collapse"), expand: t("common.action.expand") },
    inputMenu: { trigger: t("common.aria.open_list") }
  }
});

// The interface's faces are asked for with the page rather than once the stylesheet has been read
// and laid out, so the first screen is drawn in them instead of swapping into them a moment after
// (docs/web.md, 「Fonts」). Every weight carried is asked for: the first screen wears all four.
const INTERFACE_FACES = Object.values(
  import.meta.glob<string>("~/assets/fonts/AppleSDGothicNeo-*.woff2", { eager: true, query: "?url", import: "default" })
);

// The console's name stands in the browser tab and under an installed copy's icon.
useHead({
  title: consoleName(t),
  meta: [{ name: "apple-mobile-web-app-title", content: consoleName(t) }],
  link: INTERFACE_FACES.map((href) => ({ rel: "preload", as: "font", type: "font/woff2", crossorigin: "anonymous", href }))
});

</script>
