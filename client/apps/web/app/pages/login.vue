<template>
  <!-- The one screen that stands on no shell, so it holds itself to what is visible the way the
       shell does: a phone lays its keyboard over the page rather than cutting it out, and a card
       centred on the window would put its last field and its button behind the keys. Centred with
       margins rather than by the box's own alignment, so a card taller than the room scrolls to
       its top instead of having it cut off. -->
  <div
    class="relative flex overflow-y-auto bg-default p-4 text-default"
    :style="{ top: 'var(--bmo-screen-top)', height: 'var(--bmo-screen)' }"
  >
    <UCard class="m-auto w-full max-w-sm">
      <template #header>
        <h1 class="text-xl font-semibold text-highlighted">{{ consoleName($t) }}</h1>
      </template>

      <UForm id="login-form" :state="form" @submit="submit">
        <div class="flex flex-col gap-4">
          <UAlert v-if="ended && !failure" color="warning" variant="subtle" :title="$t('app.message.session_ended')" :description="$t('app.message.login_again')" />

          <UFormField :label="$t('app.label.user_id')" name="name" required>
            <UInput v-model="form.name" class="w-full" autocomplete="username" />
          </UFormField>

          <UFormField :label="$t('app.label.password')" name="password" required>
            <UInput v-model="form.password" class="w-full" type="password" autocomplete="current-password" />
          </UFormField>

          <UCheckbox v-model="form.remember" :label="$t('app.label.remember')" />

          <UAlert v-if="failure" color="error" variant="subtle" :description="failure" />
        </div>
      </UForm>

      <!-- The one action of the screen, in the card's own footer rather than loose under the
           fields, so it stands where every other form of this console puts what saves it. -->
      <template #footer>
        <UButton type="submit" form="login-form" block :label="$t('app.action.login')" :loading="pending" />
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { consoleName } from "#shared/agent-names";
import { returnPath } from "~/domain/login-end";
import { useVisibleScreen } from "bmo-ui/app/domain/screen";

const { t } = useI18n();
definePageMeta({ layout: false });

useVisibleScreen();

const { fetch: refreshSession } = useUserSession();
const route = useRoute();

// Sent here by a login that ended, which the screen says until a try of the login says otherwise.
const ended = computed(() => route.query.ended === "1");

const failure = ref<string | null>(null);
const pending = ref(false);

// Keeping the login is off until it is asked for: the console is one account's own and reachable
// from outside, so a browser left on a machine is not logged in again by itself unless it was said.
const form = reactive({ name: "", password: "", remember: false });

async function submit(): Promise<void> {
  pending.value = true;
  failure.value = null;

  try {
    await $fetch("/api/auth/login", {
      method: "POST",
      body: { name: form.name, password: form.password, remember: form.remember }
    });
    await refreshSession();
    await navigateTo(returnPath(route.query.to));
  } catch (error) {
    failure.value = failureText(error, t("app.error.login_failed"));
  } finally {
    pending.value = false;
  }
}
</script>
