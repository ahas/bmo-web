<template>
  <!-- What a personal app may reach beyond its own data, line by line (docs/web.md, 「App catalogue」 and 「Settings」, the
       personal apps section): the addresses and secrets it names in the monospace face, a line saying what each means,
       and in the warning colour what the reader's secret space lacks and what their organisation does not allow. -->
  <ul class="flex min-w-0 flex-col gap-1 text-sm" data-app-permissions>
    <li v-for="line in lines" :key="line.key" class="break-keep break-words" :class="TONES[line.tone]" :data-app-permission="line.key">
      <span>{{ line.text }}</span>
      <template v-for="(value, at) in line.values" :key="value">
        <span v-if="at > 0">,</span>
        <span class="ms-1 break-words font-mono" data-app-permission-value>{{ value }}</span>
      </template>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { permissionLines } from "~/domain/app-permissions";

import type { PermissionLine } from "~/domain/app-permissions";
import type { AppPermissions, PermissionReach } from "#shared/app-permissions";

interface Props {
  permissions: AppPermissions;
  reach: PermissionReach;
}

const props = defineProps<Props>();
const { t } = useI18n();

const TONES: Readonly<Record<PermissionLine["tone"], string>> = { default: "text-default", muted: "text-muted", warning: "text-warning" };

const lines = computed(() => permissionLines(t, props.permissions, props.reach));
</script>
