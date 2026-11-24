<template>
  <!-- The organisation screen's supply tab at a company or a unit (docs/web.md, 「Organisation」, the supply tab): its
       policy and credits, its own supply and the plan it runs on, each group read on its own and standing only for a
       reader who holds that part. -->
  <div class="flex flex-col gap-4" data-org-supply>
    <OrganizationSupply :company="company" />
    <OrganizationAgentSupply :company="company" />
    <OrganizationPlans :company="company" />
  </div>
</template>

<script setup lang="ts">
import type { Organization } from "~/domain/organization";

interface Props {
  // The organisation chosen; each group reads the unit the tree chooses under it, the company itself where none is.
  company: Organization;
}

defineProps<Props>();
</script>
