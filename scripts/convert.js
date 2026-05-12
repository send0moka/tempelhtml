#!/usr/bin/env node
/**
 * tempelhtml CLI
 * Usage: node scripts/convert.js --input ./examples/page.html --output ./out/page.json
 */

import 'dotenv/config';
import { program } from 'commander';
import { extractFromFile } from '../src/core/extractor.js';
import { detectPseudoElements } from '../src/ai/pseudo-detector.js';
import { resolveGridLayouts } from '../src/ai/grid-resolver.js';
import { analyzeHoverStates } from '../src/ai/hover-analyzer.js';
import { resolveFonts } from '../src/figma/font-resolver.js';
import { sortByZIndex } from '../src/figma/z-index-sorter.js';
import { buildFigmaTree } from '../src/figma/mapper.js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

program
  .requiredOption('--input <path>', 'Path to input HTML file')
  .requiredOption('--output <path>', 'Path for output JSON (loaded by Figma plugin)')
  .option('--width <px>', 'Viewport width', '1440')
  .option('--height <px>', 'Viewport height', '900')
  .option('--skip-ai', 'Skip AI steps (faster, less accurate)')
  .parse();

const opts = program.opts();

async function run() {
  console.log(`\n🔍 [1/6] Extracting from ${opts.input}...`);
  const { domTree, rawCSS, screenshots } = await extractFromFile(opts.input, {
    width: parseInt(opts.width),
    height: parseInt(opts.height),
  });

  let pseudoElements = [];
  let gridStrategies = {};
  let hoverSpecs = {};

  if (!opts.skipAi) {
    console.log('👁  [2/6] Detecting ::before/::after via CV...');
    pseudoElements = await detectPseudoElements(screenshots.withPseudo, screenshots.withoutPseudo);

    console.log('🤖 [3/6] Resolving CSS Grid layouts via LLM...');
    gridStrategies = await resolveGridLayouts(rawCSS, domTree);

    console.log('🤖 [4/6] Analyzing hover states via LLM...');
    hoverSpecs = await analyzeHoverStates(rawCSS);
  } else {
    console.log('⚡ Skipping AI steps (--skip-ai flag set)');
  }

  console.log('🔤 [5/6] Resolving fonts...');
  const fontMap = await resolveFonts(domTree);

  console.log('📐 [6/6] Building Figma node tree...');
  const sorted = sortByZIndex(domTree);
  const figmaTree = buildFigmaTree(sorted, { pseudoElements, gridStrategies, hoverSpecs, fontMap });

  const output = {
    version: '0.1.0',
    meta: { source: opts.input, viewport: { width: opts.width, height: opts.height } },
    figmaTree,
    hoverSpecs,
  };

  mkdirSync(dirname(opts.output), { recursive: true });
  writeFileSync(opts.output, JSON.stringify(output, null, 2));
  console.log(`\n✅ Done! Output → ${opts.output}`);
  console.log('   Load this file in Figma plugin to build the design.\n');
}

run().catch((err) => {
  console.error('❌ Conversion failed:', err);
  process.exit(1);
});
