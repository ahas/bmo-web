// A file's size as a person reads it, in bytes, kilobytes or megabytes of 1,024, with the thousands separated. The
// screen and the server's sentences say a size the same way, so a file's size and a limit it is held to compare.
export function fileSizeText(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes.toLocaleString("ko-KR")}B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024).toLocaleString("ko-KR")}KB`;
  }

  return `${(bytes / (1024 * 1024)).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}MB`;
}
