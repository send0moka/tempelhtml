/**
 * src/ai/hover-analyzer.js
 * Extracts all CSS :hover, :focus, :active rules and transitions,
 * then uses LLM to generate Figma Component Variant specs.
 */

import { createMessageWithFallback, getResponseText, parseJsonPayload } from './client.js';

/**
 * @param {string} rawCSS - full CSS text from the page
 * @returns {Promise<Record<string, HoverSpec>>}
 *   Map from CSS selector to variant spec
 */
export async function analyzeHoverStates(rawCSS) {
  // Extract only the :hover, :focus, :active rules + transitions
  const interactiveRules = extractInteractiveRules(rawCSS);
  if (interactiveRules.length === 0) return {};

  const response = await createMessageWithFallback({
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `You are a Figma design system expert. Analyze these CSS interactive states and identify which selectors should become named Figma components.

CSS Rules:
${interactiveRules.join('\n\n')}

Return only a compact JSON array (no markdown, no explanation):
[
  {
    "selector": ".btn-primary",
    "componentName": "Button/Primary",
    "notes": "short summary"
  }
]

Focus on selectors that clearly represent reusable interactive UI.
Ignore animation keyframes and do not invent nested structures.`,
      },
    ],
  });

  const text = getResponseText(response);
  try {
    const specs = parseJsonPayload(text);
    const map = {};
    for (const spec of specs) {
      map[spec.selector] = spec;
    }
    return map;
  } catch {
    console.warn('[hover-analyzer] Failed to parse AI response. Raw:', text.slice(0, 200));
    return {};
  }
}

/**
 * Extract only interactive CSS rules (hover, focus, active, transition).
 */
function extractInteractiveRules(rawCSS) {
  const lines = rawCSS.split('\n');
  const rules = [];
  let current = [];
  let depth = 0;
  let isInteractive = false;

  for (const line of lines) {
    const open = (line.match(/{/g) || []).length;
    const close = (line.match(/}/g) || []).length;

    if (depth === 0 && (line.includes(':hover') || line.includes(':focus') || line.includes(':active'))) {
      isInteractive = true;
    }

    if (isInteractive) current.push(line);
    depth += open - close;

    if (depth === 0 && isInteractive) {
      rules.push(current.join('\n'));
      current = [];
      isInteractive = false;
    }
  }

  return rules;
}

/**
 * @typedef {Object} HoverSpec
 * @property {string} selector
 * @property {string} componentName
 * @property {Array<{name: string, properties: object}>} variants
 * @property {{durationMs: number, easing: string}} transition
 * @property {object} figmaPrototype
 */
