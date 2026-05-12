#!/usr/bin/env node
/**
 * tempelhtml CLI
 * Usage: node scripts/convert.js --input ./examples/page.html --output ./out/page.json
 */

import 'dotenv/config';
import { program } from 'commander';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { convertHtmlFile } from '../src/pipeline/convert.js';

program
  .requiredOption('--input <path>', 'Path to input HTML file')
  .requiredOption('--output <path>', 'Path for output JSON (loaded by Figma plugin)')
  .option('--width <px>', 'Viewport width', '1440')
  .option('--height <px>', 'Viewport height', '900')
  .option('--skip-ai', 'Skip AI steps (faster, less accurate)')
  .parse();

const opts = program.opts();

async function run() {
  console.log(`\nConverting ${opts.input}...`);

  const output = await convertHtmlFile(opts.input, {
    viewport: {
      width: parseInt(opts.width, 10),
      height: parseInt(opts.height, 10),
    },
    skipAi: Boolean(opts.skipAi),
  });

  mkdirSync(dirname(opts.output), { recursive: true });
  writeFileSync(opts.output, JSON.stringify(output, null, 2));

  for (const warning of output.warnings ?? []) {
    console.warn(`Warning: ${warning}`);
  }

  console.log(`\nDone. Output -> ${opts.output}`);
  console.log('Load this file in the Figma plugin, or use the plugin HTML flow with the local server.\n');
}

run().catch((err) => {
  console.error('Conversion failed:', err);
  process.exit(1);
});
