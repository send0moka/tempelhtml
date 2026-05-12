/**
 * src/figma/css-to-figma.js
 * Deterministic CSS property → Figma property mapper.
 * This is the core 1:1 mapping layer.
 *
 * All functions here take CSS computed style values
 * and return Figma Plugin API property objects.
 */

import { cssColorToFigma, solidPaint } from '../utils/color.js';
import {
  parsePx,
  letterSpacingToPx,
  lineHeightToFigma,
  WEIGHT_MAP,
  TEXT_ALIGN_MAP,
  TEXT_CASE_MAP,
  JUSTIFY_MAP,
  ALIGN_MAP,
} from '../utils/units.js';

function isTransparentCssColor(value) {
  if (!value || value === 'transparent' || value === 'none') {
    return true;
  }
  return cssColorToFigma(value).a === 0;
}

// ─── LAYOUT ──────────────────────────────────────────────────────────────────

/**
 * display: flex → Figma Auto Layout
 */
export function mapFlexLayout(computed) {
  const isRow = computed.flexDirection !== 'column' && computed.flexDirection !== 'column-reverse';
  return {
    layoutMode: isRow ? 'HORIZONTAL' : 'VERTICAL',
    primaryAxisAlignItems: JUSTIFY_MAP[computed.justifyContent] ?? 'MIN',
    counterAxisAlignItems: ALIGN_MAP[computed.alignItems] ?? 'MIN',
    itemSpacing: parsePx(computed.gap || computed.columnGap || computed.rowGap),
  };
}

/**
 * padding → Figma frame padding
 */
export function mapPadding(computed) {
  return {
    paddingTop: parsePx(computed.paddingTop),
    paddingRight: parsePx(computed.paddingRight),
    paddingBottom: parsePx(computed.paddingBottom),
    paddingLeft: parsePx(computed.paddingLeft),
  };
}

/**
 * overflow → Figma clipsContent
 */
export function mapOverflow(computed) {
  return {
    clipsContent: computed.overflow === 'hidden' || computed.overflowX === 'hidden' || computed.overflowY === 'hidden',
  };
}

/**
 * border-radius → Figma cornerRadius
 */
export function mapBorderRadius(computed, rect = { width: 0, height: 0 }) {
  const tl = parseRadiusValue(computed.borderTopLeftRadius, rect);
  const tr = parseRadiusValue(computed.borderTopRightRadius, rect);
  const br = parseRadiusValue(computed.borderBottomRightRadius, rect);
  const bl = parseRadiusValue(computed.borderBottomLeftRadius, rect);

  if (tl === tr && tr === br && br === bl) {
    return { cornerRadius: tl };
  }
  return {
    topLeftRadius: tl,
    topRightRadius: tr,
    bottomRightRadius: br,
    bottomLeftRadius: bl,
  };
}

function parseRadiusValue(value, rect) {
  if (!value || value === 'none' || value === 'auto') return 0;
  if (typeof value === 'string' && value.endsWith('%')) {
    const percent = parseFloat(value);
    if (Number.isFinite(percent)) {
      return (Math.min(rect.width || 0, rect.height || 0) * percent) / 100;
    }
  }
  return parsePx(value);
}

// ─── VISUAL / FILLS ───────────────────────────────────────────────────────────

/**
 * background-color → Figma solid fill
 */
export function mapBackgroundColor(computed) {
  const color = computed.backgroundColor;
  if (isTransparentCssColor(color)) return [];
  return [solidPaint(color)];
}

/**
 * Parse CSS linear-gradient → Figma GRADIENT_LINEAR paint.
 * Handles: linear-gradient(to bottom, ...) and linear-gradient(180deg, ...)
 */
