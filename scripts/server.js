#!/usr/bin/env node
/**
 * Local Morphus bridge for the Figma plugin.
 * The plugin UI sends HTML here, and this server returns the converted JSON.
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { convertHtmlString } from '../src/pipeline/convert.js';

const PORT = Number.parseInt(process.env.PORT ?? process.env.MORPHUS_PORT ?? '3210', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const jobs = new Map();

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, host: HOST, port: PORT }));
    return;
  }

  if (req.method === 'POST' && req.url === '/jobs') {
    try {
      const body = await readJsonBody(req);
      if (!body.html || typeof body.html !== 'string') {
        throw new Error('`html` is required.');
      }

      const jobId = randomUUID();
      jobs.set(jobId, {
        state: 'queued',
        progress: 0,
        message: 'Queued',
        result: null,
        error: null,
      });

      runJob(jobId, body).catch((error) => {
        setJobError(jobId, error);
      });

      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jobId }));
      return;
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }
  }

  if (req.method === 'GET' && req.url && req.url.startsWith('/jobs/')) {
    const jobId = req.url.split('/').pop();
    const job = jobs.get(jobId);
    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Job not found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(job));
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

server.listen(PORT, HOST, () => {
  const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Morphus server listening on http://${displayHost}:${PORT}`);
});

async function runJob(jobId, body) {
  setJob(jobId, 'running', 1, 'Starting conversion...');

  const result = await convertHtmlString(body.html, {
    sourceName: body.sourceName || 'inline.html',
    baseUrl: body.baseUrl || null,
    viewport: {
      width: body.viewport && body.viewport.width,
      height: body.viewport && body.viewport.height,
    },
    onProgress: (progress, message) => {
      setJob(jobId, 'running', progress, message);
    },
  });

  setJob(jobId, 'done', 100, 'Done', result);
}

function setJob(jobId, state, progress, message, result) {
  jobs.set(jobId, {
    state: state,
    progress: progress,
    message: message,
    result: result || null,
    error: null,
  });
}

function setJobError(jobId, error) {
  jobs.set(jobId, {
    state: 'error',
    progress: 100,
    message: 'Conversion failed',
    result: null,
    error: error && error.message ? error.message : String(error),
  });
}

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
