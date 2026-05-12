/**
 * src/ai/grid-resolver.js
 * Sends CSS grid rules to Claude LLM and gets back
 * Figma Auto Layout nesting strategies.
 *
 * Batches all unique grid patterns into ONE API call
 * to avoid per-element overhead.
 */

import Anthropic from '@anthropic-ai/sdk';
import { findGridNodes } from '../core/dom-tree.js';

const client = new Anthropic();

/**
 * @param {string} rawCSS - all CSS from the page
 * @param {object} domTree - the intermediate DOM tree
 * @returns {Promise<Record<string, GridStrategy>>}
 *   Map from CSS selector/class to Figma layout strategy
 */
export async function resolveGridLayouts(rawCSS, domTree) {
  const gridNodes = findGridNodes(domTree);
  if (gridNodes.length === 0) return {};

  // Extract unique grid patterns (by gridTemplateColumns value)
  const uniquePatterns = deduplicateGridPatterns(gridNodes);
  if (uniquePatterns.length === 0) return {};

  const patternsText = uniquePatterns
    .map((p, i) => `Pattern ${i + 1} (selector hint: .${p.classList[0] ?? 'unknown'}):\n${formatGridCSS(p.computed)}`)
    .join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `You are a Figma layout expert. Convert these CSS grid layouts into Figma Auto Layout frame structures.

${patternsText}

For each pattern, return the optimal Figma Auto Layout nesting strategy.
Respond ONLY with a JSON array, no markdown, no explanation:
[
  {
    "patternIndex": 1,
    "selectorHint": ".class-name",
    "outerFrame": {
      "layoutMode": "HORIZONTAL" | "VERTICAL",
      "primaryAxisSizingMode": "FIXED" | "HUG",
      "counterAxisSizingMode": "FIXED" | "HUG",
      "itemSpacing": number,
      "children": [
        {
          "name": "column/cell name",
          "layoutMode": "HORIZONTAL" | "VERTICAL" | "NONE",
          "layoutGrow": number,
          "layoutSizingHorizontal": "FILL" | "HUG" | "FIXED",
          "layoutSizingVertical": "FILL" | "HUG" | "FIXED",
          "children": "PASS_THROUGH"
        }
      ]
    },
    "notes": "brief explanation of the strategy"
  }
]`,
      },
    ],
  });

  const text = response.content[0].text.trim();
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const strategies = JSON.parse(clean);

    // Index by selectorHint for easy lookup
    const map = {};
    for (const s of strategies) {
      map[s.selectorHint] = s;
    }
    return map;
  } catch {
    console.warn('[grid-resolver] Failed to parse AI response.');
    return {};
  }
}

function deduplicateGridPatterns(gridNodes) {
  const seen = new Set();
  return gridNodes.filter(n => {
    const key = n.computed.gridTemplateColumns + '|' + n.computed.gridTemplateRows;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatGridCSS(computed) {
  return [
    `display: grid;`,
    computed.gridTemplateColumns ? `grid-template-columns: ${computed.gridTemplateColumns};` : '',
    computed.gridTemplateRows ? `grid-template-rows: ${computed.gridTemplateRows};` : '',
    computed.gap ? `gap: ${computed.gap};` : '',
    computed.columnGap ? `column-gap: ${computed.columnGap};` : '',
    computed.rowGap ? `row-gap: ${computed.rowGap};` : '',
  ].filter(Boolean).join('\n');
}

/**
 * @typedef {Object} GridStrategy
 * @property {number} patternIndex
 * @property {string} selectorHint
 * @property {object} outerFrame
 * @property {string} notes
 */
