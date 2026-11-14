import type { ExactMessageId } from "#shared/types";

// Everything of this app lives under one base path. $fetch already knows it; an <img> and
// an EventSource are given the whole path themselves.
export function appUrl(path: string): string {
  const base = useRuntimeConfig().app.baseURL;

  return `${base.replace(/\/$/, "")}${path}`;
}

export function imageUrl(chatId: number, messageId: ExactMessageId): string {
  return appUrl(`/api/images/${chatId}/${messageId}`);
}
