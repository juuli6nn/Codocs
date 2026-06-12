// Languages where layout can't be reconstructed once collapsed (indentation /
// line breaks are load-bearing and unrecoverable), so leave them untouched.
// SQL and Python are NOT here — they get dedicated formatters below.
const SKIP = new Set([
  'yaml', 'haml', 'pug', 'coffeescript', 'markdown', 'dockerfile',
  'ini', 'toml', 'haskell', 'plaintext',
]);

const VOID_TAGS = new Set([
  'area','base','br','col','embed','hr','img','input','link',
  'meta','param','source','track','wbr','!doctype',
]);

const UNIT = '  ';

/**
 * Re-indent (and expand if minified) code to a consistent two-spaces-per-level style.
 *
 * First expands "minified" code (multiple statements on one line) into proper lines,
 * then re-indents using the right strategy for the language family:
 *   - HTML/XML       — tag-aware
 *   - SQL            — clause-aware (SELECT/FROM/WHERE on their own lines)
 *   - Python         — colon / dedent-keyword aware (best-effort)
 *   - Ruby/Lua/Bash  — keyword-aware (def/end, function/end, do/done)
 *   - Brace-based    — bracket depth (C, Java, JS, Go, Rust, CSS, …)
 *   - Skip           — YAML, Markdown, TOML, Haskell, etc.
 *
 * @param {string} code
 * @param {string} [language]
 * @returns {string}
 */
export function reindentCode(code, language) {
  if (language && SKIP.has(language)) return code;
  if (language === 'xml' || looksLikeHtml(code)) return reindentHtml(expandHtml(code));
  if (language === 'sql')    return reindentSql(code);
  if (language === 'json')   return reindentJson(code);
  if (language === 'python') return reindentPython(code);
  if (language === 'ruby') return reindentKeyword(expandBraces(code), RUBY_RULES);
  if (language === 'lua')  return reindentKeyword(expandBraces(code), LUA_RULES);
  if (language === 'bash') return reindentKeyword(expandBraces(code), BASH_RULES);
  if (/[{}]/.test(code))  return reindentBraces(expandBraces(code));
  return code;
}

// ── Expansion — split minified / single-line code into proper lines ───────────

const HTML_STRONG = /<!DOCTYPE\s+html|<html[\s>]|<\/html>/i;
const HTML_TAGS   = /<\/(?:div|span|body|head|title|p|a|ul|ol|li|table|tr|td|h[1-6]|button|section|header|footer|nav|script|style)>/i;

function looksLikeHtml(code) {
  if (HTML_STRONG.test(code)) return true;
  return HTML_TAGS.test(code) && /<\/[a-z][\w-]*>/i.test(code);
}

// Expand if any line has non-comment content after an opening brace, OR if
// multiple semicolons appear on one line (CSS properties / statements collapsed).
function needsBraceExpansion(code) {
  const lines = code.split('\n').filter(l => l.trim());
  if (!lines.length) return false;
  return lines.some(l => {
    const t = l.trim();
    // Content after an opening brace — block is minified.
    const openIdx = t.indexOf('{');
    if (openIdx !== -1) {
      const after = t.slice(openIdx + 1).trim();
      if (after.length > 0 && !after.startsWith('//') && !after.startsWith('/*')) return true;
    }
    // Multiple semicolons on one line — properties/statements are collapsed.
    const semiCount = (t.match(/;/g) || []).length;
    return semiCount >= 2;
  });
}

