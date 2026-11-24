<template>
  <!-- Recovery codes shown once (docs/web.md, 「Settings」, 계정's 2단계 인증): ten in two columns in the monospace face,
       with what they are for, and 복사 and 다운로드 under them. -->
  <div class="flex flex-col gap-4" data-recovery-codes>
    <p class="text-sm text-muted">{{ $t("security.message.codes_once") }}</p>
    <ul class="grid grid-cols-2 gap-2 rounded-lg bg-elevated p-4 font-mono text-sm text-highlighted">
      <li v-for="code in props.codes" :key="code" class="tabular-nums">{{ code }}</li>
    </ul>
    <div class="flex flex-wrap justify-end gap-2">
      <UButton color="neutral" variant="outline" icon="i-material-symbols-content-copy-outline" :label="copied ? $t('security.message.copied') : $t('security.action.copy')" data-codes-copy @click="void copy()" />
      <UButton color="neutral" variant="outline" icon="i-material-symbols-download" :label="$t('security.action.download')" data-codes-download @click="download()" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { copyText } from "~/domain/copy";

interface Props {
  codes: string[];
}

const props = defineProps<Props>();
const copied = ref(false);

async function copy(): Promise<void> {
  copied.value = await copyText(props.codes.join("\n"));
}

// The codes saved as a text file of one code a line.
function download(): void {
  const url = URL.createObjectURL(new Blob([`${props.codes.join("\n")}\n`], { type: "text/plain" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = "recovery-codes.txt";
  link.click();
  URL.revokeObjectURL(url);
}
</script>
