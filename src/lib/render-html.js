import { BG, FG, FONT } from './theme.js';

/**
 * Build the rich-HTML version of a code block for the clipboard (selection mode).
 *
 * The output is a single-cell table with a dark background, holding one paragraph
 * whose lines are separated by <br>. This layout is deliberate: Google Docs
 * re-applies its own paragraph spacing to pasted block elements, so a <pre> or a
 * paragraph-per-line would render double-spaced. Keeping everything in one
 * paragraph keeps the lines tight, the way they look in an editor.
 *
 * @param {Array<{text: string, color: string}>} tokens
 * @returns {string} An HTML string ready to place on the clipboard.
 */
export function buildClipboardHtml(tokens) {
  // Split the flat token list into per-line groups.
  const lineTokens = splitTokensByLines(tokens);

  const lineHtmlParts = lineTokens.map(lineArr => {
    if (lineArr.length === 0) return ''; // blank line
    return lineArr.map(({ text, color }) => {
      const indented = preserveIndent(text);
      const escaped = escapeHtml(indented);
      // Set the color explicitly on every span. Without it, Docs falls back to
      // the surrounding paragraph's text color (often black) instead of the
      // theme foreground.
      return `<span style="color:${color};font-family:${FONT};font-size:10pt;">${escaped}</span>`;
    }).join('');
  });

  // <br> between lines keeps the whole block as one Docs paragraph.
  const body = lineHtmlParts.join('<br>');

  // A fixed pixel width (~6.5in, the usable width of a default Letter page at
  // 96dpi) makes the block span the page. width:100% alone collapses to the
  // content width in Docs and causes lines to wrap.
  const WIDTH = 624;
  // Set the background with both the legacy bgcolor attribute and the
  // background-color property. Docs honors these on table cells but drops the
  // background shorthand, so we avoid the shorthand entirely.
  return `<table cellpadding="0" cellspacing="0" width="${WIDTH}" bgcolor="${BG}" style="width:${WIDTH}px;border-collapse:collapse;background-color:${BG};border:none;table-layout:fixed;"><tbody><tr><td width="${WIDTH}" bgcolor="${BG}" style="width:${WIDTH}px;padding:14pt 18pt;background-color:${BG};border:none;"><p style="font-family:${FONT};font-size:10pt;line-height:1.2;color:${FG};margin:0;padding:0;white-space:pre-wrap;">${body}</p></td></tr></tbody></table>`;
}

// Split a flat token list into one array per line, breaking tokens on newlines.
function splitTokensByLines(tokens) {
  const lines = [[]];
  for (const { text, color } of tokens) {
    const parts = text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([]); // start a new line
      if (parts[i].length > 0) {
        lines[lines.length - 1].push({ text: parts[i], color });
      }
    }
  }
  // Drop a trailing empty line if the code ended with a newline.
  if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines;
}

// Replace leading spaces/tabs with non-breaking spaces so Docs keeps the
// indentation instead of collapsing the whitespace.
function preserveIndent(text) {
  return text.replace(/^ +/, m => ' '.repeat(m.length))
             .replace(/^\t+/, m => '    '.repeat(m.length));
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
