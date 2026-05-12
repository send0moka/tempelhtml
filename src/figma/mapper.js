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
  const normalizedRoot = normalizeRootStructure(annotated);

  // Build the main node tree
  return [buildNode(normalizedRoot, null, { fontMap, gridStrategies, hoverSpecs }, '0')];
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
  const renderableGridStrategy = isGrid ? getRenderableGridStrategy(node, gridStrategy) : null;
  if (renderableGridStrategy) {
    frameNode._gridStrategy = renderableGridStrategy;
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
      fontName: {
        family: 'Inter',
        style: 'Regular',
      },
      fontSize: Math.max(Math.min(Math.round(pseudo.height || 16), 48), 12),
      fills: pseudo.fillColor && pseudo.fillColor !== 'noise-texture'
        ? [colorSolidPaint(pseudo.fillColor)]
        : [colorSolidPaint('#ffffff')],
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

function normalizeRootStructure(root) {
  if (!root || root.tag !== 'body' || !Array.isArray(root.children) || root.children.length === 0) {
    return root;
  }

  const headerChildren = root.children.filter((child) => isTopHeaderChild(child, root.rect));
  if (headerChildren.length === 0 || headerChildren.length === root.children.length) {
    return root;
  }

  const otherChildren = root.children.filter((child) => !isTopHeaderChild(child, root.rect));
  const syntheticHeader = buildSyntheticGroup('header', headerChildren);
  return {
    ...root,
    children: [syntheticHeader].concat(otherChildren),
  };
}

function isTopHeaderChild(node, rootRect) {
  if (!node?.rect || !node?.computed) return false;

  const position = node.computed.position;
  if (position !== 'fixed' && position !== 'absolute') {
    return false;
  }

  const nearTop = Math.abs((node.rect.y ?? 0) - (rootRect?.y ?? 0)) <= 8;
  const wideEnough = (node.rect.width ?? 0) >= Math.max((rootRect?.width ?? 0) * 0.6, 320);
  const shortEnough = (node.rect.height ?? 0) <= Math.max((rootRect?.height ?? 0) * 0.2, 220);
  return nearTop && wideEnough && shortEnough;
}

function buildSyntheticGroup(tag, children) {
  const rect = unionRects(children.map((child) => child.rect).filter(Boolean));
  const maxZ = Math.max(...children.map((child) => child.effectiveZ ?? 0), 0);

  return {
    tag,
    id: null,
    classList: [],
    text: null,
    textRuns: [],
    isTextContainer: false,
    rect,
    computed: {
      display: 'block',
      position: 'static',
      zIndex: String(maxZ),
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      flexWrap: 'nowrap',
      gap: '0px',
      columnGap: '0px',
      rowGap: '0px',
      gridTemplateColumns: 'none',
      gridTemplateRows: 'none',
      gridRow: 'auto',
      gridColumn: 'auto',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      minWidth: '0px',
      maxWidth: 'none',
      minHeight: '0px',
      paddingTop: '0px',
      paddingRight: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
      marginTop: '0px',
      marginRight: '0px',
      marginBottom: '0px',
      marginLeft: '0px',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      backgroundImage: 'none',
      backgroundSize: 'auto',
      backgroundPosition: '0% 0%',
      color: 'rgba(0, 0, 0, 0)',
      opacity: '1',
      borderRadius: '0px',
      borderTopLeftRadius: '0px',
      borderTopRightRadius: '0px',
      borderBottomRightRadius: '0px',
      borderBottomLeftRadius: '0px',
      border: '0px none rgba(0, 0, 0, 0)',
      borderWidth: '0px',
      borderColor: 'rgba(0, 0, 0, 0)',
      borderStyle: 'none',
      boxShadow: 'none',
      overflow: 'visible',
      overflowX: 'visible',
      overflowY: 'visible',
      mixBlendMode: 'normal',
      transform: 'none',
      fontFamily: 'Inter',
      fontSize: '16px',
      fontWeight: '400',
      fontStyle: 'normal',
      lineHeight: 'normal',
      letterSpacing: 'normal',
      textAlign: 'left',
      textTransform: 'none',
      whiteSpace: 'normal',
      textDecoration: 'none',
      webkitTextStrokeWidth: '0px',
      webkitTextStrokeColor: 'rgba(0, 0, 0, 0)',
      top: 'auto',
      right: 'auto',
      bottom: 'auto',
      left: 'auto',
      inset: 'auto',
      content: 'none',
    },
    pseudo: {
      before: null,
      after: null,
    },
    children,
    effectiveZ: maxZ,
  };
}

function unionRects(rects) {
  if (!Array.isArray(rects) || rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    x: left,
    y: top,
    width: Math.max(right - left, 0),
    height: Math.max(bottom - top, 0),
  };
}

function getRenderableGridStrategy(node, gridStrategy) {
  if (!node || !gridStrategy?.outerFrame || !Array.isArray(node.children) || node.children.length < 2) {
    return null;
  }

  const axis = detectLinearChildAxis(node.children);
  if (!axis) {
    return null;
  }

  return {
    ...gridStrategy.outerFrame,
    layoutMode: axis,
    itemSpacing: measureAxisSpacing(node.children, axis),
  };
}

function detectLinearChildAxis(children) {
  const tolerance = 8;
  const xs = groupAxisValues(children.map((child) => child.rect?.x ?? 0), tolerance);
  const ys = groupAxisValues(children.map((child) => child.rect?.y ?? 0), tolerance);

  if (ys.length === 1 && xs.length > 1) {
    return 'HORIZONTAL';
  }
  if (xs.length === 1 && ys.length > 1) {
    return 'VERTICAL';
  }
  return null;
}

function groupAxisValues(values, tolerance) {
  const sorted = [...values].sort((a, b) => a - b);
  const groups = [];

  for (const value of sorted) {
    const prev = groups[groups.length - 1];
    if (prev === undefined || Math.abs(value - prev) > tolerance) {
      groups.push(value);
    }
  }

  return groups;
}

function measureAxisSpacing(children, axis) {
  const items = [...children]
    .filter((child) => child?.rect)
    .sort((a, b) => axis === 'HORIZONTAL' ? a.rect.x - b.rect.x : a.rect.y - b.rect.y);

  let minGap = null;
  for (let index = 1; index < items.length; index++) {
    const prev = items[index - 1].rect;
    const current = items[index].rect;
    const gap = axis === 'HORIZONTAL'
      ? current.x - (prev.x + prev.width)
      : current.y - (prev.y + prev.height);
    if (gap < 0) continue;
    if (minGap === null || gap < minGap) {
      minGap = gap;
    }
  }

  return Math.max(Math.round(minGap ?? 0), 0);
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
