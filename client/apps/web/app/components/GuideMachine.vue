<template>
  <!-- The start guide's machine step (docs/web.md, 「The start guide」): the join page's desktop way, its code approved for the
       reader as the desktop pairing page approves one, and the machine asked after every few seconds until it attaches. -->
  <div class="flex flex-col gap-4" data-guide-machine>
    <UAlert v-if="done" color="success" variant="subtle" icon="i-material-symbols-check-circle-outline" :description="$t('guide.status.machine_attached')" data-guide-machine-attached />
    <template v-else>
      <DesktopAppSteps form-id="guide-pair" :unavailable="$t('guide.message.desktop_unavailable')" :approved="approved" :pairing="pairing" :code-failure="codeFailure" @pair="(code: string) => void pair(code)" />
      <p v-if="approved" class="text-sm text-muted" data-guide-machine-waiting>{{ $t("guide.status.waiting_machine") }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { UserNode } from "@web/server-client";

const done = defineModel<boolean>("done", { required: true });

const { t } = useI18n();
const approved = ref(false);
const pairing = ref(false);
const codeFailure = ref("");
let timer: ReturnType<typeof setInterval> | undefined;

// The code from the app's title bar read for the reader, then approved; from there the machine is waited for.
async function pair(code: string): Promise<void> {
  codeFailure.value = "";
  pairing.value = true;
  try {
    const path = `/api/desktop/pair/${encodeURIComponent(code)}`;

    await $fetch(path);
    await $fetch(`${path}/approve`, { method: "POST" });
    approved.value = true;
    void prove();
  } catch (error) {
    codeFailure.value = failureText(error, t("pairing.error.failed"));
  } finally {
    pairing.value = false;
  }
}

// Whether the reader's machine has attached, recorded as proven once it has.
async function prove(): Promise<void> {
  try {
    const machine = await $fetch<UserNode>("/api/me/machine/proof", { method: "POST" });

    if (typeof machine.agent === "string" && machine.attached === true) {
      done.value = true;
      if (timer !== undefined) clearInterval(timer);
    }
  } catch {
    // A failed ask is asked again at the next beat.
  }
}

onMounted(() => {
  void prove();
  timer = setInterval(() => void prove(), 5000);
});
onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
});
</script>
