import { useInitialRead, useLastRead } from "bmo-ui/app/domain/loading";

import { usePolling } from "./polling";
import { emptyUsage, USAGE_REFRESH_MS } from "./usage";

import type { UsageView } from "#shared/types";

// The accounts' remaining usage as every screen reads it (docs/web.md, 「Usage in the title bar」): one read under one
// key, so the title bar's panel and the providers tab stand the same figures, read again once a minute with the second
// the lengths are counted from. A failed read keeps what was read last, so a figure is never taken down for a read
// that did not happen.
export function useUsageRead() {
  const { data, refresh, status, error } = useFetch<UsageView>("/api/usage", {
    key: "usage",
    lazy: true,
    server: false,
    default: emptyUsage
  });

  const initial = useInitialRead(status);
  const loaded = ref(status.value === "success");

  watch(status, (value) => {
    if (value === "success") loaded.value = true;
  });

  const reading = computed(() => status.value === "pending");
  const lastRead = useLastRead(data, status);
  const usage = computed<UsageView>(() => lastRead.value ?? emptyUsage());

  // The second the lengths are counted from. It moves once a minute because that is the smallest unit those lengths
  // are said in.
  const now = ref(Math.floor(Date.now() / 1000));

  usePolling(() => {
    now.value = Math.floor(Date.now() / 1000);
    void refresh({ dedupe: "defer" });
  }, USAGE_REFRESH_MS);

  return { usage, now, status, error, initial, loaded, reading, refresh };
}
