/**
 * figma-plugin/code.js
 * Figma Plugin main thread - receives HTML or JSON and creates Figma nodes.
 */

const DEFAULT_CONVERTER_URL = 'http://localhost:3210';

figma.showUI(__html__, { width: 520, height: 680 });

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'BUILD') {
      await buildFromSnapshot(msg.data);
      return;
    }

    if (msg.type === 'CONVERT_AND_BUILD') {
      await convertAndBuild(msg.payload);
    }
  } catch (err) {
    figma.ui.postMessage({ type: 'ERROR', message: err.message });
    console.error('[tempelhtml]', err);
  }
};

async function convertAndBuild(payload) {
  progress('Uploading HTML to local server...', 1);

  const response = await fetch(getJobStartUrl(payload.serverUrl || DEFAULT_CONVERTER_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html: payload.html,
      sourceName: payload.sourceName || 'inline.html',
      baseUrl: payload.baseUrl || null,
      skipAi: Boolean(payload.skipAi),
      viewport: payload.viewport || { width: 1440, height: 900 },
    }),
  });

  if (!response.ok) {
    let message = `Converter request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body && body.error) message = body.error;
    } catch (err) {}
    throw new Error(message);
  }

  const started = await response.json();
  if (!started || !started.jobId) {
    throw new Error('Conversion server did not return a job id.');
  }

  progress('Job queued. Rendering page...', 3);
  const result = await waitForJob(payload.serverUrl || DEFAULT_CONVERTER_URL, started.jobId);
  await buildFromSnapshot(result);
}

async function buildFromSnapshot(data) {
  const figmaTree = data.figmaTree || [];
  const warnings = data.warnings || [];

  for (const warning of warnings) {
    progress(`Warning: ${warning}`);
  }

  progress('Pre-loading fonts...', 92);
  await preloadFonts(figmaTree);

  progress('Building nodes...', 96);
  let nodeCount = 0;
  const page = figma.currentPage;

  for (const nodeSpec of figmaTree) {
    const node = await buildNode(nodeSpec, 'NONE');
    if (node) {
      page.appendChild(node);
      nodeCount++;
    }
  }

  layoutTopLevelNodes(page);

  progress('Done.', 100);
  figma.ui.postMessage({ type: 'DONE', nodeCount: nodeCount });
  figma.notify(`tempelhtml: ${nodeCount} nodes created`);
}

function progress(text, percent) {
  figma.ui.postMessage({ type: 'PROGRESS', text: text, percent: percent });
}

// Font pre-loading

async function preloadFonts(nodes) {
  const availableByFamily = await listAvailableFontsByFamily();
  const cache = {};

  async function resolveFontName(font) {
    const fallback = { family: 'Inter', style: 'Regular' };
    const requested = normalizeFontName(font) || fallback;
    const key = JSON.stringify(requested);

    if (cache[key]) {
      return cache[key];
    }

    cache[key] = loadBestAvailableFont(requested, availableByFamily)
      .catch(function () {
        return fallback;
      });

    return cache[key];
  }

  await resolveFontName({ family: 'Inter', style: 'Regular' });

  for (const node of nodes) {
    await normalizeNodeFonts(node, resolveFontName);
  }
}

async function normalizeNodeFonts(node, resolveFontName) {
  if (node.type === 'TEXT') {
    node.fontName = await resolveFontName(node.fontName || { family: 'Inter', style: 'Regular' });
  } else if (node.fontName) {
    node.fontName = await resolveFontName(node.fontName);
  }

  const textRuns = node.textRuns || [];
  for (let index = 0; index < textRuns.length; index++) {
    if (textRuns[index] && textRuns[index].fontName) {
      textRuns[index].fontName = await resolveFontName(textRuns[index].fontName);
    }
  }

  const children = node.children || [];
  for (let index = 0; index < children.length; index++) {
    await normalizeNodeFonts(children[index], resolveFontName);
  }
}

async function listAvailableFontsByFamily() {
  try {
    const fonts = await figma.listAvailableFontsAsync();
    const byFamily = {};

    for (let index = 0; index < fonts.length; index++) {
      const raw = fonts[index];
      const font = raw && raw.fontName ? raw.fontName : raw;
      if (!font || !font.family || !font.style) {
        continue;
      }

      if (!byFamily[font.family]) {
        byFamily[font.family] = [];
      }

      byFamily[font.family].push({
        family: font.family,
        style: font.style,
      });
    }

    return byFamily;
  } catch (err) {
    return {};
  }
}

async function loadBestAvailableFont(requested, availableByFamily) {
  const candidates = buildFontCandidateList(requested, availableByFamily);

  for (let index = 0; index < candidates.length; index++) {
    try {
      await figma.loadFontAsync(candidates[index]);
      return candidates[index];
    } catch (err) {}
  }

  const fallback = { family: 'Inter', style: 'Regular' };
  await figma.loadFontAsync(fallback);
  return fallback;
}

function buildFontCandidateList(requested, availableByFamily) {
  const candidates = [];
  const families = [requested.family, 'Inter'];

  for (let familyIndex = 0; familyIndex < families.length; familyIndex++) {
    const family = families[familyIndex];
    const pool = availableByFamily[family] || [];
    if (!pool.length) {
      continue;
    }

    const exact = findExactFont(pool, requested.style);
    if (exact) {
      pushUniqueFont(candidates, exact);
    }

    const bestMatch = findClosestFont(pool, requested.style);
    if (bestMatch) {
      pushUniqueFont(candidates, bestMatch);
    }

    const italicMatch = findExactFont(pool, 'Italic');
    if (italicMatch) {
      pushUniqueFont(candidates, italicMatch);
    }

    const regularMatch = findExactFont(pool, 'Regular');
    if (regularMatch) {
      pushUniqueFont(candidates, regularMatch);
    }
  }

  pushUniqueFont(candidates, { family: 'Inter', style: 'Regular' });
  return candidates;
}

function pushUniqueFont(target, font) {
  const key = JSON.stringify(font);
  for (let index = 0; index < target.length; index++) {
    if (JSON.stringify(target[index]) === key) {
      return;
    }
  }
  target.push(font);
}

function findExactFont(pool, style) {
  for (let index = 0; index < pool.length; index++) {
    if (pool[index].style === style) {
      return pool[index];
    }
  }
  return null;
}

function findClosestFont(pool, requestedStyle) {
  if (!pool.length) {
    return null;
  }

  const targetItalic = isItalicStyle(requestedStyle);
  const sameItalic = [];
  for (let index = 0; index < pool.length; index++) {
    if (isItalicStyle(pool[index].style) === targetItalic) {
      sameItalic.push(pool[index]);
    }
  }

  const candidates = sameItalic.length ? sameItalic : pool;
  let best = candidates[0];
  let bestScore = fontDistance(requestedStyle, candidates[0].style);

  for (let index = 1; index < candidates.length; index++) {
    const score = fontDistance(requestedStyle, candidates[index].style);
    if (score < bestScore) {
      best = candidates[index];
      bestScore = score;
    }
  }

  return best;
}

function fontDistance(targetStyle, candidateStyle) {
  const italicPenalty = isItalicStyle(targetStyle) === isItalicStyle(candidateStyle) ? 0 : 500;
  return Math.abs(fontWeightFromStyle(targetStyle) - fontWeightFromStyle(candidateStyle)) + italicPenalty;
}

function fontWeightFromStyle(style) {
  const normalized = String(style || '').replace(/\s+Italic$/i, '').trim();
  const map = {
    Thin: 100,
    ExtraLight: 200,
    Light: 300,
    Regular: 400,
    Medium: 500,
    SemiBold: 600,
    Bold: 700,
    ExtraBold: 800,
    Black: 900,
  };

  return map[normalized] || 400;
}

function isItalicStyle(style) {
  return /italic/i.test(String(style || ''));
}

function normalizeFontName(font) {
  if (!font || !font.family) {
    return null;
  }

  return {
    family: font.family,
    style: font.style || 'Regular',
  };
}

// Node builder

async function buildNode(spec, parentLayoutMode) {
  if (spec.type === 'TEXT') {
    return buildTextNode(spec);
  }
  return buildFrameNode(spec, parentLayoutMode);
}

function buildTextNode(spec) {
  const textRuns = getAlignedTextRuns(spec);

  if (hasOutlineRuns(textRuns)) {
    return buildMixedTextGroup(spec);
  }

  const text = figma.createText();
  applyBaseTextProps(text, spec);
  applyTextRunStyles(text, textRuns);
  applyTextSizing(text, spec);
  return text;
}

function buildMixedTextGroup(spec) {
  const textRuns = getAlignedTextRuns(spec);
  const frame = figma.createFrame();
  frame.name = spec.name;
  frame.x = spec.x || 0;
  frame.y = spec.y || 0;
  frame.resize(Math.max(spec.width || 1, 1), Math.max(spec.height || 1, 1));
  frame.fills = [];
  frame.strokes = [];
  frame.clipsContent = false;

  const baseText = figma.createText();
  applyBaseTextProps(baseText, Object.assign({}, spec, { x: 0, y: 0 }));
  applyTextRunStyles(baseText, textRuns);
  applyTextSizing(baseText, Object.assign({}, spec, { x: 0, y: 0 }));
  frame.appendChild(baseText);

  const outlineRuns = textRuns.filter((run) => run && run.strokes && run.strokes.length > 0);
  for (const run of outlineRuns) {
    const overlay = figma.createText();
    applyBaseTextProps(overlay, {
      name: spec.name + ' / outline',
      characters: run.text,
      x: 0,
      y: estimateRunYOffset(spec, run),
      width: spec.width,
      height: spec.height,
      fontName: run.fontName || spec.fontName,
      fontSize: run.fontSize || spec.fontSize,
      lineHeight: run.lineHeight || spec.lineHeight,
      letterSpacing: run.letterSpacing || spec.letterSpacing,
      textAlignHorizontal: spec.textAlignHorizontal,
      textCase: run.textCase || spec.textCase,
      fills: run.fills || [],
      strokes: run.strokes || [],
      strokeWeight: run.strokeWeight || 1,
      opacity: spec.opacity,
    });
    applyTextSizing(overlay, { width: spec.width, height: spec.height });
    frame.appendChild(overlay);
  }

  return frame;
}

function applyBaseTextProps(text, spec) {
  text.name = spec.name;
  text.x = spec.x || 0;
  text.y = spec.y || 0;

  const fontName = spec.fontName || { family: 'Inter', style: 'Regular' };
  try {
    text.fontName = fontName;
  } catch (err) {}

  text.characters = spec.characters || '';
  if (spec.fontSize) text.fontSize = spec.fontSize;
  if (spec.fills) text.fills = spec.fills;
  if (spec.opacity !== undefined) text.opacity = spec.opacity;
  if (spec.lineHeight) text.lineHeight = spec.lineHeight;
  if (spec.letterSpacing) text.letterSpacing = spec.letterSpacing;
  if (spec.textAlignHorizontal) text.textAlignHorizontal = spec.textAlignHorizontal;
  if (spec.textCase) text.textCase = spec.textCase;
  if (spec.strokes) {
    text.strokes = spec.strokes;
    text.strokeWeight = spec.strokeWeight || 1;
  }
}

function applyTextRunStyles(text, runs) {
  if (!runs || runs.length === 0) return;

  for (const run of runs) {
    const start = Number.isFinite(run.start) ? run.start : 0;
    const end = Number.isFinite(run.end) ? run.end : start + (run.text || '').length;
    if (end <= start) continue;

    if (run.fontName) {
      try { text.setRangeFontName(start, end, run.fontName); } catch (err) {}
    }
    if (run.fontSize) {
      try { text.setRangeFontSize(start, end, run.fontSize); } catch (err) {}
    }
    if (run.fills) {
      try { text.setRangeFills(start, end, run.fills); } catch (err) {}
    }
    if (run.lineHeight) {
      try { text.setRangeLineHeight(start, end, run.lineHeight); } catch (err) {}
    }
    if (run.letterSpacing) {
      try { text.setRangeLetterSpacing(start, end, run.letterSpacing); } catch (err) {}
    }
    if (run.textCase) {
      try { text.setRangeTextCase(start, end, run.textCase); } catch (err) {}
    }
  }
}

function applyTextSizing(text, spec) {
  if (!spec.width) return;
  try {
    text.textAutoResize = 'HEIGHT';
    text.resize(Math.max(spec.width, 1), Math.max(spec.height || 1, 1));
  } catch (err) {}
}

async function buildFrameNode(spec, parentLayoutMode) {
  const frame = figma.createFrame();
  frame.name = spec.name;
  frame.resize(Math.max(spec.width || 100, 1), Math.max(spec.height || 100, 1));
  frame.x = spec.x || 0;
  frame.y = spec.y || 0;

  if (spec.fills && spec.fills.length > 0) frame.fills = spec.fills;
  else frame.fills = [];

  if (spec.opacity !== undefined) frame.opacity = spec.opacity;

  if (spec.paddingTop !== undefined) frame.paddingTop = spec.paddingTop;
  if (spec.paddingRight !== undefined) frame.paddingRight = spec.paddingRight;
  if (spec.paddingBottom !== undefined) frame.paddingBottom = spec.paddingBottom;
  if (spec.paddingLeft !== undefined) frame.paddingLeft = spec.paddingLeft;

  if (spec.layoutMode && spec.layoutMode !== 'NONE') {
    frame.layoutMode = spec.layoutMode;
    if (spec.primaryAxisAlignItems) frame.primaryAxisAlignItems = spec.primaryAxisAlignItems;
    if (spec.counterAxisAlignItems) frame.counterAxisAlignItems = spec.counterAxisAlignItems;
    if (spec.itemSpacing !== undefined) frame.itemSpacing = spec.itemSpacing;
  }

  if (spec._gridStrategy) {
    applyGridStrategy(frame, spec._gridStrategy);
  }

  if (spec.layoutPositioning === 'ABSOLUTE' && parentLayoutMode !== 'NONE') {
    frame.layoutPositioning = 'ABSOLUTE';
  }

  if (spec.clipsContent !== undefined) frame.clipsContent = spec.clipsContent;
  if (spec.cornerRadius !== undefined) frame.cornerRadius = spec.cornerRadius;
  if (spec.topLeftRadius !== undefined) {
    frame.topLeftRadius = spec.topLeftRadius;
    frame.topRightRadius = spec.topRightRadius || 0;
    frame.bottomRightRadius = spec.bottomRightRadius || 0;
    frame.bottomLeftRadius = spec.bottomLeftRadius || 0;
  }
  if (spec.strokes && spec.strokes.length > 0) {
    frame.strokes = spec.strokes;
    frame.strokeWeight = spec.strokeWeight || 1;
    frame.strokeAlign = spec.strokeAlign || 'INSIDE';
  }
  if (spec.effects && spec.effects.length > 0) frame.effects = spec.effects;
  if (spec.blendMode) {
    try {
      frame.blendMode = spec.blendMode;
    } catch (err) {}
  }
  if (spec._backgroundPattern) {
    applyBackgroundPattern(frame, spec._backgroundPattern);
  }

  for (const childSpec of (spec.children || [])) {
    const child = await buildNode(childSpec, frame.layoutMode || 'NONE');
    if (child) {
      frame.appendChild(child);
      if (childSpec.layoutPositioning === 'ABSOLUTE' && frame.layoutMode !== 'NONE') {
        child.layoutPositioning = 'ABSOLUTE';
      }
    }
  }

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
  if (strategy.counterAxisSizingMode) {
    frame.counterAxisSizingMode = strategy.counterAxisSizingMode;
  }
  if (strategy.itemSpacing !== undefined) {
    frame.itemSpacing = strategy.itemSpacing;
  }
}

function buildComponentWithVariants(defaultFrame, hoverSpec) {
  try {
    const component = figma.createComponent();
    component.name = hoverSpec.componentName || defaultFrame.name;
    component.resize(defaultFrame.width, defaultFrame.height);
    component.x = defaultFrame.x;
    component.y = defaultFrame.y;

    if (defaultFrame.fills) component.fills = defaultFrame.fills;

    for (const child of Array.from(defaultFrame.children)) {
      component.appendChild(child);
    }

    defaultFrame.remove();
    return component;
  } catch (err) {
    return defaultFrame;
  }
}

function applyBackgroundPattern(frame, pattern) {
  if (!pattern || pattern.kind !== 'grid') {
    return;
  }

  const layer = figma.createFrame();
  layer.name = `${frame.name} / pattern`;
  layer.x = 0;
  layer.y = 0;
  layer.resize(frame.width, frame.height);
  layer.fills = [];
  layer.strokes = [];
  layer.clipsContent = true;

  const cellWidth = Math.max(pattern.cellWidth || 1, 1);
  const cellHeight = Math.max(pattern.cellHeight || 1, 1);
  const strokeWeight = Math.max(pattern.strokeWeight || 1, 1);
  const paint = pattern.paint ? [pattern.paint] : [];

  for (let x = 0; x < frame.width; x += cellWidth) {
    const line = figma.createFrame();
    line.name = 'grid-v';
    line.x = x;
    line.y = 0;
    line.resize(strokeWeight, frame.height);
    line.fills = paint;
    line.strokes = [];
    layer.appendChild(line);
  }

  for (let y = 0; y < frame.height; y += cellHeight) {
    const line = figma.createFrame();
    line.name = 'grid-h';
    line.x = 0;
    line.y = y;
    line.resize(frame.width, strokeWeight);
    line.fills = paint;
    line.strokes = [];
    layer.appendChild(line);
  }

  frame.appendChild(layer);
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

function hasOutlineRuns(value) {
  const runs = Array.isArray(value) ? value : (value.textRuns || []);
  return Boolean(runs.some((run) => run && run.strokes && run.strokes.length > 0));
}

function getAlignedTextRuns(spec) {
  return alignTextRuns(String(spec.characters || ''), spec.textRuns || []);
}

function estimateRunYOffset(spec, run) {
  const lineHeight = getLineHeightPx(run.lineHeight || spec.lineHeight, run.fontSize || spec.fontSize || 16);
  return Math.max((run.lineIndex || 0) * lineHeight, 0);
}

function getLineHeightPx(lineHeight, fontSize) {
  if (!lineHeight) return fontSize;
  if (lineHeight.unit === 'PIXELS') return lineHeight.value || fontSize;
  if (lineHeight.unit === 'PERCENT') return (fontSize * (lineHeight.value || 100)) / 100;
  return fontSize;
}

function alignTextRuns(characters, runs) {
  const source = normalizeWhitespaceForSearch(characters);
  const aligned = [];
  let searchIndex = 0;

  for (const run of runs) {
    if (!run || !run.text) continue;

    const normalizedText = normalizeWhitespaceForSearch(run.text).text;
    if (!normalizedText) continue;

    let startIndex = source.text.indexOf(normalizedText, searchIndex);
    if (startIndex < 0) {
      startIndex = source.text.indexOf(normalizedText);
    }
    if (startIndex < 0) {
      continue;
    }

    const endIndex = startIndex + normalizedText.length;
    const start = source.map[startIndex] !== undefined ? source.map[startIndex] : 0;
    const end = (source.map[endIndex - 1] !== undefined ? source.map[endIndex - 1] : (characters.length - 1)) + 1;

    var pushRun = Object.assign({}, run, { start: start, end: end, text: characters.slice(start, end) || run.text });
    aligned.push(pushRun);
    searchIndex = endIndex;
  }

  return aligned;
}

function normalizeWhitespaceForSearch(value) {
  const text = String(value || '');
  let result = '';
  const map = [];
  let pendingWhitespaceIndex = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (/\s/.test(char)) {
      if (pendingWhitespaceIndex < 0) {
        pendingWhitespaceIndex = i;
      }
      continue;
    }

    if (pendingWhitespaceIndex >= 0 && result.length > 0) {
      result += ' ';
      map.push(pendingWhitespaceIndex);
      pendingWhitespaceIndex = -1;
    }

    result += char;
    map.push(i);
  }

  return { text: result, map };
}

async function waitForJob(serverUrl, jobId) {
  const statusUrl = getJobStatusUrl(serverUrl, jobId);
  let lastMessage = '';
  let lastPercent = -1;

  while (true) {
    const response = await fetch(statusUrl);
    if (!response.ok) {
      throw new Error(`Failed to read conversion status (${response.status})`);
    }

    const status = await response.json();
    const percent = typeof status.progress === 'number' ? status.progress : undefined;
    const message = status.message || 'Converting HTML...';

    if (message !== lastMessage || percent !== lastPercent) {
      progress(message, percent);
      lastMessage = message;
      lastPercent = percent;
    }

    if (status.state === 'done') {
      return status.result;
    }

    if (status.state === 'error') {
      throw new Error(status.error || 'Conversion failed.');
    }

    await sleep(500);
  }
}

function getJobStartUrl(serverUrl) {
  return `${normalizeServerUrl(serverUrl)}/jobs`;
}

function getJobStatusUrl(serverUrl, jobId) {
  return `${normalizeServerUrl(serverUrl)}/jobs/${jobId}`;
}

function normalizeServerUrl(serverUrl) {
  const clean = (serverUrl || DEFAULT_CONVERTER_URL).replace(/\/+$/, '');
  if (clean.endsWith('/convert')) {
    return clean.slice(0, -'/convert'.length);
  }
  if (clean.endsWith('/jobs')) {
    return clean.slice(0, -'/jobs'.length);
  }
  return clean;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
