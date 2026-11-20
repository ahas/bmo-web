<template>
  <!-- A room's or an agent's picture, set in a dialog of its own (docs/web.md, 「Profile photos」, a picture set in the
       console): what it holds takes effect as it is saved, so the foot carries the close button alone, and closing
       while a picked picture waits unsaved asks first (「Forms」). -->
  <SettingsDialog v-model:open="open" :title="props.title" :description="props.description" :dirty="holding">
    <PictureSetting v-model:holding="holding" :kind="props.kind" :subject="props.subject" :avatar="props.avatar" />

    <template #footer="{ close }">
      <UButton :label="$t('common.action.close')" color="neutral" variant="ghost" @click="close()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import type { PictureKind } from "~/domain/picture-setting";
import type { AvatarProps } from "@nuxt/ui";

interface Props {
  title: string;
  description?: string;
  kind: PictureKind;
  subject: number | string;
  avatar: AvatarProps;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });
const holding = ref(false);
</script>
