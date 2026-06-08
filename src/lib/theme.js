/*
 * Color theme (Atom One Dark). Maps highlight.js token classes to the colors used
 * in the formatted output, and exports the block background, default foreground,
 * and monospace font stack.
 */

export const BG = '#282c34';   // code block background
export const FG = '#abb2bf';   // default text color
export const FONT = 'Consolas, "Courier New", monospace';

const CLASS_COLORS = {
  'hljs-keyword':    '#c678dd',
  'hljs-doctag':     '#c678dd',
  'hljs-formula':    '#c678dd',
  'hljs-string':     '#98c379',
  'hljs-regexp':     '#98c379',
  'hljs-addition':   '#98c379',
  'hljs-comment':    '#5c6370',
  'hljs-quote':      '#5c6370',
  'hljs-number':     '#d19a66',
  'hljs-attr':       '#d19a66',
  'hljs-variable':   '#d19a66',
  'hljs-type':       '#d19a66',
  'hljs-name':       '#e06c75',
  'hljs-section':    '#e06c75',
  'hljs-deletion':   '#e06c75',
  'hljs-subst':      '#e06c75',
  'hljs-built_in':   '#e6c07b',
  'hljs-title':      '#61aeee',
  'hljs-symbol':     '#61aeee',
  'hljs-bullet':     '#61aeee',
  'hljs-link':       '#61aeee',
  'hljs-meta':       '#61aeee',
  'hljs-literal':    '#56b6c2',
  'hljs-selector-tag':   '#e06c75',
  'hljs-selector-id':    '#61aeee',
  'hljs-selector-class': '#e6c07b',
  'hljs-template-tag':   '#c678dd',
  'hljs-template-variable': '#d19a66',
  'hljs-tag':        '#e06c75',
  'hljs-class':      '#e6c07b',
  'hljs-params':     '#abb2bf',
  'hljs-title class_':   '#e6c07b',
  'hljs-title function_': '#61aeee',
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
