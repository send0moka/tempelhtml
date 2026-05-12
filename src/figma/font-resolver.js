/**
 * src/figma/font-resolver.js
 * Resolves CSS font families and weights to Figma font names.
 * Builds a font map for the entire DOM tree before node creation.
 *
 * NOTE: This module runs in Node.js (not inside Figma).
 * It outputs a fontMap that the Figma plugin reads and pre-loads.
 */

import { walk } from '../core/dom-tree.js';
import { WEIGHT_MAP } from '../utils/units.js';

// Known Google Fonts available in Figma + their available styles
const FIGMA_FONT_STYLES = {
  'Playfair Display': ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black',
                        'Thin Italic', 'ExtraLight Italic', 'Light Italic', 'Italic', 'Medium Italic',
                        'SemiBold Italic', 'Bold Italic', 'ExtraBold Italic', 'Black Italic'],
  'DM Sans': ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black',
               'Thin Italic', 'ExtraLight Italic', 'Light Italic', 'Italic', 'Medium Italic',
               'SemiBold Italic', 'Bold Italic', 'ExtraBold Italic', 'Black Italic'],
  'Bebas Neue': ['Regular'],
  'Inter': ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black',
             'Thin Italic', 'ExtraLight Italic', 'Light Italic', 'Italic', 'Medium Italic',
             'SemiBold Italic', 'Bold Italic', 'ExtraBold Italic', 'Black Italic'],
};

/**
 * @param {object} domTree
 * @returns {Promise<FontMap>} Map of "family|weight|italic" → { family, style }
 */
export async function resolveFonts(domTree) {
  const needed = new Set();

  walk(domTree, (node) => {
    const { fontFamily, fontWeight, fontStyle } = node.computed ?? {};
    if (fontFamily) {
      const key = `${fontFamily}|${fontWeight ?? '400'}|${fontStyle ?? 'normal'}`;
      needed.add(key);
    }
  });

  const fontMap = {};
  for (const key of needed) {
    const [family, weight, style] = key.split('|');
    const resolved = resolveFont(cleanFamilyName(family), weight, style === 'italic');
    fontMap[key] = resolved;
  }

  return fontMap;
}

/**
 * Strip quotes from CSS font-family string.
 * e.g. "'Playfair Display', serif" → "Playfair Display"
 */
function cleanFamilyName(css) {
  const first = css.split(',')[0].trim();
  return first.replace(/['"]/g, '');
}

/**
 * Resolve to a specific Figma font, with fallback chain.
 */
function resolveFont(family, weightStr, isItalic) {
  const weight = parseInt(weightStr) || 400;
  const styleName = WEIGHT_MAP[weight] ?? 'Regular';
  const italicSuffix = isItalic ? ' Italic' : '';
  const targetStyle = styleName === 'Regular' && isItalic ? 'Italic' : `${styleName}${italicSuffix}`;

  // Try requested font
  if (FIGMA_FONT_STYLES[family]?.includes(targetStyle)) {
    return { family, style: targetStyle };
  }
  // Try Regular of requested font
  if (FIGMA_FONT_STYLES[family]?.includes('Regular')) {
    return { family, style: 'Regular' };
  }
  // Fallback to Inter
  if (FIGMA_FONT_STYLES['Inter'].includes(targetStyle)) {
    return { family: 'Inter', style: targetStyle };
  }
  return { family: 'Inter', style: 'Regular' };
}

/**
 * @typedef {Record<string, { family: string, style: string }>} FontMap
 */
