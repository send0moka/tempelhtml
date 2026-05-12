/**
 * src/core/screenshot.js
 * Captures before/after screenshots for pseudo-element detection.
 */

/**
 * @param {import('playwright').Page} page
 * @returns {{ withPseudo: Buffer, withoutPseudo: Buffer }}
 */
export async function captureScreenshots(page) {
  const withPseudo = await page.screenshot({ fullPage: true });

  // Inject style to hide all pseudo-elements
  const styleHandle = await page.addStyleTag({
    content: '*::before, *::after { display: none !important; }',
  });

  const withoutPseudo = await page.screenshot({ fullPage: true });

  // Remove injected style so it doesn't affect further processing
  await styleHandle.evaluate(el => el.remove());

  return { withPseudo, withoutPseudo };
}
