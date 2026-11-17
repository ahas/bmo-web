<template>
  <!-- An agent's request for a secret, standing under the words of the message that carries it (docs/web.md,
       the secret store section): a card of three lines, the name, what it is for, and the state with the one button
       that opens the secret form in place. Each line is one line high whatever it holds, a long one cut with the
       ellipsis every cut line shows whole in its tooltip, so the card keeps its bubble's width and its own height. -->
  <div
    class="flex w-full min-w-0 flex-col gap-1 rounded-lg px-3 py-2 text-sm"
    :class="saved ? 'bg-success/10' : 'bg-primary/10'"
    :data-secret-request="props.request.name"
    :data-saved="saved ? '' : undefined"
  >
    <span class="flex min-w-0 items-center gap-2" data-secret-request-name>
      <UIcon :name="saved ? 'i-material-symbols-check-circle-outline' : 'i-material-symbols-key-outline'" class="size-5 shrink-0" :class="saved ? 'text-success' : 'text-primary'" aria-hidden="true" />
      <span class="min-w-0 truncate font-medium text-highlighted">{{ props.request.name }}</span>
    </span>
    <span class="min-w-0 truncate text-muted" data-secret-request-purpose>{{ purposeText }}</span>
    <!-- The state and the button stand on a line of the button's own height, which is kept empty until the reader's
         list is asked for and stands as their skeleton while it is read, so the card never changes height. -->
    <span class="flex h-8 min-w-0 items-center justify-between gap-2" :data-secret-request-reading="listing === 'reading' ? '' : undefined">
      <template v-if="listing === 'reading'">
        <USkeleton class="h-4 w-16" />
        <USkeleton class="h-8 w-12 shrink-0 rounded-md" />
      </template>
      <template v-else-if="listing !== 'unasked'">
        <UBadge v-if="saved" color="success" variant="subtle" size="sm" class="min-w-0" :label="$t('secrets.label.saved')" />
        <span v-else-if="listing === 'failed'" class="min-w-0 truncate text-error">{{ $t("secrets.error.read_failed") }}</span>
        <span v-else class="min-w-0 truncate text-toned">{{ $t("secrets.label.request") }}</span>
        <UButton
          size="sm"
          :color="saved ? 'success' : 'primary'"
          :variant="saved ? 'outline' : 'solid'"
          class="shrink-0"
          :label="saved ? $t('secrets.action.replace') : $t('common.action.save')"
          data-secret-request-open
          @click.stop="press"
        />
      </template>
    </span>
  </div>
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
// What the secret is for, or, where the request says nothing of it, the shape it is asked in.
const purposeText = computed(() => (props.request.purpose === "" ? requestKindWords(t, props.request, kinds.value) : props.request.purpose));

// Where the card stands with the reader's list: not yet asked for (as the server draws it), being read, read, or
// failed. Only the reader the request is for waits on it; any other reader's card is complete as it stands.
const asked = ref(false);
const failed = ref(false);
const listing = computed<"unasked" | "reading" | "read" | "failed">(() => {
  if (!theirs.value || secrets.value !== null) return "read";
  if (failed.value) return "failed";

  return asked.value ? "reading" : "unasked";
});

// The lists are read once for the tab, by the first request card shown to the reader it is for; every card waiting
// on that read learns how it ended.
onMounted(() => {
  asked.value = true;
  if (theirs.value && secrets.value === null) {
    read().catch(() => {
      failed.value = true;
    });
  }
});

function press(): void {
  requestSecret(props.request, props.chatId, props.sentAt);
}
</script>
