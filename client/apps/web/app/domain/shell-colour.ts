// A shell command coloured the way zsh's syntax highlighting colours a typed line (docs/web.md, 「A tool call」): the
// command words, the options, the quoted strings, the variables, the operators that join, pipe and redirect, and the
// comments, each a colour of the console's ANSI palette. It reads the line as a person reads it, not as a shell
// parses it: what it cannot tell stands plain.

export type ShellPart = "command" | "option" | "string" | "variable" | "operator" | "comment" | "plain";

export interface ShellToken {
  part: ShellPart;
  text: string;
}

// The operators after which the next word is a command again.
const COMMAND_AFTER = new Set(["|", "||", "&&", ";", "&", "|&", "(", "$(", "`", "{", "then", "do", "else", "elif"]);
// The words a line can open with before its command.
const PREFIX_WORDS = new Set(["sudo", "env", "time", "exec", "nohup", "command", "builtin", "xargs", "timeout"]);
const OPERATORS = /^(?:\|\||&&|\|&|>>|<<<|<<-?|&>>?|[12]?>&?[12]?|<|\||;|&|\(|\)|\$\(|`|\{|\})/;
const KEYWORDS = new Set(["if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done", "case", "esac", "in", "function"]);
const LIST_OPENERS = new Set(["if", "while", "until"]);

/** The command's tokens, in order, every character of it in one of them. */
export function shellTokens(command: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let at = 0;
  let expectCommand = true;
  // A heredoc's body stands plain from the line after its marker to the line that closes it.
  let heredoc: string | null = null;

  const push = (part: ShellPart, text: string): void => {
    const last = tokens.at(-1);

    if (last !== undefined && last.part === part && part === "plain") last.text += text;
    else tokens.push({ part, text });
  };

  while (at < command.length) {
    const rest = command.slice(at);

    if (heredoc !== null) {
      const end = rest.indexOf("\n");
      const line = end === -1 ? rest : rest.slice(0, end + 1);

      push(line.trim() === heredoc ? "operator" : "plain", line);

      if (line.trim() === heredoc) {
        heredoc = null;
        expectCommand = true;
      }

      at += line.length;
      continue;
    }

    const space = /^[ \t]+/.exec(rest);

    if (space !== null) {
      push("plain", space[0]);
      at += space[0].length;
      continue;
    }

    if (rest[0] === "\n") {
      push("plain", "\n");
      at += 1;
      expectCommand = true;
      continue;
    }

    if (rest[0] === "\\" && rest[1] === "\n") {
      push("plain", "\\\n");
      at += 2;
      continue;
    }

    if (rest[0] === "#" && (at === 0 || /\s/.test(command[at - 1]!))) {
      const end = rest.indexOf("\n");
      const text = end === -1 ? rest : rest.slice(0, end);

      push("comment", text);
      at += text.length;
      continue;
    }

    const operator = OPERATORS.exec(rest);

    if (operator !== null) {
      const text = operator[0];

      push("operator", text);
      at += text.length;

      if (text.startsWith("<<") && text !== "<<<") {
        // The marker that closes the heredoc, quoted or bare, read off the word after the operator.
        const marker = /^\s*(['"]?)([A-Za-z_][\w-]*)\1/.exec(command.slice(at));

        if (marker !== null) {
          push("string", marker[0]);
          at += marker[0].length;
          heredoc = marker[2]!;
          const lineEnd = command.indexOf("\n", at);

          // The rest of the marker's own line is read as the line it is; its body starts after it.
          if (lineEnd !== -1) {
            const tail = command.slice(at, lineEnd);

            tokens.push(...shellTokens(tail));
            push("plain", "\n");
            at = lineEnd + 1;
          } else {
            heredoc = null;
          }
        }
      }

      expectCommand = COMMAND_AFTER.has(text);
      continue;
    }

    // One word: quoted stretches and variables inside it each keep their own colour.
    const wordStart = at;
    const parts: ShellToken[] = [];

    while (at < command.length && !/[\s|;&<>()`]/.test(command[at]!)) {
      const here = command.slice(at);
      const quote = /^'[^']*'?|^"(?:\\.|[^"\\])*"?|^\$'(?:\\.|[^'\\])*'?/.exec(here);

      if (quote !== null) {
        parts.push({ part: "string", text: quote[0] });
        at += quote[0].length;
        continue;
      }

      const variable = /^\$(?:\{[^}]*\}?|[A-Za-z_]\w*|[0-9#?@*$!-])/.exec(here);

      if (variable !== null) {
        parts.push({ part: "variable", text: variable[0] });
        at += variable[0].length;
        continue;
      }

      if (here.startsWith("$(")) break;

      const plain = /^(?:\\.|[^\s|;&<>()`'"$\\])+|^[$\\]/.exec(here)!;

      parts.push({ part: "plain", text: plain[0] });
      at += plain[0].length;
    }

    if (at === wordStart) {
      push("plain", command[at]!);
      at += 1;
      continue;
    }

    const word = command.slice(wordStart, at);
    const assignment = /^[A-Za-z_]\w*=/.test(word);
    const bare = parts.every((part) => part.part === "plain");

    if (bare && expectCommand && !assignment) {
      const keyword = KEYWORDS.has(word);

      push(keyword ? "operator" : "command", word);
      // A keyword that opens a list is followed by a command, as a prefix word like `sudo` is.
      expectCommand = keyword ? COMMAND_AFTER.has(word) || LIST_OPENERS.has(word) : PREFIX_WORDS.has(word);
      continue;
    }

    if (bare && /^--?[A-Za-z0-9]/.test(word)) {
      push("option", word);
      continue;
    }

    for (const part of parts) push(part.part, part.text);
  }

  return tokens;
}

/** The colour class each part of a command wears, from the console's ANSI palette. */
export const SHELL_COLOURS: Record<ShellPart, string> = {
  command: "text-(--ansi-green)",
  option: "text-(--ansi-cyan)",
  string: "text-(--ansi-yellow)",
  variable: "text-(--ansi-magenta)",
  operator: "text-(--ansi-blue)",
  comment: "text-(--ansi-gray)",
  plain: "text-highlighted"
};

// The files a command visibly writes: a redirection into a file, `tee`'s files, and the files `sed -i` edits in place.
const REDIRECT_INTO = /(?:^|[^<&\d])(?:\d?>>?|&>>?)\s*(['"]?)([^\s'"|;&<>()]+)\1/g;
const TEE = /\btee\s+((?:-\w+\s+)*)((?:['"]?[^\s'"|;&<>()]+['"]?\s*)+)/g;
const SED_IN_PLACE = /\bsed\s+(?:-[A-Za-z]*\s+)*-i\S*\s+(?:-[A-Za-z]+\s+)*(?:-e\s+)?('[^']*'|"[^"]*"|\S+)\s+((?:['"]?[^\s'"|;&<>()]+['"]?\s*)+)/g;

/** The files a shell command visibly writes, in the order it names them, a device like /dev/null aside. */
export function writtenFiles(command: string): string[] {
  const found: string[] = [];
  const add = (path: string): void => {
    const clean = path.replace(/^['"]|['"]$/g, "");

    if (clean !== "" && !clean.startsWith("/dev/") && !clean.startsWith("&") && !found.includes(clean)) found.push(clean);
  };
  // A heredoc's body is the file's words, never a command of its own.
  const lines = command.split("\n");
  const commandLines: string[] = [];
  let closing: string | null = null;

  for (const line of lines) {
    if (closing !== null) {
      if (line.trim() === closing) closing = null;
      continue;
    }

    commandLines.push(line);
    closing = /<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/.exec(line)?.[2] ?? null;
  }

  const text = commandLines.join("\n");

  for (const match of text.matchAll(REDIRECT_INTO)) add(match[2]!);
  for (const match of text.matchAll(TEE)) for (const path of match[2]!.trim().split(/\s+/)) add(path);
  for (const match of text.matchAll(SED_IN_PLACE)) for (const path of match[2]!.trim().split(/\s+/)) add(path);

  return found;
}
