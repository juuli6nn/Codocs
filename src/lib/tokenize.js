import hljs from './hljs.js';
import { getColor, FG } from './theme.js';

/*
 * Syntax highlighting. Runs code through highlight.js and converts its output
 * into a flat list of { text, color } tokens that the renderers can consume.
 */

// highlight.js often scores C++ and C# within a point or two of each other on
// short snippets. These patterns are strong, near-unambiguous signals for one
// language or the other, so we use them to break the tie.
const CPP_TELLS = /#include\s*<|::|->|\bstd::|cout\s*<<|cin\s*>>|\bnullptr\b|\btemplate\s*</;
const CSHARP_TELLS = /\busing\s+System\b|\bConsole\.(Write|Read)|\bnamespace\s+\w+\s*\{|\bpublic\s+(static\s+)?(class|void)\b|\bvar\s+\w+\s*=|=>\s*[{(]|\bstring\.\w|\bnew\s+\w+\s*\(\)/;

// Resolve a C++/C# ambiguity using the tell-tale patterns above.
function disambiguate(code, detectedLanguage) {
  if (detectedLanguage !== 'cpp' && detectedLanguage !== 'csharp') return detectedLanguage;
  const looksCpp = CPP_TELLS.test(code);
  const looksCsharp = CSHARP_TELLS.test(code);
  if (looksCpp && !looksCsharp) return 'cpp';
  if (looksCsharp && !looksCpp) return 'csharp';
  return detectedLanguage;
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
