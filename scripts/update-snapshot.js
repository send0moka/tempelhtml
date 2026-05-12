#!/usr/bin/env node
/**
 * Regenerates the deterministic baseline snapshot used in tests.
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { convertHtmlFile } from '../src/pipeline/convert.js';

const SNAPSHOT_PATH = 'tests/vela/expected-snapshot.json';
const INPUT_PATH = './tests/vela/input.html';

const output = await convertHtmlFile(INPUT_PATH, {
  skipAi: true,
  viewport: { width: 1440, height: 900 },
});

mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
writeFileSync(SNAPSHOT_PATH, JSON.stringify(output, null, 2));

console.log(`Updated snapshot at ${SNAPSHOT_PATH}`);