export function parseLinearGradient(cssGradient) {
  // Simplified parser for common cases
  const toBottomMatch = cssGradient.match(/linear-gradient\(to bottom/i);
  const degMatch = cssGradient.match(/linear-gradient\(([\d.]+)deg/);

  let angle = 180; // default: to bottom
  if (degMatch) angle = parseFloat(degMatch[1]);
  else if (toBottomMatch) angle = 180;

  const rad = (angle * Math.PI) / 180;
  const gradientTransform = [
    [Math.cos(rad), Math.sin(rad), 0],
    [-Math.sin(rad), Math.cos(rad), 0.5],
  ];

  // Extract color stops (simplified — handles rgba and hex)
  const stops = extractGradientStops(cssGradient);

  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform,
    gradientStops: stops,
  };
}

function extractGradientStops(css) {
  const stopRegex = /(rgba?\([^)]+\)|#[0-9a-f]{3,8})\s*([\d.]+%)?/gi;
  const stops = [];
  let match;
  let index = 0;

  while ((match = stopRegex.exec(css)) !== null) {
    const color = cssColorToFigma(match[1]);
    const position = match[2] ? parseFloat(match[2]) / 100 : index === 0 ? 0 : 1;
    stops.push({ color, position });
    index++;
  }

  return stops.length > 0 ? stops : [
    { color: { r: 0, g: 0, b: 0, a: 0 }, position: 0 },
    { color: { r: 0, g: 0, b: 0, a: 0 }, position: 1 },
  ];
}

// ─── BORDERS / STROKES ────────────────────────────────────────────────────────

/**
 * border → Figma strokes
 */
export function mapBorder(computed) {
  const width = parsePx(computed.borderWidth);
  if (width === 0 || computed.borderStyle === 'none') return {};

  const color = cssColorToFigma(computed.borderColor);
  return {
    strokes: [{
      type: 'SOLID',
      color: { r: color.r, g: color.g, b: color.b },
      opacity: color.a,
    }],
    strokeWeight: width,
    strokeAlign: 'INSIDE', // CSS border-box behavior
  };
}

// ─── EFFECTS ─────────────────────────────────────────────────────────────────

/**
 * box-shadow → Figma DROP_SHADOW effect
 * Handles: "0 0 30px 10px rgba(201,168,76,0.3)"
 */
export function mapBoxShadow(computed) {
  if (!computed.boxShadow || computed.boxShadow === 'none') return [];

  const parts = computed.boxShadow.match(
    /(-?[\d.]+px)\s+(-?[\d.]+px)\s+([\d.]+px)\s*([\d.]+px)?\s*(rgba?\([^)]+\)|#[0-9a-f]{3,8})/i
  );
  if (!parts) return [];

  const [, x, y, blur, spread = '0px', colorStr] = parts;
  const color = cssColorToFigma(colorStr);

  return [{
    type: 'DROP_SHADOW',
    color: { r: color.r, g: color.g, b: color.b, a: color.a },
    offset: { x: parsePx(x), y: parsePx(y) },
    radius: parsePx(blur),
    spread: parsePx(spread),
    visible: true,
    blendMode: 'NORMAL',
  }];
}

// ─── TYPOGRAPHY ───────────────────────────────────────────────────────────────

/**
 * CSS text properties → Figma text node properties
 */
export function mapTypography(computed, fontMap) {
  const familyRaw = computed.fontFamily?.split(',')[0].replace(/['"]/g, '').trim() ?? 'Inter';
  const weight = computed.fontWeight ?? '400';
  const isItalic = computed.fontStyle === 'italic';
  const fontKey = `${computed.fontFamily}|${weight}|${isItalic ? 'italic' : 'normal'}`;

  const font = fontMap?.[fontKey] ?? { family: familyRaw, style: 'Regular' };
  const fontSize = parsePx(computed.fontSize) || 16;

  return {
    fontName: font,
    fontSize,
    lineHeight: lineHeightToFigma(computed.lineHeight, computed.fontSize),
    letterSpacing: {
      value: letterSpacingToPx(computed.letterSpacing, computed.fontSize),
      unit: 'PIXELS',
    },
    textAlignHorizontal: TEXT_ALIGN_MAP[computed.textAlign] ?? 'LEFT',
    textCase: TEXT_CASE_MAP[computed.textTransform] ?? 'ORIGINAL',
    // -webkit-text-stroke → outline text (color: transparent + stroke)
    fills: isTransparentCssColor(computed.color)
      ? []
      : [solidPaint(computed.color)],
  };
}

/**
 * Map -webkit-text-stroke to Figma strokes on a text node.
 */
export function mapTextStroke(computed) {
  // CSS doesn't expose webkit-text-stroke in getComputedStyle reliably,
  // but if fill is transparent we know it's outline text
  if (isTransparentCssColor(computed.color) && parsePx(computed.webkitTextStrokeWidth) > 0) {
    const width = parsePx(computed.webkitTextStrokeWidth);
    const color = cssColorToFigma(computed.webkitTextStrokeColor ?? '#000');
    return {
      strokes: [{
        type: 'SOLID',
        color: { r: color.r, g: color.g, b: color.b },
        opacity: color.a,
      }],
      strokeWeight: width,
      strokeAlign: 'OUTSIDE',
    };
  }
  return {};
}

// ─── POSITIONING ─────────────────────────────────────────────────────────────

/**
 * position: absolute → Figma absolute positioning
 */
export function mapPositioning(computed, rect, parentRect) {
  if (computed.position !== 'absolute' && computed.position !== 'fixed') {
    return {};
  }

  return {
    layoutPositioning: 'ABSOLUTE',
    x: rect.x - (parentRect?.x ?? 0),
    y: rect.y - (parentRect?.y ?? 0),
  };
}
