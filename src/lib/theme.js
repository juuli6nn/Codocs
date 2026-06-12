/*
 * Color theme (Atom One Dark). Maps highlight.js token classes to the colors used
 * in the formatted output, and exports the block background, default foreground,
 * and monospace font stack.
 */

export const BG   = '#1a1e27';   // slightly deeper black — more IDE-like
export const FG   = '#cdd6f4';   // brighter default text for readability
export const FONT = 'Consolas';  // single family — no fallback list so Docs can't misread it

// Neon-boosted palette — same hue families as Atom One Dark but higher
// saturation and brightness so every token is crisp on the dark background.
const CLASS_COLORS = {
  'hljs-keyword':    '#e879f9',  // neon magenta/purple
  'hljs-doctag':     '#e879f9',
  'hljs-formula':    '#e879f9',
  'hljs-string':     '#a3e635',  // neon lime-green
  'hljs-regexp':     '#a3e635',
  'hljs-addition':   '#a3e635',
  'hljs-comment':    '#6b7280',  // muted grey (intentionally dim)
  'hljs-quote':      '#6b7280',
  'hljs-number':     '#fb923c',  // neon orange
  'hljs-attr':       '#fb923c',
  'hljs-variable':   '#fb923c',
  'hljs-type':       '#fb923c',
  'hljs-name':       '#f87171',  // neon red/coral (tags)
  'hljs-section':    '#f87171',
  'hljs-deletion':   '#f87171',
  'hljs-subst':      '#f87171',
  'hljs-built_in':   '#fbbf24',  // neon amber
  'hljs-title':      '#38bdf8',  // neon sky-blue (function names)
  'hljs-symbol':     '#38bdf8',
  'hljs-bullet':     '#38bdf8',
  'hljs-link':       '#38bdf8',
  'hljs-meta':       '#38bdf8',
  'hljs-literal':    '#22d3ee',  // neon cyan
  'hljs-selector-tag':      '#f87171',
  'hljs-selector-id':       '#38bdf8',
  'hljs-selector-class':    '#fbbf24',
  'hljs-template-tag':      '#e879f9',
  'hljs-template-variable': '#fb923c',
  'hljs-tag':               '#f87171',
  'hljs-class':              '#fbbf24',
  'hljs-params':             '#cdd6f4',
  'hljs-title class_':       '#fbbf24',
  'hljs-title function_':    '#38bdf8',
};

// Resolve a highlight.js class string to a color, falling back to the default
// foreground when none of the classes are mapped.
export function getColor(className) {
  if (!className) return FG;
  const classes = className.trim().split(/\s+/);
  for (const cls of classes) {
    if (CLASS_COLORS[cls]) return CLASS_COLORS[cls];
  }
  return FG;
}