// Split minified brace-based code into one statement/block per line.
// Handles: splitting after `{`, before `}`, after `;` (outside parens).
// Keeps `} else {`, `} catch {`, `};` together on the same line.
function expandBraces(code) {
  if (!needsBraceExpansion(code)) return code;

  const out = [];
  let cur = '', inStr = null, inLineComment = false, inBlockComment = false, parenDepth = 0;
  const flush = () => { const t = cur.trim(); if (t) out.push(t); cur = ''; };

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];

    if (ch === '\n') { inLineComment = false; flush(); continue; }
    if (inLineComment) {
      // In pasted code with stripped newlines, a structural { or } after a //
      // comment means the original line break was removed. Treat it as a new line.
      if (ch === '{' || ch === '}') { inLineComment = false; flush(); /* fall through to brace handling below */ }
      else { cur += ch; continue; }
    }
    if (inBlockComment) {
      cur += ch;
      if (ch === '*' && code[i + 1] === '/') { cur += '/'; i++; inBlockComment = false; }
      continue;
    }
    if (inStr) {
      cur += ch;
      if (ch === '\\') { cur += code[++i]; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }

    if (ch === '/' && code[i + 1] === '/') { inLineComment = true; cur += ch; continue; }
    if (ch === '/' && code[i + 1] === '*') { inBlockComment = true; cur += ch; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') { parenDepth++; cur += ch; continue; }
    if (ch === ')' || ch === ']') { parenDepth--; cur += ch; continue; }

    if (ch === '{') {
      cur += ch; flush();
    } else if (ch === '}') {
      flush(); cur += ch;

      // Consume a trailing semicolon so "};" stays on the same line.
      let j = i + 1;
      while (j < code.length && (code[j] === ' ' || code[j] === '\t')) j++;
      if (j < code.length && code[j] === ';') { cur += ';'; i = j; }

      const rest = code.slice(i + 1).trimStart();
      if (!/^(else|catch|finally|while)\b/.test(rest)) {
        flush();
      } else {
        // Skip whitespace between } and the keyword, then ensure one space.
        while (i + 1 < code.length && (code[i + 1] === ' ' || code[i + 1] === '\t')) i++;
        cur += ' ';
      }
    } else if (ch === ';' && parenDepth === 0) {
      cur += ch; flush();
    } else {
      cur += ch;
    }
  }
  flush();
  return out.join('\n');
}

// Split single-line HTML into one tag per line (only when a line has many tags).
function expandHtml(code) {
  return code.split('\n').map(line => {
    if ((line.match(/<[^>]+>/g) || []).length <= 2) return line;
    return line.replace(/>\s*</g, '>\n<');
  }).join('\n');
}

// ── JSON ───────────────────────────────────────────────────────────────────────
// Valid JSON round-trips through the native parser for guaranteed-correct 2-space
// indentation. Invalid/partial JSON (or JSONC with comments) falls back to the
// generic brace expander so it's at least broken into lines.

function reindentJson(code) {
  try {
    return JSON.stringify(JSON.parse(code), null, 2);
  } catch {
    return /[{}]/.test(code) ? reindentBraces(expandBraces(code)) : code;
  }
}

// ── HTML / XML ────────────────────────────────────────────────────────────────

function reindentHtml(code) {
  const lines = code.split('\n');
  const out = [];
  let depth = 0;

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) { out.push(''); continue; }
    const { count, rest } = stripLeadingCloseTags(t);
    depth = Math.max(depth - count, 0);
    out.push(UNIT.repeat(depth) + t);
    depth = Math.max(depth + tagDelta(rest), 0);
  }
  return out.join('\n');
}

function stripLeadingCloseTags(line) {
  let count = 0, i = 0;
  while (i < line.length) {
    const m = line.slice(i).match(/^<\/([a-z][\w-]*)\s*>/i);
    if (m) { count++; i += m[0].length; } else break;
  }
  return { count, rest: line.slice(i) };
}

function tagDelta(line) {
  let delta = 0;
  const re = /<\/?([a-z!][\w-]*)([^>]*)>/gi;
  let m;
  while ((m = re.exec(line)) !== null) {
    const isClose     = m[0].startsWith('</');
    const isSelfClose = m[2].trimEnd().endsWith('/');
    const tagName     = m[1].toLowerCase();
    if (isSelfClose || VOID_TAGS.has(tagName)) continue;
    if (isClose) delta--; else delta++;
  }
  return delta;
}

// ── Keyword-based (Ruby / Lua / Bash) ────────────────────────────────────────

const RUBY_RULES = {
  opener: /\b(def|class|module|if|unless|while|until|for|begin|case|do)\b(?!.*\bend\b)/,
  closer: /^(end|else|elsif|rescue|ensure|when)\b/,
};
const LUA_RULES = {
  opener: /\b(function|if|for|while|repeat|do)\b(?!.*\bend\b)/,
  closer: /^(end|else|elseif|until)\b/,
};
const BASH_RULES = {
  opener: /\b(then|do)\s*$|^\{/,
  closer: /^(fi|done|esac|else|elif|\})\b/,
};

