import hljs from './hljs.js';
import { getColor, FG } from './theme.js';

/*
 * Syntax highlighting. Runs code through highlight.js and converts its output
 * into a flat list of { text, color } tokens that the renderers can consume.
 */

// highlight.js's auto-detect is unreliable on short snippets — it confuses
// closely-related languages. These near-unambiguous patterns let us override its
// pick. Each entry: the target language, the patterns that signal it, and the set
// of (wrong) detections it's allowed to correct.
const CPP_TELLS = /#include\s*<|::|->|\bstd::|cout\s*<<|cin\s*>>|\bnullptr\b|\btemplate\s*</;
const CSHARP_TELLS = /\busing\s+System\b|\bConsole\.(Write|Read)|\bnamespace\s+\w+\s*\{|\bpublic\s+(static\s+)?(class|void)\b|\bstring\.\w/;

// HTML detection: strong signals always win regardless of what hljs detected.
const HTML_STRONG  = /<!DOCTYPE\s+html|<html[\s>]|<\/html>/i;
const HTML_TAGS    = /<\/(?:div|span|body|head|title|p|a|ul|ol|li|table|tr|td|h[1-6]|button|section|header|footer|nav|script|style)>/i;
function looksLikeHtml(code) {
  if (HTML_STRONG.test(code)) return true;
  return HTML_TAGS.test(code) && /<\/[a-z][\w-]*>/i.test(code);
}

// SQL is frequently misread as C/C++/C# (shared INT, parens, semicolons). A
// DDL/DML statement keyword plus a SQL-specific clause/type is a strong tell.
const SQL_STMT  = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+(TABLE|DATABASE|VIEW|INDEX|SCHEMA)|ALTER\s+TABLE|DROP\s+(TABLE|DATABASE|VIEW|INDEX)|TRUNCATE\s+TABLE)\b/i;
const SQL_CLAUSE = /\b(FROM|WHERE|VALUES|PRIMARY\s+KEY|FOREIGN\s+KEY|REFERENCES|VARCHAR|INNER\s+JOIN|LEFT\s+JOIN|GROUP\s+BY|ORDER\s+BY)\b/i;
function looksLikeSql(code) { return SQL_STMT.test(code) && SQL_CLAUSE.test(code); }

