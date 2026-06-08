import hljs from './hljs.js';

/*
 * Heuristic code detection, used by whole-document formatting to decide which
 * paragraphs are source code. Combines a few lightweight signals (symbol density,
 * keywords, indentation, common code punctuation) with highlight.js's confidence
 * score.
 */

const CODE_SYMBOLS_RE = /[;{}()\[\]<>=!&|+\-*/%]/g;
const CODE_KEYWORDS = new Set([
  'function', 'class', 'def', 'import', 'export', 'from', 'require',
  'var', 'let', 'const', 'if', 'else', 'elif', 'for', 'while', 'do',
  'return', 'public', 'private', 'protected', 'static', 'void', 'new',
  'null', 'undefined', 'true', 'false', 'True', 'False', 'None',
  'int', 'float', 'double', 'bool', 'string', 'char', 'long', 'short',
  'try', 'catch', 'finally', 'throw', 'throws', 'extends', 'implements',
  'interface', 'abstract', 'override', 'async', 'await', 'yield',
  'print', 'println', 'console', 'System', 'this', 'super',
]);

/**
 * Decide whether a block of text looks like source code.
 *
 * The score is a 0–1 blend of several signals; 0.5 and above is treated as code.
 * A very high highlight.js confidence score also counts as code on its own.
 *
 * @param {string} text The paragraph text to classify.
 * @returns {{ isCode: boolean, score: number, language: string|null }}
 */
export function isCodeParagraph(text) {
  if (!text || text.trim().length < 10) {
    return { isCode: false, score: 0, language: null };
  }

  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return { isCode: false, score: 0, language: null };

  // Symbol density — how much of the text is code punctuation.
  const symbolMatches = text.match(CODE_SYMBOLS_RE) || [];
  const symbolDensity = symbolMatches.length / text.length;
  const symbolScore = Math.min(symbolDensity * 10, 1); // saturates around 10% symbols

  // Keyword presence — fraction of words that are common code keywords.
  const words = text.split(/\s+/);
  const keywordCount = words.filter(w => CODE_KEYWORDS.has(w.replace(/[^a-zA-Z]/g, ''))).length;
  const keywordScore = Math.min(keywordCount / Math.max(words.length, 1) * 5, 1);

  // Indentation — fraction of lines that begin with leading whitespace.
  const indentedLines = lines.filter(l => /^[ \t]{2,}/.test(l));
  const indentScore = lines.length > 1 ? indentedLines.length / lines.length : 0;

  // Telltale code punctuation (semicolons, braces, comments, arrows, etc.).
  const patternScore = /[;{}]|\/\/|\/\*|#\s*\w|=>/g.test(text) ? 0.3 : 0;

  const score = (symbolScore * 0.35) + (keywordScore * 0.30) + (indentScore * 0.20) + (patternScore * 0.15);

  // highlight.js's own confidence can override a low heuristic score.
  let detectedLanguage = null;
  let relevance = 0;
  try {
    const result = hljs.highlightAuto(text.slice(0, 500)); // cap length for speed
    detectedLanguage = result.language || null;
    relevance = result.relevance || 0;
  } catch {
    // Detection failed; fall back to the heuristic score alone.
  }

  const isCode = score >= 0.5 || relevance >= 8;
  return { isCode, score, language: isCode ? detectedLanguage : null };
}