function reindentKeyword(code, rules) {
  const lines = code.split('\n');
  const out = [];
  let depth = 0;

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) { out.push(''); continue; }
    const isCloser = rules.closer.test(t);
    const ld = Math.max(depth - (isCloser ? 1 : 0), 0);
    out.push(UNIT.repeat(ld) + t);
    if (!isCloser && rules.opener.test(t)) depth = ld + 1;
    else if (isCloser) depth = ld;
  }
  return out.join('\n');
}

// ── Brace-based (C, Java, JS, Go, Rust, PHP, CSS, etc.) ──────────────────────

function reindentBraces(code) {
  const lines = code.split('\n');
  const out = [];
  let depth = 0;

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) { out.push(''); continue; }

    let leadingClosers = 0;
    for (const ch of t) {
      if (ch === '}' || ch === ')' || ch === ']') leadingClosers++;
      else break;
    }

    const ld = Math.max(depth - leadingClosers, 0);
    out.push(UNIT.repeat(ld) + t);
    depth = Math.max(depth + bracketDelta(t), 0);
  }
  return out.join('\n');
}

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

// ── SQL ──────────────────────────────────────────────────────────────────────
// SQL has no braces, so it's formatted by clause: each major keyword (SELECT,
// FROM, WHERE, JOIN, …) starts a new line, AND/OR/ON indent under their clause,
// and parenthesised sub-SELECTs indent by paren depth. A small tokenizer keeps
// string literals and quoted identifiers intact.

const SQL_UNIT = '  ';

// Reserved words we uppercase. Function names (COUNT, SUM, …) are deliberately
// left out so user identifiers and their casing are never touched.
const SQL_RESERVED = new Set(`
  SELECT FROM WHERE AND OR NOT NULL IS IN LIKE BETWEEN EXISTS ANY SOME
  JOIN INNER LEFT RIGHT FULL OUTER CROSS NATURAL ON USING
  GROUP BY ORDER HAVING LIMIT OFFSET FETCH NEXT ROW ROWS ONLY
  UNION ALL EXCEPT INTERSECT DISTINCT AS ASC DESC
  INSERT INTO VALUES UPDATE SET DELETE TRUNCATE MERGE USE
  CREATE TABLE VIEW INDEX SEQUENCE DATABASE SCHEMA DROP ALTER ADD COLUMN
  PRIMARY KEY FOREIGN REFERENCES UNIQUE CHECK CONSTRAINT DEFAULT
  CASE WHEN THEN ELSE END WITH RETURNING INTO
`.trim().split(/\s+/));

// Uppercase statement keywords that end a run-on line comment — in minified
// paste the newline that used to terminate the comment is gone, so the next
// statement begins right after the comment text.
const SQL_COMMENT_STOP = /^(CREATE|USE|SELECT|INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|MERGE|GRANT|REVOKE|WITH|BEGIN|COMMIT|ROLLBACK)\b/;

function tokenizeSql(code) {
  const tokens = [];
  const n = code.length;
  let i = 0;
  const isWord = c => /[A-Za-z0-9_$]/.test(c);
  while (i < n) {
    const ch = code[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    // line comments: -- … or # …  (stop at newline OR a run-on statement keyword)
    if ((ch === '-' && code[i + 1] === '-') || ch === '#') {
      let j = i + (ch === '#' ? 1 : 2);
      while (j < n && code[j] !== '\n') {
        if ((code[j - 1] === ' ' || code[j - 1] === '\t') && SQL_COMMENT_STOP.test(code.slice(j))) break;
        j++;
      }
      tokens.push({ type: 'comment', value: code.slice(i, j).replace(/\s+$/, '') }); i = j; continue;
    }
    // block comment /* … */
    if (ch === '/' && code[i + 1] === '*') {
      let j = i + 2; while (j < n && !(code[j] === '*' && code[j + 1] === '/')) j++;
      j = Math.min(j + 2, n);
      tokens.push({ type: 'comment', value: code.slice(i, j) }); i = j; continue;
    }
    // strings / quoted identifiers — '' and "" doubling escapes the quote
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === ch) { if (code[j + 1] === ch) { j += 2; continue; } j++; break; }
        j++;
      }
      tokens.push({ type: 'string', value: code.slice(i, j) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1; while (j < n && isWord(code[j])) j++;
      tokens.push({ type: 'word', value: code.slice(i, j) }); i = j; continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i + 1; while (j < n && /[0-9._]/.test(code[j])) j++;
      tokens.push({ type: 'number', value: code.slice(i, j) }); i = j; continue;
    }
    const two = code.slice(i, i + 2);
    if (['<=', '>=', '<>', '!=', '||', '::'].includes(two)) {
      tokens.push({ type: 'punct', value: two }); i += 2; continue;
    }
    tokens.push({ type: 'punct', value: ch }); i++;
  }
  return tokens;
}

