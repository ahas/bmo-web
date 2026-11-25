import { failureText } from "bmo-ui/app/domain/errors";

import type { Ref } from "vue";

// One group of a page read on its own (docs/web.md, 「System and organisation」, the people tab): what it holds once read, and a
// failure said in its place until a read goes through, while the groups beside it stand.

export interface GroupRead<T> {
  data: Ref<T | null>;
  failure: Ref<string>;
  reading: Ref<boolean>;
  read: () => Promise<void>;
}

/** A group's read, its failure worded by `failed` where the answer gives no reason of its own. */
export function groupRead<T>(load: () => Promise<T>, failed: string): GroupRead<T> {
  const data = ref<T | null>(null) as Ref<T | null>;
  const failure = ref("");
  const reading = ref(false);

  async function read(): Promise<void> {
    reading.value = true;

    try {
      data.value = await load();
      failure.value = "";
    } catch (error) {
      failure.value = failureText(error, failed);
    } finally {
      reading.value = false;
    }
  }

  return { data, failure, reading, read };
}
