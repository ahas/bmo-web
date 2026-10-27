import { describe, expect, test } from "bun:test";

import { shellTokens, writtenFiles } from "../../../apps/web/app/domain/shell-colour";

// A shell command coloured as zsh colours a typed line, and the files it visibly writes (docs/web.md, 「A tool call」).

function parts(command: string): string[] {
  return shellTokens(command).filter((token) => token.part !== "plain").map((token) => `${token.part}:${token.text}`);
}

describe("a command coloured as zsh colours it", () => {
  test("keeps every character, in order", () => {
    const command = "grep -rn \"a b\" src | head -20 && echo $HOME > out.txt";

    expect(shellTokens(command).map((token) => token.text).join("")).toBe(command);
  });

  test("tells the command words, options, strings, variables and operators apart", () => {
    expect(parts("grep -rn \"a b\" src | head -20 && echo $HOME")).toEqual([
      "command:grep",
      "option:-rn",
      'string:"a b"',
      "operator:|",
      "command:head",
      "option:-20",
      "operator:&&",
      "command:echo",
      "variable:$HOME"
    ]);
  });

  test("reads a word after a prefix and after a substitution as a command", () => {
    expect(parts("sudo systemctl restart x")).toEqual(["command:sudo", "command:systemctl"]);
    expect(parts("TOKEN=$(cat f)")).toEqual(["operator:$(", "command:cat", "operator:)"]);
  });

  test("stands a heredoc's body plain, its marker coloured", () => {
    const tokens = shellTokens("python3 - <<'PY' > out.json\nprint(1)\nPY\nls");

    expect(tokens.find((token) => token.text.includes("print(1)"))?.part).toBe("plain");
    expect(tokens.filter((token) => token.part === "command").map((token) => token.text)).toEqual(["python3", "ls"]);
  });
});

describe("the files a command visibly writes", () => {
  test("names a redirection's file, tee's and sed -i's, and no device", () => {
    expect(writtenFiles("python3 - <<'PY' > /tmp/patch.json\nopen('x') > nothing\nPY")).toEqual(["/tmp/patch.json"]);
    expect(writtenFiles("echo a | tee -a log.txt other.txt")).toEqual(["log.txt", "other.txt"]);
    expect(writtenFiles("sed -i 's/a/b/' docs/web.md")).toEqual(["docs/web.md"]);
    expect(writtenFiles("ls 2>/dev/null; cat a 2>&1")).toEqual([]);
  });
});
