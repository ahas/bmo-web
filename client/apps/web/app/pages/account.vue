<!-- The account's settings stand in the settings dialog over whatever screen is open (docs/web.md,
     「Settings」); this address takes a reader home with the dialog open at the account section. -->
<script setup lang="ts">
import { isAdministrator } from "~/domain/access";
import { settingsRoute } from "~/domain/settings-dialog";

definePageMeta({
  member: true,
  middleware: () => {
    const { session } = useUserSession();

    return navigateTo(settingsRoute(isAdministrator(session.value), "account"), { replace: true });
  }
});
</script>
