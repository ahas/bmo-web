<template>
  <!-- An agent's request for a secret, standing under the words of the message that carries it (docs/web.md,
       the secret store section): a key mark, the name, the kind and what it is for, highlighted while it waits and read as saved
       once the store holds the name, changed since the message. Pressing it opens the secret form in place. -->
  <button
    type="button"
    class="flex w-full min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-start text-sm transition-colors"
    :class="saved
      ? 'border-success/40 bg-success/10 hover:bg-success/15 active:bg-success/20'
      : 'border-primary/40 bg-primary/10 hover:bg-primary/15 active:bg-primary/20'"
    :data-secret-request="props.request.name"
    :data-saved="saved ? '' : undefined"
    @click.stop="press"
  >
    <UIcon :name="saved ? 'i-material-symbols-check-circle-outline' : 'i-material-symbols-key-outline'" class="size-5 shrink-0" :class="saved ? 'text-success' : 'text-primary'" aria-hidden="true" />
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="flex min-w-0 items-center gap-2">
        <span class="shrink-0 font-medium text-highlighted">{{ $t("secrets.label.request") }}</span>
        <span class="min-w-0 truncate text-default">{{ props.request.name }}</span>
      </span>
      <span class="min-w-0 truncate text-muted">{{ kindText }}<template v-if="props.request.purpose !== ''"> · {{ props.request.purpose }}</template></span>
    </span>
    <UBadge v-if="saved" color="success" variant="subtle" size="sm" class="shrink-0" :label="$t('secrets.label.saved')" />
  </button>
</template>

<script setup lang="ts">
import { useAdministrator, useSignedUser } from "~/domain/access";
import { requestKindWords, savedSince, useSecretLists, useSecretRequest } from "~/domain/secret-form";
import { requestIsFor } from "#shared/secret-kinds";

import type { SecretRequest } from "#shared/secret-kinds";

interface Props {
  request: SecretRequest;
  // The room the message stands in, which a save from here answers.
  chatId: number;
  // When the message was sent, in seconds.
  sentAt: number;
}

const props = defineProps<Props>();

const { t } = useI18n();
const administrator = useAdministrator();
const reader = useSignedUser();
const { kinds, secrets, read } = useSecretLists();
const requestSecret = useSecretRequest();

// Whether the request fills the reader's own space, so their list says whether it was answered.
const theirs = computed(() => requestIsFor(props.request, reader.value, administrator.value));
const saved = computed(() => theirs.value && savedSince(secrets.value, props.request.name, props.sentAt * 1000));
const kindText = computed(() => requestKindWords(t, props.request, kinds.value));

// The lists are read once for the tab, by the first request line shown to the reader it is for.
onMounted(() => {
  if (theirs.value && secrets.value === null) void read().catch(() => undefined);
});

function press(): void {
  requestSecret(props.request, props.chatId, props.sentAt);
}
</script>
