/**
 * src/core/dom-tree.js
 * Utilities for walking and querying the intermediate DOM tree JSON.
 */

/**
 * Depth-first walk of the dom tree.
 * @param {object} node
 * @param {(node: object, depth: number) => void} fn
 */
export function walk(node, fn, depth = 0) {
  fn(node, depth);
  for (const child of node.children ?? []) {
    walk(child, fn, depth + 1);
  }
}

/**
 * Collect all nodes matching a predicate.
 */
export function findAll(node, predicate) {
  const results = [];
  walk(node, (n) => { if (predicate(n)) results.push(n); });
  return results;
}

/**
 * Find all nodes that use CSS grid.
 */
export function findGridNodes(domTree) {
  return findAll(domTree, (n) => n.computed?.display === 'grid');
}

/**
 * Find all nodes with hover-relevant classes (heuristic).
 */
export function findInteractiveNodes(domTree) {
  const interactiveTags = new Set(['button', 'a', 'input', 'select', 'textarea']);
  return findAll(domTree, (n) =>
    interactiveTags.has(n.tag) ||
    n.classList?.some(c => c.includes('btn') || c.includes('card') || c.includes('link'))
  );
}
