<template>
  <!-- The agents tab with the platform chosen (docs/web.md, 「System and organisation」, the agents tab): the platform's own link
       of the people's BMOs and their agents, what every company stands on where it sets none, the administrator's. -->
  <div class="flex flex-col gap-4" data-org-platform-agents>
    <OrganizationBmo platform />
    <OrganizationAgents platform />
  </div>
</template>