function reindentSql(code) {
  const tokens = tokenizeSql(code);
  if (!tokens.length) return code.trim();

  // Display form: reserved words uppercased, everything else verbatim.
  for (const t of tokens) {
    t.display = (t.type === 'word' && SQL_RESERVED.has(t.value.toUpperCase()))
      ? t.value.toUpperCase() : t.value;
  }

  const up = k => (tokens[k] && tokens[k].type === 'word') ? tokens[k].value.toUpperCase() : '';
  const JOIN_MODS = ['LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'NATURAL', 'OUTER'];
  // Keywords that begin a fresh statement (so they break onto their own line).
  const STMT_START = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER',
    'DROP', 'TRUNCATE', 'MERGE', 'USE', 'WITH', 'GRANT', 'REVOKE'];
  const NO_SPACE_BEFORE = new Set([',', ';', ')', '.', '::']);
  const NO_SPACE_AFTER  = new Set(['(', '.', '::']);

  const lines = [];
  let cur = '', hasContent = false, depth = 0, betweenPending = false, prev = null;
  let statementType = '', lastKeyword = '';
  const parenKinds = [];          // stack: 'list' | 'fn' | 'group'

  const indent = lvl => SQL_UNIT.repeat(Math.max(lvl, 0));
  const startLine = lvl => {
    if (hasContent) lines.push(cur.replace(/[ \t]+$/, ''));
    cur = indent(lvl); hasContent = false; prev = null;
  };
  const appendTok = (val, forceNoSpace, tok) => {
    if (!hasContent) cur += val;
    else {
      const noSpace = forceNoSpace || NO_SPACE_BEFORE.has(val) ||
        (prev && NO_SPACE_AFTER.has(prev.display));
      cur += (noSpace ? '' : ' ') + val;
    }
    hasContent = true; prev = tok || { type: 'punct', display: val };
  };

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];

    // Comments sit on their own line (in the source they ended the line).
    if (t.type === 'comment') {
      const lineComment = t.value.startsWith('--') || t.value.startsWith('#');
      if (lineComment && hasContent) startLine(depth);
      appendTok(t.value, false, t);
      if (lineComment) startLine(depth);
      continue;
    }

    if (t.type === 'word') {
      const u = t.value.toUpperCase();
      const next = up(k + 1);
      const prevU = prev && prev.type === 'word' ? prev.value.toUpperCase() : '';

      if (u === 'CREATE') statementType = 'create';
      else if (u === 'INSERT') statementType = 'insert';
      if (u === 'VALUES' || u === 'INTO') lastKeyword = u;

      const major =
        STMT_START.includes(u) ||
        ['WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'SET', 'EXCEPT', 'INTERSECT',
         'RETURNING', 'UNION', 'VALUES'].includes(u) ||
        (u === 'FROM' && prevU !== 'DELETE') ||
        ((u === 'GROUP' || u === 'ORDER') && next === 'BY') ||
        ['LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'NATURAL'].includes(u) ||
        (u === 'JOIN' && !JOIN_MODS.includes(prevU));

      if (major) {
        if (hasContent) startLine(depth);
      } else if (u === 'AND' || u === 'OR') {
        if (betweenPending && u === 'AND') betweenPending = false;
        else if (hasContent) startLine(depth + 1);
      } else if (u === 'ON') {
        if (hasContent) startLine(depth + 1);
      }
      if (u === 'BETWEEN') betweenPending = true;

      appendTok(t.display, false, t);
      continue;
    }

    if (t.type === 'punct' && t.value === '(') {
      const prevWord = prev && prev.type === 'word';
      const prevKeyword = prevWord && SQL_RESERVED.has(prev.value.toUpperCase());
      // A top-level paren in CREATE / INSERT / after VALUES is a definition or
      // value list — break it one item per line. Anything after a plain word is
      // a function call (kept tight); everything else is a group/subquery.
      let kind;
      if (parenKinds.length === 0 &&
          (statementType === 'create' || statementType === 'insert' || lastKeyword === 'VALUES')) {
        kind = 'list';
      } else if (prevWord && !prevKeyword) {
        kind = 'fn';
      } else {
        kind = 'group';
      }
      appendTok('(', kind === 'fn', t);
      parenKinds.push(kind);
      depth++;
      if (kind === 'list') startLine(depth);   // first item on its own indented line
      continue;
    }

    if (t.type === 'punct' && t.value === ')') {
      const kind = parenKinds.pop();
      depth = Math.max(depth - 1, 0);
      if (kind === 'list') startLine(depth);     // closing paren on its own line
      appendTok(')', true, t);
      continue;
    }

    if (t.type === 'punct' && t.value === ',') {
      appendTok(',', true, t);
      if (parenKinds[parenKinds.length - 1] === 'list') startLine(depth);
      continue;
    }

    if (t.type === 'punct' && t.value === ';') {
      appendTok(';', true, t);
      startLine(0);
      statementType = ''; lastKeyword = '';
      continue;
    }

    appendTok(t.display, false, t);
  }
  if (hasContent) lines.push(cur.replace(/[ \t]+$/, ''));
  return lines.join('\n');
}

