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
import { parsePx } from '../utils/units.js';

/**
 * @param {{ annotated: object, sortedFlat: object[] }} sorted
 * @param {{ pseudoElements, gridStrategies, hoverSpecs, fontMap }} extras
 * @returns {FigmaNode[]}
 */
export function buildFigmaTree({ annotated }, { pseudoElements = [], gridStrategies = {}, hoverSpecs = {}, fontMap = {} } = {}) {
  attachPseudoElements(annotated, pseudoElements);

  // Build the main node tree
  return [buildNode(annotated, null, { fontMap, gridStrategies, hoverSpecs }, '0')];
}

function buildNode(node, parentRect, ctx, path) {
  const { computed, rect, tag, text, textRuns = [], children = [], classList, isTextContainer } = node;
  const isLeafText = Boolean(text) && children.length === 0;
  const isText = isLeafText && Boolean(isTextContainer);

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
  const backgroundPattern = detectBackgroundPattern(computed);

  // Handle linear-gradient in backgroundImage
  if (!backgroundPattern && computed.backgroundImage && computed.backgroundImage.includes('linear-gradient')) {
    try {
      fills.push(parseLinearGradient(computed.backgroundImage));
    } catch { /* skip malformed gradients */ }
  }

  const frameNode = {
    ...base,
    fills,
    ...mapPadding(computed),
    ...mapOverflow(computed),
    ...mapBorderRadius(computed, rect),
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
  if (backgroundPattern) {
    frameNode._backgroundPattern = backgroundPattern;
  }

  // Recurse
  const childNodes = [];

  if (isLeafText) {
    childNodes.push(buildEmbeddedTextNode(node, ctx, `${path}.text`));
  }

  const pseudoChildren = node.pseudoChildren || [];
  const pseudoBefore = pseudoChildren
    .filter((pseudo) => pseudo.zOrder !== 'top')
    .map((pseudo, index) => buildPseudoNode(pseudo, `${path}.pseudo.${index}`))
    .filter(Boolean);
  const pseudoTop = pseudoChildren
    .filter((pseudo) => pseudo.zOrder === 'top')
    .map((pseudo, index) => buildPseudoNode(pseudo, `${path}.pseudoTop.${index}`))
    .filter(Boolean);

  frameNode.children = pseudoBefore
    .concat(childNodes)
    .concat(
      children
        .map((child, index) => buildNode(child, rect, ctx, `${path}.${index}`))
        .filter(Boolean)
    )
    .concat(pseudoTop);

  return frameNode;
}

function buildPseudoNode(pseudo, path) {
  const pseudoId = `pseudo-${path}-${pseudo.name.replace(/\s+/g, '-').toLowerCase()}`;
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

function buildEmbeddedTextNode(node, ctx, path) {
  const { computed, rect, tag, text, textRuns = [], classList } = node;
  const insetX = parsePx(computed.paddingLeft);
  const insetY = parsePx(computed.paddingTop);
  const width = Math.max(Math.round(rect.width - insetX - parsePx(computed.paddingRight)), 1);
  const height = Math.max(Math.round(rect.height - insetY - parsePx(computed.paddingBottom)), 1);

  return {
    id: buildStableId(tag, classList, `${path}-inner`),
    name: `${buildName(tag, classList)} / text`,
    type: 'TEXT',
    x: Math.round(insetX),
    y: Math.round(insetY),
    width,
    height,
    characters: text,
    ...mapTypography(computed, ctx.fontMap),
    ...mapTextStroke(computed),
    textRuns: buildTextRuns(textRuns, ctx.fontMap),
  };
}

function attachPseudoElements(root, pseudoElements) {
  if (!root || !Array.isArray(pseudoElements) || pseudoElements.length === 0) return;

  for (const pseudo of pseudoElements) {
    const target = findBestPseudoParent(root, pseudo) || root;
    const relative = {
      ...pseudo,
      x: Math.round(pseudo.x - (target.rect?.x ?? 0)),
      y: Math.round(pseudo.y - (target.rect?.y ?? 0)),
    };
    if (!target.pseudoChildren) {
      target.pseudoChildren = [];
    }
    target.pseudoChildren.push(relative);
  }
}

function findBestPseudoParent(node, pseudo) {
  let best = null;

  function walk(current, depth = 0) {
    if (!current || !current.rect || current.isTextContainer) return;

    const score = scorePseudoParent(current, pseudo, depth);
    if (score > 0 && (!best || score > best.score)) {
      best = { node: current, score };
    }

    for (const child of current.children || []) {
      walk(child, depth + 1);
    }
  }

  walk(node, 0);
  return best?.node ?? null;
}

function scorePseudoParent(node, pseudo, depth) {
  const rect = node.rect;
  if (!rect) return 0;

  const nodeArea = Math.max(rect.width * rect.height, 1);
  const pseudoArea = Math.max((pseudo.width || 0) * (pseudo.height || 0), 1);
  const contains =
    pseudo.x >= rect.x - 8 &&
    pseudo.y >= rect.y - 8 &&
    pseudo.x + pseudo.width <= rect.x + rect.width + 8 &&
    pseudo.y + pseudo.height <= rect.y + rect.height + 8;
  const intersects =
    pseudo.x < rect.x + rect.width &&
    pseudo.x + pseudo.width > rect.x &&
    pseudo.y < rect.y + rect.height &&
    pseudo.y + pseudo.height > rect.y;

  if (!contains && !intersects) {
    return 0;
  }

  const haystack = `${node.tag ?? ''} ${(node.classList || []).join(' ')} ${node.name ?? ''}`.toLowerCase();
  const tokens = String(pseudo.name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 2);
  let tokenHits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) tokenHits++;
  }

  if (tokenHits === 0 && depth > 0) {
    const nearSizedContainer = nodeArea <= pseudoArea * 64;
    if (!nearSizedContainer) {
      return 0;
    }
  }

  let score = tokenHits * 1000;
  if (contains) score += 500;
  else if (intersects) score += 120;
  score += Math.min(400, Math.round(100000 / nodeArea));
  score += Math.min(100, depth * 5);
  score += Math.min(80, Math.round(100000 / pseudoArea));
  return score;
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

function detectBackgroundPattern(computed) {
  const backgroundImage = computed.backgroundImage || '';
  const backgroundSize = computed.backgroundSize || '';
  if (!backgroundImage.includes('linear-gradient') || !backgroundSize.includes('px')) {
    return null;
  }

  const gradientCount = (backgroundImage.match(/linear-gradient\(/g) || []).length;
  if (gradientCount < 2) {
    return null;
  }

  const sizeMatch = backgroundSize.match(/([\d.]+)px\s+([\d.]+)px/);
  const colorMatch = backgroundImage.match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/);
  if (!sizeMatch || !colorMatch) {
    return null;
  }

  return {
    kind: 'grid',
    cellWidth: Math.max(Math.round(parseFloat(sizeMatch[1])), 1),
    cellHeight: Math.max(Math.round(parseFloat(sizeMatch[2])), 1),
    strokeWeight: 1,
    paint: colorSolidPaint(colorMatch[0]),
  };
}
