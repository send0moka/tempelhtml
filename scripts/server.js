#!/usr/bin/env node
/**
 * Local tempelhtml bridge for the Figma plugin.
 * The plugin UI sends HTML here, and this server returns the converted JSON.
 */

import 'dotenv/config';
import http from 'node:http';
import { convertHtmlString } from '../src/pipeline/convert.js';

const PORT = Number.parseInt(process.env.TEMPELHTML_PORT ?? '3210', 10);

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, port: PORT }));
    return;
  }

  if (req.method === 'POST' && req.url === '/convert') {
    try {
      const body = await readJsonBody(req);
      if (!body.html || typeof body.html !== 'string') {
        throw new Error('`html` is required.');
      }

      const result = await convertHtmlString(body.html, {
        sourceName: body.sourceName || 'inline.html',
        baseUrl: body.baseUrl || null,
        skipAi: Boolean(body.skipAi),
        viewport: {
          width: body.viewport?.width,
          height: body.viewport?.height,
        },
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`tempelhtml server listening on http://localhost:${PORT}`);
});

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10 * 1024 * 1024) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}
