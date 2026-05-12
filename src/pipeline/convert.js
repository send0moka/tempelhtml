/**
 * Shared tempelhtml conversion pipeline.
 * Reused by the CLI and the local HTTP bridge for the Figma plugin.
 */

import { extractFromFile, extractFromHtml } from '../core/extractor.js';
import { detectPseudoElements } from '../ai/pseudo-detector.js';
import { resolveGridLayouts } from '../ai/grid-resolver.js';
import { analyzeHoverStates } from '../ai/hover-analyzer.js';
import { resolveFonts } from '../figma/font-resolver.js';
import { sortByZIndex } from '../figma/z-index-sorter.js';
import { buildFigmaTree } from '../figma/mapper.js';

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

/**
 * @param {string} inputPath
 * @param {ConvertOptions} options
 */
export async function convertHtmlFile(inputPath, options = {}) {
  const viewport = normalizeViewport(options.viewport);
  return convertWithExtractor({
    extractor: () => extractFromFile(inputPath, viewport),
    source: inputPath,
    viewport,
    skipAi: options.skipAi,
    onProgress: options.onProgress,
  });
}

/**
 * @param {string} html
 * @param {ConvertHtmlOptions} options
 */
export async function convertHtmlString(html, options = {}) {
  const viewport = normalizeViewport(options.viewport);
  return convertWithExtractor({
    extractor: () => extractFromHtml(html, {
      ...viewport,
      baseUrl: options.baseUrl ?? null,
    }),
    source: options.sourceName ?? 'inline.html',
    viewport,
    skipAi: options.skipAi,
    baseUrl: options.baseUrl ?? null,
    onProgress: options.onProgress,
  });
}

async function convertWithExtractor({ extractor, source, viewport, skipAi = false, baseUrl = null, onProgress = null }) {
  progress(onProgress, 5, 'Extracting page...');
  const { domTree, rawCSS, screenshots } = await extractor();
  const warnings = [];

  let pseudoElements = [];
  let gridStrategies = {};
  let hoverSpecs = {};

  const aiEnabled = !skipAi && Boolean(process.env.ANTHROPIC_API_KEY);
  if (!skipAi && !process.env.ANTHROPIC_API_KEY) {
    warnings.push('ANTHROPIC_API_KEY not found, so AI enhancement steps were skipped.');
  }

  if (aiEnabled) {
    progress(onProgress, 25, 'Detecting pseudo-elements...');
    pseudoElements = await runAiStep(
      'pseudo-element detection',
      () => detectPseudoElements(screenshots.withPseudo, screenshots.withoutPseudo),
      [],
      warnings
    );

    progress(onProgress, 45, 'Resolving CSS grid...');
    gridStrategies = await runAiStep(
      'grid layout resolution',
      () => resolveGridLayouts(rawCSS, domTree),
      {},
      warnings
    );

    progress(onProgress, 65, 'Analyzing hover states...');
    hoverSpecs = await runAiStep(
      'hover analysis',
      () => analyzeHoverStates(rawCSS),
      {},
      warnings
    );
  } else {
    progress(onProgress, 65, 'Skipping AI steps...');
  }

  progress(onProgress, 80, 'Resolving fonts...');
  const fontMap = await resolveFonts(domTree);
  progress(onProgress, 90, 'Building Figma tree...');
  const sorted = sortByZIndex(domTree);
  const figmaTree = buildFigmaTree(sorted, { pseudoElements, gridStrategies, hoverSpecs, fontMap });
  progress(onProgress, 100, 'Conversion complete');

  return {
    version: '0.1.0',
    meta: {
      source,
      viewport,
      ...(baseUrl ? { baseUrl } : {}),
      aiEnabled,
      skipAi: !aiEnabled,
    },
    warnings,
    figmaTree,
    hoverSpecs,
  };
}

function progress(onProgress, percent, message) {
  if (typeof onProgress === 'function') {
    onProgress(percent, message);
  }
}

async function runAiStep(label, fn, fallback, warnings) {
  try {
    return await fn();
  } catch (error) {
    warnings.push(`AI step failed for ${label}: ${error.message}`);
    return fallback;
  }
}

function normalizeViewport(viewport = {}) {
  const width = Number.parseInt(viewport.width ?? DEFAULT_VIEWPORT.width, 10);
  const height = Number.parseInt(viewport.height ?? DEFAULT_VIEWPORT.height, 10);

  return {
    width: Number.isFinite(width) ? width : DEFAULT_VIEWPORT.width,
    height: Number.isFinite(height) ? height : DEFAULT_VIEWPORT.height,
  };
}

/**
 * @typedef {{ viewport?: { width?: number, height?: number }, skipAi?: boolean }} ConvertOptions
 * @typedef {ConvertOptions & { sourceName?: string, baseUrl?: string | null }} ConvertHtmlOptions
 */
