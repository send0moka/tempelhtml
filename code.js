/**
 * figma-plugin/code.js
 * Figma Plugin main thread — receives the tempelhtml JSON
 * and creates Figma nodes using the Plugin API.
 *
 * This file runs inside Figma's sandbox.
 * No Node.js APIs available here.
 */

figma.showUI(__html__, { width: 400, height: 340 });

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'BUILD') return;

  try {
    const { data } = msg;
    const { figmaTree, hoverSpecs = {} } = data;

    progress('Pre-loading fonts...');
    await preloadFonts(figmaTree);

    progress('Building nodes...');
    let nodeCount = 0;
    const page = figma.currentPage;

    for (const nodeSpec of figmaTree) {
      const node = await buildNode(nodeSpec);
      if (node) {
        page.appendChild(node);
        nodeCount++;
      }
    }

    // Position nodes so they don't overlap
    layoutTopLevelNodes(page);

    figma.ui.postMessage({ type: 'DONE', nodeCount });
    figma.notify(`tempelhtml: ${nodeCount} nodes created ✓`);

  } catch (err) {
    figma.ui.postMessage({ type: 'ERROR', message: err.message });
    console.error('[tempelhtml]', err);
  }
};

function progress(text) {
  figma.ui.postMessage({ type: 'PROGRESS', text });
}

// ─── FONT PRE-LOADING ────────────────────────────────────────────────────────

async function preloadFonts(nodes) {
  const needed = new Set();

  function collectFonts(node) {
    if (node.fontName) {
      needed.add(JSON.stringify(node.fontName));
    }
    for (const child of node.children ?? []) {
      collectFonts(child);
    }
  }

  for (const n of nodes) collectFonts(n);

  const fonts = Array.from(needed).map(s => JSON.parse(s));
  await Promise.all(
    fonts.map(f =>
      figma.loadFontAsync(f).catch(() =>
        figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
      )
    )
  );
}

// ─── NODE BUILDER ─────────────────────────────────────────────────────────────

async function buildNode(spec) {
  if (spec.type === 'TEXT') {
    return buildTextNode(spec);
  }
  return buildFrameNode(spec);
}

function buildTextNode(spec) {
  const text = figma.createText();
  text.name = spec.name;
  text.characters = spec.characters ?? '';
  text.x = spec.x ?? 0;
  text.y = spec.y ?? 0;

  if (spec.fontName) {
    try { text.fontName = spec.fontName; } catch {}
  }
  if (spec.fontSize) text.fontSize = spec.fontSize;
  if (spec.fills) text.fills = spec.fills;
  if (spec.opacity !== undefined) text.opacity = spec.opacity;
  if (spec.lineHeight) text.lineHeight = spec.lineHeight;
  if (spec.letterSpacing) text.letterSpacing = spec.letterSpacing;
  if (spec.textAlignHorizontal) text.textAlignHorizontal = spec.textAlignHorizontal;
  if (spec.textCase) text.textCase = spec.textCase;
  if (spec.strokes) { text.strokes = spec.strokes; text.strokeWeight = spec.strokeWeight ?? 1; }

  return text;
}

async function buildFrameNode(spec) {
  const frame = figma.createFrame();
  frame.name = spec.name;
  frame.resize(Math.max(spec.width ?? 100, 1), Math.max(spec.height ?? 100, 1));
  frame.x = spec.x ?? 0;
  frame.y = spec.y ?? 0;

  // Fills
  if (spec.fills?.length > 0) frame.fills = spec.fills;
  else frame.fills = [];

  // Opacity
  if (spec.opacity !== undefined) frame.opacity = spec.opacity;

  // Padding
  if (spec.paddingTop !== undefined) frame.paddingTop = spec.paddingTop;
  if (spec.paddingRight !== undefined) frame.paddingRight = spec.paddingRight;
  if (spec.paddingBottom !== undefined) frame.paddingBottom = spec.paddingBottom;
  if (spec.paddingLeft !== undefined) frame.paddingLeft = spec.paddingLeft;

  // Auto Layout (flex)
  if (spec.layoutMode && spec.layoutMode !== 'NONE') {
    frame.layoutMode = spec.layoutMode;
    if (spec.primaryAxisAlignItems) frame.primaryAxisAlignItems = spec.primaryAxisAlignItems;
    if (spec.counterAxisAlignItems) frame.counterAxisAlignItems = spec.counterAxisAlignItems;
    if (spec.itemSpacing !== undefined) frame.itemSpacing = spec.itemSpacing;
  }

  // Grid strategy from AI
  if (spec._gridStrategy) {
    applyGridStrategy(frame, spec._gridStrategy);
  }

  // Absolute positioning
  if (spec.layoutPositioning === 'ABSOLUTE') {
    frame.layoutPositioning = 'ABSOLUTE';
  }

  // Visual
  if (spec.clipsContent !== undefined) frame.clipsContent = spec.clipsContent;
  if (spec.cornerRadius !== undefined) frame.cornerRadius = spec.cornerRadius;
  if (spec.topLeftRadius !== undefined) {
    frame.topLeftRadius = spec.topLeftRadius;
    frame.topRightRadius = spec.topRightRadius ?? 0;
    frame.bottomRightRadius = spec.bottomRightRadius ?? 0;
    frame.bottomLeftRadius = spec.bottomLeftRadius ?? 0;
  }
  if (spec.strokes?.length > 0) {
    frame.strokes = spec.strokes;
    frame.strokeWeight = spec.strokeWeight ?? 1;
    frame.strokeAlign = spec.strokeAlign ?? 'INSIDE';
  }
  if (spec.effects?.length > 0) frame.effects = spec.effects;
  if (spec.blendMode) {
    try { frame.blendMode = spec.blendMode; } catch {}
  }

  // Recurse children
  for (const childSpec of spec.children ?? []) {
    const child = await buildNode(childSpec);
    if (child) {
      frame.appendChild(child);
      if (childSpec.layoutPositioning === 'ABSOLUTE') {
        child.layoutPositioning = 'ABSOLUTE';
      }
    }
  }

  // Hover variants — create as Component Variants
  if (spec._hoverSpec) {
    return buildComponentWithVariants(frame, spec._hoverSpec);
  }

  return frame;
}

function applyGridStrategy(frame, strategy) {
  if (strategy.layoutMode) {
    frame.layoutMode = strategy.layoutMode;
  }
  if (strategy.primaryAxisSizingMode) {
    frame.primaryAxisSizingMode = strategy.primaryAxisSizingMode;
  }
}

function buildComponentWithVariants(defaultFrame, hoverSpec) {
  try {
    const component = figma.createComponent();
    component.name = hoverSpec.componentName ?? defaultFrame.name;
    component.resize(defaultFrame.width, defaultFrame.height);
    component.x = defaultFrame.x;
    component.y = defaultFrame.y;

    // Move default frame's fills/properties to component
    if (defaultFrame.fills) component.fills = defaultFrame.fills;

    // Add children
    for (const child of [...defaultFrame.children]) {
      defaultFrame.remove ? null : null;
      component.appendChild(child);
    }

    defaultFrame.remove();
    return component;
  } catch {
    // Component creation failed, return frame as-is
    return defaultFrame;
  }
}

function layoutTopLevelNodes(page) {
  let xOffset = 0;
  for (const node of page.children) {
    if (node.x === 0 && xOffset > 0) {
      node.x = xOffset + 40;
    }
    xOffset = node.x + node.width;
  }
}
