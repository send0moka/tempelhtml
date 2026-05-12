/**
 * src/core/extractor.js
 * Renders HTML in headless Playwright, extracts computed styles
 * and bounding rects for every DOM element.
 */

import { chromium } from 'playwright';
import { existsSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import { pathToFileURL } from 'url';
import { captureScreenshots } from './screenshot.js';

/**
 * @param {string} filePath - absolute or relative path to HTML file
 * @param {{ width: number, height: number }} viewport
 * @returns {{ domTree, rawCSS, screenshots }}
 */
export async function extractFromFile(filePath, { width = 1440, height = 900 } = {}) {
  const absPath = resolve(filePath);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });

  await page.goto(pathToFileURL(absPath).href);
  const result = await extractFromPage(page);
  await browser.close();
  return result;
}

/**
 * @param {string} html
 * @param {{ width?: number, height?: number, baseUrl?: string | null }} options
 * @returns {{ domTree, rawCSS, screenshots }}
 */
export async function extractFromHtml(html, { width = 1440, height = 900, baseUrl = null } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const htmlWithBase = injectBaseHref(html, normalizeBaseUrl(baseUrl));

  await page.setContent(htmlWithBase, { waitUntil: 'load' });
  const result = await extractFromPage(page);
  await browser.close();
  return result;
}

async function extractFromPage(page) {
  await stabilizePage(page);

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

  return { domTree, rawCSS, screenshots };
}

async function stabilizePage(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));

    const animated = Array.from(document.querySelectorAll('*')).filter((el) => {
      const cs = window.getComputedStyle(el);
      return cs.animationName !== 'none' || cs.transitionDuration !== '0s';
    });
    animated.forEach((el) => el.setAttribute('data-tempelhtml-animated', '1'));

    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
    document.head.appendChild(style);

    document.querySelectorAll('[data-tempelhtml-animated="1"]').forEach((el) => {
      const cs = window.getComputedStyle(el);
      if (cs.opacity === '0') {
        el.style.opacity = '1';
      }
      if (cs.transform !== 'none') {
        el.style.transform = 'none';
      }
    });
  });

  await page.waitForLoadState('networkidle');
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return null;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(baseUrl)) return baseUrl;

  const absPath = resolve(baseUrl);
  const targetPath = existsSync(absPath) && !statSync(absPath).isDirectory()
    ? dirname(absPath)
    : absPath;

  let href = pathToFileURL(targetPath).href;
  if (!href.endsWith('/')) {
    href += '/';
  }
  return href;
}

function injectBaseHref(html, baseHref) {
  if (!baseHref || /<base\s/i.test(html)) {
    return html;
  }

  const baseTag = `<base href="${escapeHtmlAttribute(baseHref)}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${baseTag}`);
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
  }

  return `<!DOCTYPE html><html><head>${baseTag}</head><body>${html}</body></html>`;
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

/**
 * This function is serialized and run inside the browser context.
 * It must be self-contained (no imports).
 */
function walkDOMInBrowser() {
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'NOSCRIPT']);
  const TEXT_TAGS = new Set(['p', 'span', 'a', 'label', 'li', 'em', 'strong', 'b', 'i', 'small', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  const INLINE_TAGS = new Set(['span', 'a', 'label', 'em', 'strong', 'b', 'i', 'small', 'mark', 'sup', 'sub', 'u', 's', 'code', 'br', 'wbr']);

  function getNode(el, depth = 0) {
    if (SKIP_TAGS.has(el.tagName)) return null;

    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const csBefore = window.getComputedStyle(el, '::before');
    const csAfter = window.getComputedStyle(el, '::after');
    const tag = el.tagName.toLowerCase();

    // Skip invisible/zero-size elements
    if (rect.width === 0 && rect.height === 0 && cs.position === 'static') return null;

    const rawText = normalizeTextContent(el.innerText || el.textContent || '');
    const onlyInlineChildren = Array.from(el.children).every(child => {
      const childTag = child.tagName.toLowerCase();
      if (INLINE_TAGS.has(childTag)) return true;
      const childDisplay = window.getComputedStyle(child).display;
      return childDisplay.startsWith('inline');
    });
    const hasLayoutDisplay = cs.display === 'flex' || cs.display === 'inline-flex' || cs.display === 'grid';
    const isTextContainer = Boolean(rawText) && !hasLayoutDisplay && (
      TEXT_TAGS.has(tag) ||
      el.children.length === 0 ||
      onlyInlineChildren
    );

    const textData = isTextContainer ? extractTextData(el) : null;

    const children = isTextContainer
      ? []
      : Array.from(el.children)
          .map(child => getNode(child, depth + 1))
          .filter(Boolean);

    return {
      tag,
      id: el.id || null,
      classList: Array.from(el.classList),
      text: isTextContainer ? (textData?.text || rawText) : null,
      textRuns: isTextContainer ? (textData?.runs || []) : [],
      isTextContainer,
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
      textDecoration: cs.textDecoration,
      webkitTextStrokeWidth: cs.webkitTextStrokeWidth,
      webkitTextStrokeColor: cs.webkitTextStrokeColor,
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

  function extractTextData(el) {
    const runs = [];
    const pieces = [];
    let lineIndex = 0;

    function pushText(text, styleEl) {
      const normalized = normalizeTextFragment(text);
      if (!normalized) return;
      pieces.push(normalized);
      runs.push({
        text: normalized,
        lineIndex,
        computed: extractTextRunStyles(window.getComputedStyle(styleEl)),
      });
    }

    function walkText(node, styleEl) {
      if (node.nodeType === Node.TEXT_NODE) {
        pushText(node.textContent || '', styleEl);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node;
      const tagName = element.tagName.toLowerCase();

      if (tagName === 'br') {
        pieces.push('\n');
        lineIndex++;
        return;
      }

      const nextStyleEl = element;
      for (const child of element.childNodes) {
        walkText(child, nextStyleEl);
      }
    }

    for (const child of el.childNodes) {
      walkText(child, el);
    }

    const text = pieces
      .join('')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    return { text, runs };
  }

  function extractTextRunStyles(cs) {
    return {
      display: cs.display,
      position: cs.position,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textAlign: cs.textAlign,
      textTransform: cs.textTransform,
      color: cs.color,
      opacity: cs.opacity,
      textDecoration: cs.textDecoration,
      webkitTextStrokeWidth: cs.webkitTextStrokeWidth,
      webkitTextStrokeColor: cs.webkitTextStrokeColor,
    };
  }

  function normalizeTextFragment(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function normalizeTextContent(value) {
    return String(value || '')
      .replace(/\r/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  return getNode(document.body);
}
