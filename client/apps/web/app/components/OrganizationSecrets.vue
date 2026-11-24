<template>
  <!-- The organisation screen's secrets tab at a company or a unit (docs/web.md, 「Organisation」, the secrets tab): the
       unit's own space of the secret store, which its heads and the administrator hold. -->
  <SecretSpace ref="space" :unit="unit" :note="$t('secrets.label.unit_note')" />
</template>

<script setup lang="ts">
import { UNIT_KEY } from "~/domain/organization";

import type { Organization } from "~/domain/organization";

interface Props {
  // The organisation chosen; the space shown is the unit the tree chooses under it, the company's own where none is.
  company: Organization;
}

const props = defineProps<Props>();
const route = useRoute();

const unit = computed(() => {
  const chosen = Number(route.query[UNIT_KEY]);

  return Number.isInteger(chosen) && chosen > 0 ? chosen : props.company.id;
});

// The space's add, handed on to the tab row.
const space = useTemplateRef<{ addLabel: string; addDisabled: boolean; openAdd: () => void }>("space");

defineExpose({
  addLabel: computed(() => space.value?.addLabel ?? null),
  addDisabled: computed(() => space.value?.addDisabled ?? true),
  openAdd: () => space.value?.openAdd()
});
</script>
