/**
 * src/ai/pseudo-detector.js
 * Uses Claude Vision to detect ::before / ::after elements
 * by comparing two screenshots: with and without pseudo-elements.
 *
 * Returns a list of bounding boxes + visual descriptions
 * that can be used to create manual Figma frames.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

/**
 * @param {Buffer} withPseudo    - screenshot with pseudo-elements visible
 * @param {Buffer} withoutPseudo - screenshot with ::before/::after hidden
 * @returns {Promise<PseudoElement[]>}
 */
export async function detectPseudoElements(withPseudo, withoutPseudo) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: withPseudo.toString('base64') },
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: withoutPseudo.toString('base64') },
          },
          {
            type: 'text',
            text: `Compare these two screenshots. The first has all CSS ::before and ::after pseudo-elements visible. The second has them all hidden.

Find every visual element that appears in the first image but is missing or different in the second.

For each difference, return a JSON array (no markdown, no explanation, just the array):
[
  {
    "name": "descriptive name e.g. 'grain overlay' or 'nav gradient fade'",
    "type": "overlay | gradient | shape | text | decoration",
    "x": number,
    "y": number,
    "width": number,
    "height": number,
    "fillColor": "hex or rgba string or 'noise-texture'",
    "opacity": number,
    "content": "text content if type=text, else null",
    "position": "fixed | absolute",
    "zOrder": "top | bottom | behind-parent"
  }
]

If no differences found, return an empty array [].`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].text.trim();
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    console.warn('[pseudo-detector] Failed to parse AI response, returning empty array.');
    console.warn('[pseudo-detector] Raw response:', text.slice(0, 200));
    return [];
  }
}

/**
 * @typedef {Object} PseudoElement
 * @property {string} name
 * @property {'overlay'|'gradient'|'shape'|'text'|'decoration'} type
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {string} fillColor
 * @property {number} opacity
 * @property {string|null} content
 * @property {'fixed'|'absolute'} position
 * @property {'top'|'bottom'|'behind-parent'} zOrder
 */
