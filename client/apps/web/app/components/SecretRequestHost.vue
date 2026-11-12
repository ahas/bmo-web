<template>
  <!-- The secret form every screen shares (docs/web.md, the secret store section): opened by an agent's request, carried by an
       address or pressed in a room, and by a room's composer. Its save is handed to whoever opened it. -->
  <SecretForm
    v-if="administrator"
    v-model:open="open"
    :ask="state.ask"
    :kinds="kinds ?? []"
    :secrets="secrets ?? []"
    @saved="onSaved"
    @kind-added="onKindAdded"
  />
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";

import { useAdministrator } from "~/domain/access";
import { askSecret, useSecretForm, useSecretLists, useSecretSaved } from "~/domain/secret-form";
import { secretRequestOf, withoutRequest } from "#shared/secret-kinds";

import type { SecretKind } from "#shared/secret-kinds";
import type { KeptSecret } from "#shared/types";

const { t } = useI18n();
const island = useIsland(t);
const route = useRoute();
const router = useRouter();
const administrator = useAdministrator();
const state = useSecretForm();
const saved = useSecretSaved();
const { kinds, secrets, read } = useSecretLists();

const open = computed({
  get: () => state.value.open,
  set: (standing: boolean) => {
    state.value = { ...state.value, open: standing };
  }
});

// The lists the form reads are read again at each opening, so a kind added elsewhere is offered.
watch(
  () => state.value.open,
  async (opened) => {
    if (!opened) return;

    try {
      await read();
    } catch (error) {
      island.say({ title: failureText(error, t("secrets.error.kinds_read_failed")), tone: "warning" });
    }
  }
);

function onSaved(kept: KeptSecret, kind: string): void {
  secrets.value = [...(secrets.value ?? []).filter((secret) => secret.name !== kept.name), kept];
  saved.value = { target: state.value.target, handed: { name: kept.name, kind }, at: Date.now() };
}

function onKindAdded(kind: SecretKind): void {
  kinds.value = [...(kinds.value ?? []), kind];
}

// The room a screen stands for, where it stands for one: a request answered over it is answered in that room.
function roomOfRoute(): string | null {
  const room = route.params.chatId;

  return typeof room === "string" && room !== "" ? room : null;
}

// An address carrying `?secret=` opens the form over the screen it names, and is given back without the request's
// keys as the form opens: what is open over a screen is not a place, so the back gesture closes it rather than
// walking back through an address. A reader who is not the administrator is told so, and no form opens.
async function answerAddress(): Promise<void> {
  const request = secretRequestOf(route.query);

  if (request === null) return;

  await router.replace({ path: route.path, query: withoutRequest(route.query), hash: route.hash });

  if (!administrator.value) {
    island.say({ title: t("common.error.administrator_only"), tone: "warning" });

    return;
  }

  askSecret(state, { name: request.name, kind: request.kind, fields: request.fields, purpose: request.purpose, replace: false }, { kind: "request", room: roomOfRoute() });
}

onMounted(() => {
  void answerAddress();
  watch(() => route.query, () => void answerAddress());
});
</script>