// ── Python (best-effort) ─────────────────────────────────────────────────────
// Python's layout is its syntax, so once it's collapsed the structure can't be
// recovered perfectly. This reconstructs indentation heuristically: nest after a
// line ending in ':', align else/elif/except/finally to their opener, and dedent
// after a block terminator (return/raise/pass/break/continue) unless the next
// line is a sibling keyword. Good for flush-left paste; single-line input is
// split first and is inherently approximate.

const PY_UNIT = '    ';
const PY_DEDENT_KW = /^(else|elif|except|finally|case)\b/;
const PY_TERMINATOR = /^(return|raise|pass|break|continue)\b/;
const PY_BLOCK_KW = /^(def|class|if|elif|else|for|while|with|try|except|finally|return|import|from|raise|pass|break|continue|async)\b/;

function reindentPython(code) {
  // If the code already carries indentation, trust it — rebuilding from scratch
  // can only lose information. We only reconstruct when the structure was
  // destroyed: everything flush-left, or collapsed onto a single line.
  if (code.includes('\n') && /\n[ \t]+\S/.test('\n' + code)) return code;

  const lines = code.includes('\n') ? code.split('\n') : splitPythonStatements(code);
  const trimmed = lines.map(l => l.trim());
  const out = [];
  let depth = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const t = trimmed[i];
    if (!t) { out.push(''); continue; }

    let d = depth;
    if (PY_DEDENT_KW.test(t)) d = Math.max(depth - 1, 0);
    out.push(PY_UNIT.repeat(d) + t);

    if (/:\s*$/.test(stripPyComment(t))) {
      depth = d + 1;                       // opens a block
    } else if (PY_TERMINATOR.test(t)) {
      // Block likely ends here — but don't dedent if a sibling keyword follows,
      // since it aligns itself.
      let j = i + 1;
      while (j < trimmed.length && !trimmed[j]) j++;
      const nextIsSibling = j < trimmed.length && PY_DEDENT_KW.test(trimmed[j]);
      depth = nextIsSibling ? d : Math.max(d - 1, 0);
    } else {
      depth = d;
    }
  }
  return out.join('\n');
}

function stripPyComment(line) {
  let inStr = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '#') return line.slice(0, i);
  }
  return line;
}

// Split single-line Python into statements: break on top-level ';', after a
// top-level ':' that's followed by more code, and before a block keyword that
// starts a fresh clause. Heuristic — single-line Python is inherently lossy.
function splitPythonStatements(code) {
  const out = [];
  let cur = '', inStr = null, depth = 0;
  const flush = () => { const t = cur.trim(); if (t) out.push(t); cur = ''; };

  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (inStr) { cur += c; if (c === '\\') { cur += code[++i] ?? ''; } else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; cur += c; continue; }
    if (c === ')' || c === ']' || c === '}') { depth = Math.max(depth - 1, 0); cur += c; continue; }

    if (depth === 0 && c === ';') { flush(); continue; }
    if (depth === 0 && c === ':') {
      cur += c;
      if (code.slice(i + 1).trim()) flush();          // code after the colon → new line
      continue;
    }
    // Break before a block keyword that begins a new statement (word boundary).
    if (depth === 0 && /\s/.test(cur.slice(-1)) && PY_BLOCK_KW.test(code.slice(i))) {
      flush();
    }
    cur += c;
  }
  flush();
  return out;
}
