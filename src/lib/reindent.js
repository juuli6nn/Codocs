// Languages where indentation is part of the syntax — reformatting these could
// change the program's meaning, so we leave them as-is.
const INDENT_SIGNIFICANT_LANGS = new Set(['python', 'yaml', 'haml', 'pug', 'coffeescript']);

const INDENT_UNIT = '  ';

/**
 * Re-indent brace-based code to a consistent two-spaces-per-level style.
 *
 * Indentation is recomputed from the running bracket depth, so flat or messily
 * pasted code comes out looking like it does in an editor. This is a heuristic,
 * not a parser; it's intentionally simple and skips whitespace-significant
 * languages where it could do harm.
 *
 * @param {string} code      The source to re-indent.
 * @param {string} [language] The language, used to skip indentation-sensitive ones.
 * @returns {string} The re-indented source.
 */
export function reindentCode(code, language) {
  if (language && INDENT_SIGNIFICANT_LANGS.has(language)) return code;
  if (!/[{}]/.test(code)) return code; // no braces — nothing to re-indent

  const lines = code.split('\n');
  const out = [];
  let depth = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      out.push('');
      continue;
    }

    // Closing brackets at the start of a line dedent that line itself.
    let leadingClosers = 0;
    for (const ch of trimmed) {
      if (ch === '}' || ch === ')' || ch === ']') leadingClosers++;
      else break;
    }

    const lineDepth = Math.max(depth - leadingClosers, 0);
    out.push(INDENT_UNIT.repeat(lineDepth) + trimmed);

    depth = Math.max(depth + bracketDelta(trimmed), 0);
  }

  return out.join('\n');
}

// Net change in bracket depth across a line, ignoring brackets inside string or
// character literals and after a line comment.
function bracketDelta(line) {
  let delta = 0;
  let inString = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
    if (ch === '/' && line[i + 1] === '/') break;
    if (ch === '{' || ch === '(' || ch === '[') delta++;
    else if (ch === '}' || ch === ')' || ch === ']') delta--;
  }
  return delta;
}
