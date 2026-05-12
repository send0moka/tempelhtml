/**
 * src/figma/mapper.js
 * Converts the annotated DOM tree (with z-index) into
 * a Figma node tree JSON that the Figma plugin can execute.
 *
 * Output format: array of FigmaNode instructions
 * that the plugin reads and calls figma.create* for each.
 */

import {
  mapFlexLayout,
  mapPadding,
  mapOverflow,
  mapBorderRadius,
  mapBackgroundColor,
  mapBorder,
  mapBoxShadow,
  mapTypography,
  mapTextStroke,
  parseLinearGradient,
} from './css-to-figma.js';
import { solidPaint as colorSolidPaint } from '../utils/color.js';

/**
 * @param {{ annotated: object, sortedFlat: object[] }} sorted
 * @param {{ pseudoElements, gridStrategies, hoverSpecs, fontMap }} extras
 * @returns {FigmaNode[]}
 */
export function buildFigmaTree({ annotated }, { pseudoElements = [], gridStrategies = {}, hoverSpecs = {}, fontMap = {} } = {}) {
  const nodes = [];
  let pseudoIndex = 0;

  // Add pseudo-element frames (detected by AI)
  for (const pseudo of pseudoElements) {
    if (pseudo.zOrder === 'top') continue; // Add at end
    nodes.push(buildPseudoNode(pseudo, pseudoIndex++));
  }

  // Build the main node tree
  nodes.push(buildNode(annotated, null, { fontMap, gridStrategies, hoverSpecs }, '0'));

  // Add top-level pseudo-elements (grain overlays etc.) last
  for (const pseudo of pseudoElements) {
    if (pseudo.zOrder === 'top') {
      nodes.push(buildPseudoNode(pseudo, pseudoIndex++));
    }
  }

  return nodes;
}

function buildNode(node, parentRect, ctx, path) {
  const { computed, rect, tag, text, textRuns = [], children = [], classList, isTextContainer } = node;
  const isText = Boolean(text) && Boolean(isTextContainer);

  const base = {
    id: buildStableId(tag, classList, path),
    name: buildName(tag, classList),
    type: isText && text ? 'TEXT' : 'FRAME',
    x: Math.round(rect.x - (parentRect?.x ?? 0)),
    y: Math.round(rect.y - (parentRect?.y ?? 0)),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };

  if (base.type === 'TEXT') {
    return {
      ...base,
      characters: text,
      ...mapTypography(computed, ctx.fontMap),
      ...mapTextStroke(computed),
      textRuns: buildTextRuns(textRuns, ctx.fontMap),
      opacity: roundFloat(parseFloat(computed.opacity ?? 1)),
    };
  }

  // Frame node
  const isGrid = computed.display === 'grid';
  const isFlex = computed.display === 'flex' || computed.display === 'inline-flex';
  const isAbsolute = computed.position === 'absolute' || computed.position === 'fixed';

  const layout = isFlex ? mapFlexLayout(computed) : {};

  // Check if AI has a grid strategy for this element
  const gridClass = classList?.find(c => ctx.gridStrategies?.[`.${c}`]);
  const gridStrategy = gridClass ? ctx.gridStrategies[`.${gridClass}`] : null;

  // Check hover spec
  const hoverClass = classList?.find(c => ctx.hoverSpecs?.[`.${c}`]);
  const hoverSpec = hoverClass ? ctx.hoverSpecs[`.${hoverClass}`] : null;

  // Background fills
  const fills = mapBackgroundColor(computed);

  // Handle linear-gradient in backgroundImage
  if (computed.backgroundImage && computed.backgroundImage.includes('linear-gradient')) {
    try {
      fills.push(parseLinearGradient(computed.backgroundImage));
    } catch { /* skip malformed gradients */ }
  }

  const frameNode = {
    ...base,
    fills,
    ...mapPadding(computed),
    ...mapOverflow(computed),
    ...mapBorderRadius(computed),
    ...mapBorder(computed),
    effects: mapBoxShadow(computed),
    opacity: roundFloat(parseFloat(computed.opacity ?? 1)),
    ...(isFlex ? layout : {}),
    ...(isAbsolute ? { layoutPositioning: 'ABSOLUTE' } : {}),
    ...(computed.mixBlendMode && computed.mixBlendMode !== 'normal' ? {
      blendMode: computed.mixBlendMode.toUpperCase().replace(/-/g, '_'),
    } : {}),
  };

  // Apply grid strategy if AI provided one
  if (isGrid && gridStrategy) {
    frameNode._gridStrategy = gridStrategy.outerFrame;
    frameNode._gridNotes = gridStrategy.notes;
  }

  // Attach hover spec for Figma plugin to create variants
  if (hoverSpec) {
    frameNode._hoverSpec = hoverSpec;
  }

  // Recurse
  frameNode.children = children
    .map((child, index) => buildNode(child, rect, ctx, `${path}.${index}`))
    .filter(Boolean);

  return frameNode;
}

function buildPseudoNode(pseudo, index) {
  const pseudoId = `pseudo-${index}-${pseudo.name.replace(/\s+/g, '-').toLowerCase()}`;
  return {
    id: pseudoId,
    name: `[pseudo] ${pseudo.name}`,
    type: 'FRAME',
    x: Math.round(pseudo.x),
    y: Math.round(pseudo.y),
    width: Math.round(pseudo.width),
    height: Math.round(pseudo.height),
    opacity: roundFloat(pseudo.opacity ?? 1),
    fills: pseudo.fillColor && pseudo.fillColor !== 'noise-texture'
      ? [colorSolidPaint(pseudo.fillColor)]
      : [],
    _isPseudo: true,
    _pseudoType: pseudo.type,
    _pseudoPosition: pseudo.position,
    children: pseudo.content ? [{
      id: `${pseudoId}-content`,
      name: 'content',
      type: 'TEXT',
      characters: pseudo.content,
      x: 0, y: 0,
      width: pseudo.width,
      height: pseudo.height,
    }] : [],
  };
}

function buildName(tag, classList) {
  if (classList?.length > 0) return `${tag}.${classList.slice(0, 2).join('.')}`;
  return tag;
}

function buildStableId(tag, classList, path) {
  const slug = (classList?.slice(0, 2).join('-') || 'el')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'el';

  return `${tag}-${slug}-${path.replace(/\./g, '-')}`;
}

function roundFloat(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function buildTextRuns(runs, fontMap) {
  return (runs || [])
    .filter((run) => run && run.text)
    .map((run) => ({
      text: run.text,
      lineIndex: run.lineIndex || 0,
      ...mapTypography(run.computed, fontMap),
      ...mapTextStroke(run.computed),
    }));
}
