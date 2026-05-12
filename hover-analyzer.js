/**
 * src/ai/hover-analyzer.js
 * Extracts all CSS :hover, :focus, :active rules and transitions,
 * then uses LLM to generate Figma Component Variant specs.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

/**
 * @param {string} rawCSS - full CSS text from the page
 * @returns {Promise<Record<string, HoverSpec>>}
 *   Map from CSS selector to variant spec
 */
export async function analyzeHoverStates(rawCSS) {
  // Extract only the :hover, :focus, :active rules + transitions
  const interactiveRules = extractInteractiveRules(rawCSS);
  if (interactiveRules.length === 0) return {};

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `You are a Figma design system expert. Analyze these CSS interactive states and generate Figma Component Variant specifications.

CSS Rules:
${interactiveRules.join('\n\n')}

For each interactive element, return a JSON array (no markdown, no explanation):
[
  {
    "selector": ".btn-primary",
    "componentName": "Button/Primary",
    "variants": [
      {
        "name": "State=Default",
        "properties": {
          "fills": [{"type": "SOLID", "hex": "#c9a84c"}],
          "strokes": [],
          "opacity": 1,
          "cornerRadius": 0,
          "effects": []
        }
      },
      {
        "name": "State=Hover",
        "properties": {
          "fills": [{"type": "SOLID", "hex": "#e8c97a"}],
          "strokes": [],
          "opacity": 1,
          "cornerRadius": 0,
          "effects": [],
          "transform": {"translateY": -2}
        }
      }
    ],
    "transition": {
      "durationMs": 300,
      "easing": "ease-out"
    },
    "figmaPrototype": {
      "trigger": "MOUSE_ENTER",
      "action": "CHANGE_TO",
      "animation": "SMART_ANIMATE"
    }
  }
]

Focus on: background changes, color changes, border changes, opacity changes, transform (translateY/scale), box-shadow changes.
Ignore: animation keyframes (those are not hover states).`,
      },
    ],
  });

  const text = response.content[0].text.trim();
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const specs = JSON.parse(clean);
    const map = {};
    for (const spec of specs) {
      map[spec.selector] = spec;
    }
    return map;
  } catch {
    console.warn('[hover-analyzer] Failed to parse AI response.');
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

    if (depth === 0 && (line.includes(':hover') || line.includes(':focus') ||
        line.includes(':active') || line.includes('transition'))) {
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
