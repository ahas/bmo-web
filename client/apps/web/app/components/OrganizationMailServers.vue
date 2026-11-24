<template>
  <!-- The organisation screen's mail servers tab at a company or a unit (docs/web.md, 「Organisation」, the mail servers
       tab): the servers the unit chosen in the tree offers the people under it, the company's where none is. -->
  <MailServerList ref="list" :link="`unit:${unit}`" />
</template>

<script setup lang="ts">
import { UNIT_KEY } from "~/domain/organization";

import type { Organization } from "~/domain/organization";

interface Props {
  // The organisation chosen; the servers shown are the unit's the tree chooses under it, the company's where none is.
  company: Organization;
}

const props = defineProps<Props>();
const route = useRoute();

const unit = computed(() => {
  const chosen = Number(route.query[UNIT_KEY]);

  return Number.isInteger(chosen) && chosen > 0 ? chosen : props.company.id;
});

// The list's add, handed on to the tab row.
const list = useTemplateRef<{ addLabel: string | null; addDisabled: boolean; openAdd: () => void }>("list");

defineExpose({
  addLabel: computed(() => list.value?.addLabel ?? null),
  addDisabled: computed(() => list.value?.addDisabled ?? true),
  openAdd: () => list.value?.openAdd()
});
</script>
