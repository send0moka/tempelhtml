/**
 * src/figma/z-index-sorter.js
 * Converts CSS z-index stacking contexts into Figma layer order.
 *
 * Figma layer order: index 0 = bottom, index n-1 = top.
 * CSS z-index: higher = on top.
 *
 * Strategy:
 * 1. Flatten DOM into a list with effective z-index (inheriting from parent stacking context)
 * 2. Sort ascending
 * 3. Figma plugin inserts nodes in this order
 */

import { walk } from '../core/dom-tree.js';

/**
 * Returns the DOM tree annotated with effectiveZ values,
 * and the flat sorted list for layer insertion order.
 *
 * @param {object} domTree
 * @returns {{ annotated: object, sortedFlat: object[] }}
 */
export function sortByZIndex(domTree) {
  const flat = [];

  // First pass: annotate each node with effectiveZ
  function annotate(node, parentZ = 0) {
    const z = parseZIndex(node.computed?.zIndex);
    const isStackingContext = createsStackingContext(node.computed);
    const effectiveZ = isStackingContext ? parentZ + z : parentZ;

    const annotated = { ...node, effectiveZ };
    flat.push(annotated);

    annotated.children = (node.children ?? []).map(child =>
      annotate(child, effectiveZ)
    );

    return annotated;
  }

  const annotated = annotate(domTree);

  // Sort flat list: lower effectiveZ = insert first (bottom layer in Figma)
  const sortedFlat = [...flat].sort((a, b) => a.effectiveZ - b.effectiveZ);

  return { annotated, sortedFlat };
}

function parseZIndex(value) {
  if (!value || value === 'auto') return 0;
  const n = parseInt(value);
  return isNaN(n) ? 0 : n;
}

/**
 * An element creates a stacking context if it has:
 * - position + z-index (not auto)
 * - opacity < 1
 * - transform (not none)
 * - filter
 * - will-change
 */
function createsStackingContext(computed) {
  if (!computed) return false;
  const hasPosition = computed.position !== 'static';
  const hasZ = computed.zIndex !== 'auto';
  const hasOpacity = parseFloat(computed.opacity) < 1;
  const hasTransform = computed.transform !== 'none' && computed.transform !== '';
  return (hasPosition && hasZ) || hasOpacity || hasTransform;
}

/**
 * Get the VELA-specific z-index map for reference.
 * Used for validation / documentation purposes.
 */
export const VELA_Z_REFERENCE = [
  { element: 'body background', z: 'auto' },
  { element: 'section.hero', z: 'auto' },
  { element: '.hero-right (decorative)', z: 'auto' },
  { element: '.hero-left (text content)', z: 2 },
  { element: 'nav (fixed)', z: 100 },
  { element: 'body::before (grain overlay)', z: 9999 },
];
