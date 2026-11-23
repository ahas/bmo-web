import { readConsoleFeatures } from "~/domain/console-features";

// The deployment's features (docs/web.md, 「The console's features」): read once per page, on the server where the page
// is drawn there and handed on with it, and again as somebody signs in or out, since a page with no session reads
// none.
export default defineNuxtPlugin({
  name: "console-features",
  async setup() {
    const read = useState<boolean>("console-features-read", () => false);
    const { loggedIn } = useUserSession();

    if (!read.value) {
      await readConsoleFeatures();
      read.value = true;
    }

    if (import.meta.client) watch(loggedIn, () => void readConsoleFeatures());
  }
});
