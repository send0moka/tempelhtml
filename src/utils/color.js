/**
 * src/utils/color.js
 * Color conversion utilities for CSS → Figma RGB (0-1 range).
 */

/**
 * Convert hex color to Figma RGB object.
 * @param {string} hex - e.g. "#c9a84c" or "#fff"
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToFigmaRGB(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  const n = parseInt(full, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

/**
 * Convert CSS rgba() string to Figma RGBA.
 * @param {string} rgba - e.g. "rgba(201, 168, 76, 0.3)"
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
export function rgbaStringToFigma(rgba) {
  const m = rgba.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return { r: 0, g: 0, b: 0, a: 1 };
  return {
    r: parseFloat(m[1]) / 255,
    g: parseFloat(m[2]) / 255,
    b: parseFloat(m[3]) / 255,
    a: m[4] !== undefined ? parseFloat(m[4]) : 1,
  };
}

/**
 * Parse any CSS color string → Figma RGBA.
 * Handles: hex, rgba(), rgb()
 */
export function cssColorToFigma(color) {
  if (!color || color === 'transparent' || color === 'none') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  if (color.startsWith('#')) {
    return { ...hexToFigmaRGB(color), a: 1 };
  }
  if (color.startsWith('rgb')) {
    return rgbaStringToFigma(color);
  }
  // Fallback
  return { r: 0, g: 0, b: 0, a: 1 };
}

/**
 * Build a Figma solid paint object.
 */
export function solidPaint(cssColor, opacity = 1) {
  const { r, g, b, a } = cssColorToFigma(cssColor);
  return {
    type: 'SOLID',
    color: { r, g, b },
    opacity: opacity * a,
  };
}
