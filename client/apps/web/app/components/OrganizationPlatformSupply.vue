<template>
  <!-- The supply tab with the platform chosen (docs/web.md, 「Organisation」, the supply tab): the platform's own
       supply — its default policy, conversion, reservation size, enforcement, ledger and audit, the plans it sells, and
       its own keys and Claude accounts — the administrator's. Each part reads on its own. -->
  <div class="flex flex-col gap-4" data-org-platform-supply>
    <OrganizationPlatformCredits />
    <OrganizationPlatformPlans />
    <OrganizationPlatformAccounts />
  </div>
</template>
