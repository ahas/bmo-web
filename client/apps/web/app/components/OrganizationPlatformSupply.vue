<template>
  <!-- The supply tab with the platform chosen (docs/web.md, 「Organisation」, the supply tab): the platform's own
       supply — its default policy, conversion, reservation size and enforcement, the plans it sells, its own keys and
       Claude accounts, and last its ledger and audit — the administrator's. Each part reads on its own. -->
  <div class="flex flex-col gap-4" data-org-platform-supply>
    <OrganizationPlatformCredits />
    <OrganizationPlatformPlans />
    <OrganizationPlatformAccounts />
    <OrganizationPlatformRecords />
  </div>
</template>