const OVERRIDES = [
  // from:null = always check, regardless of what hljs returned.
  { lang: 'xml',  test: looksLikeHtml, from: null },
  { lang: 'sql',  test: looksLikeSql,  from: null },
  // Python is often confused with Ruby (shared def/return). Colon-terminated
  // defs, elif, and import-forms are Python-only; end/puts/nil/elsif rule it out.
  { lang: 'python',
    test: c => (/\bdef\s+\w+\s*\([^)]*\)\s*:/.test(c) || /\belif\b/.test(c) ||
                /^\s*(import\s+\w+|from\s+\w+\s+import\b)/m.test(c) || /\bprint\s*\(/.test(c)) &&
               !/\b(end|puts|nil|elsif)\b/.test(c),
    from: ['ruby', 'coffeescript', 'plaintext'] },
  { lang: 'java', test: c => /\bpublic\s+class\b|\bpublic\s+static\s+void\s+main\b|\bSystem\.(out|err)\.|import\s+java\./.test(c),
    from: ['typescript', 'javascript', 'csharp', 'kotlin', 'scala', 'cpp'] },
  { lang: 'dart', test: c => /\bvoid\s+main\s*\(\s*\)|import\s+'dart:|@override\b|\bWidget\s+build\b/.test(c),
    from: ['javascript', 'typescript'] },
  { lang: 'r',    test: c => /<-\s|\b[a-zA-Z_.][\w.]*\s*<-\s/.test(c) && /\bc\(\s*[\d"']/.test(c),
    from: ['scss', 'css', 'less', 'plaintext'] },
  { lang: 'scss', test: c => /\$[\w-]+\s*:\s*[^;{]+;|&:\w|@mixin\b|@include\b|@extend\b/.test(c),
    from: ['ruby', 'css', 'less', 'plaintext'] },
  // Objective-C: #import, @interface/@implementation, NSLog, NSString, @"literals".
  // Checked before the C/C++ override since both use C-style includes.
  { lang: 'objectivec',
    test: c => /#import\s*<|@interface\b|@implementation\b|\bNSLog\s*\(|\bNS(String|Array|Dictionary|Object|Number|Mutable\w+)\b|@"[^"]*"/.test(c),
    from: ['javascript', 'typescript', 'c', 'cpp', 'plaintext'] },
  // C / C++ minified snippets are frequently misread as JS. #include, std::,
  // cout/cin, ->, :: and nullptr are unambiguous C-family tells.
  { lang: 'cpp',
    test: c => /#include\s*<|\bstd::|cout\s*<<|cin\s*>>|\bnullptr\b|\btemplate\s*</.test(c),
    from: ['javascript', 'typescript', 'plaintext'] },
];

// Override hljs's pick when our own signals are more reliable than its score.
function disambiguate(code, detectedLanguage) {
  for (const o of OVERRIDES) {
    if ((o.from === null || o.from.includes(detectedLanguage)) && o.test(code)) return o.lang;
  }
  // C++ vs C# tie-break.
  if (detectedLanguage === 'cpp' || detectedLanguage === 'csharp') {
    const looksCpp = CPP_TELLS.test(code);
    const looksCsharp = CSHARP_TELLS.test(code);
    if (looksCpp && !looksCsharp) return 'cpp';
    if (looksCsharp && !looksCpp) return 'csharp';
  }
  return detectedLanguage;
}

/**
 * Detect the language of a code block (highlight.js auto-detect, corrected by
 * our disambiguation rules). Used before reindenting so the right formatter runs
 * even on the 'auto' path.
 *
 * @param {string} code
 * @returns {string} A language id (falls back to 'plaintext').
 */
export function detectLanguage(code) {
  try {
    const result = hljs.highlightAuto(code);
    return disambiguate(code, result.language || 'plaintext');
  } catch {
    return 'plaintext';
  }
}

/**
 * Highlight a block of code.
 *
 * @param {string} code      The source to highlight.
 * @param {string} [language] A specific language, or 'auto'/empty to detect.
 * @returns {{ tokens: Array<{text: string, color: string}>, detectedLanguage: string, relevance: number }}
 */
export function tokenize(code, language) {
  let highlighted;
  let detectedLanguage = language;
  let relevance = 0;

  if (!language || language === 'auto') {
    const result = hljs.highlightAuto(code);
    detectedLanguage = disambiguate(code, result.language || 'plaintext');
    relevance = result.relevance || 0;
    // Re-highlight only if disambiguation overrode the detected language.
    highlighted = (detectedLanguage === result.language)
      ? result.value
      : hljs.highlight(code, { language: detectedLanguage }).value;
  } else {
    try {
      const result = hljs.highlight(code, { language });
      highlighted = result.value;
      detectedLanguage = language;
      relevance = result.relevance || 0;
    } catch {
      // Unknown language — render as plain text.
      highlighted = escapeHtml(code);
      detectedLanguage = 'plaintext';
    }
  }

  const tokens = parseTokens(highlighted);
  return { tokens, detectedLanguage, relevance };
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Convert highlight.js's HTML output into { text, color } tokens by walking its
// span tree and mapping each span's class to a theme color.
function parseTokens(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<pre>${html}</pre>`, 'text/html');
  const pre = doc.querySelector('pre');
  const tokens = [];

  walkNode(pre, null, tokens);
  return tokens;
}

// Recursively collect text nodes, tagging each with the color of its nearest
// styled ancestor.
function walkNode(node, inheritedClass, tokens) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent;
      if (text) {
        tokens.push({ text, color: getColor(inheritedClass) });
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const cls = child.className || inheritedClass;
      walkNode(child, cls, tokens);
    }
  }
}
