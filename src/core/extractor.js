/**
 * src/core/extractor.js
 * Renders HTML in headless Playwright, extracts computed styles
 * and bounding rects for every DOM element.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { captureScreenshots } from './screenshot.js';
import { walkDOM } from './dom-tree.js';

/**
 * @param {string} filePath - absolute or relative path to HTML file
 * @param {{ width: number, height: number }} viewport
 * @returns {{ domTree, rawCSS, screenshots }}
 */
export async function extractFromFile(filePath, { width = 1440, height = 900 } = {}) {
  const absPath = resolve(filePath);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });

  await page.goto(`file://${absPath}`);

  // Force all reveal animations to their final state
  await page.evaluate(() => {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    // Pause all CSS animations so we capture a clean static frame
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }';
    document.head.appendChild(style);
  });

  // Wait for fonts and images
  await page.waitForLoadState('networkidle');

  // Collect raw CSS text from all stylesheets
  const rawCSS = await page.evaluate(() => {
    return Array.from(document.styleSheets)
      .flatMap(sheet => {
        try { return Array.from(sheet.cssRules).map(r => r.cssText); }
        catch { return []; }
      })
      .join('\n');
  });

  // Walk the full DOM and capture computed styles + rects
  const domTree = await page.evaluate(walkDOMInBrowser);

  // Screenshots for pseudo-element detection
  const screenshots = await captureScreenshots(page);

  await browser.close();
  return { domTree, rawCSS, screenshots };
}

/**
 * This function is serialized and run inside the browser context.
 * It must be self-contained (no imports).
 */
function walkDOMInBrowser() {
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'NOSCRIPT']);

  function getNode(el, depth = 0) {
    if (SKIP_TAGS.has(el.tagName)) return null;

    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const csBefore = window.getComputedStyle(el, '::before');
    const csAfter = window.getComputedStyle(el, '::after');

    // Skip invisible/zero-size elements
    if (rect.width === 0 && rect.height === 0 && cs.position === 'static') return null;

    const children = Array.from(el.children)
      .map(child => getNode(child, depth + 1))
      .filter(Boolean);

    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classList: Array.from(el.classList),
      text: el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
        ? el.childNodes[0].textContent.trim()
        : null,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      computed: extractRelevantStyles(cs),
      pseudo: {
        before: csBefore.content !== 'none' ? extractRelevantStyles(csBefore) : null,
        after: csAfter.content !== 'none' ? extractRelevantStyles(csAfter) : null,
      },
      children,
    };
  }

  function extractRelevantStyles(cs) {
    return {
      display: cs.display,
      position: cs.position,
      zIndex: cs.zIndex,
      // Layout
      flexDirection: cs.flexDirection,
      justifyContent: cs.justifyContent,
      alignItems: cs.alignItems,
      flexWrap: cs.flexWrap,
      gap: cs.gap,
      columnGap: cs.columnGap,
      rowGap: cs.rowGap,
      gridTemplateColumns: cs.gridTemplateColumns,
      gridTemplateRows: cs.gridTemplateRows,
      gridRow: cs.gridRow,
      gridColumn: cs.gridColumn,
      // Sizing
      width: cs.width,
      height: cs.height,
      minWidth: cs.minWidth,
      maxWidth: cs.maxWidth,
      minHeight: cs.minHeight,
      // Spacing
      paddingTop: cs.paddingTop,
      paddingRight: cs.paddingRight,
      paddingBottom: cs.paddingBottom,
      paddingLeft: cs.paddingLeft,
      marginTop: cs.marginTop,
      marginRight: cs.marginRight,
      marginBottom: cs.marginBottom,
      marginLeft: cs.marginLeft,
      // Visual
      backgroundColor: cs.backgroundColor,
      backgroundImage: cs.backgroundImage,
      backgroundSize: cs.backgroundSize,
      backgroundPosition: cs.backgroundPosition,
      color: cs.color,
      opacity: cs.opacity,
      borderRadius: cs.borderRadius,
      borderTopLeftRadius: cs.borderTopLeftRadius,
      borderTopRightRadius: cs.borderTopRightRadius,
      borderBottomRightRadius: cs.borderBottomRightRadius,
      borderBottomLeftRadius: cs.borderBottomLeftRadius,
      border: cs.border,
      borderWidth: cs.borderWidth,
      borderColor: cs.borderColor,
      borderStyle: cs.borderStyle,
      boxShadow: cs.boxShadow,
      overflow: cs.overflow,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      mixBlendMode: cs.mixBlendMode,
      transform: cs.transform,
      // Typography
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textAlign: cs.textAlign,
      textTransform: cs.textTransform,
      whiteSpace: cs.whiteSpace,
      // Positioning
      top: cs.top,
      right: cs.right,
      bottom: cs.bottom,
      left: cs.left,
      inset: cs.inset,
      // Content (for pseudo-elements)
      content: cs.content,
    };
  }

  return getNode(document.body);
}
