import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const DEFAULT_MODEL_CANDIDATES = [
  process.env.ANTHROPIC_MODEL,
  'claude-sonnet-4-6',
  'claude-sonnet-4-0',
  'claude-3-7-sonnet-latest',
  'claude-3-5-sonnet-latest',
].filter(Boolean);

export async function createMessageWithFallback(payload) {
  let lastError;

  for (const model of DEFAULT_MODEL_CANDIDATES) {
    try {
      return await client.messages.create({
        ...payload,
        model,
      });
    } catch (error) {
      lastError = error;
      if (!isMissingModelError(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error('No Anthropic model candidates are configured.');
}

function isMissingModelError(error) {
  if (error && error.status === 404) return true;
  const message = String(error && error.message ? error.message : error);
  return message.includes('not_found_error') || message.includes('model:');
}

export function getResponseText(response) {
  return (response && response.content ? response.content : [])
    .filter((item) => item && item.type === 'text' && item.text)
    .map((item) => item.text)
    .join('\n')
    .trim();
}

export function parseJsonPayload(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    throw new Error('Model returned an empty response.');
  }

  const clean = raw.replace(/```json|```/gi, '').trim();
  try {
    return JSON.parse(clean);
  } catch {}

  const arrayStart = clean.indexOf('[');
  const arrayEnd = clean.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return JSON.parse(clean.slice(arrayStart, arrayEnd + 1));
  }

  const objectStart = clean.indexOf('{');
  const objectEnd = clean.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return JSON.parse(clean.slice(objectStart, objectEnd + 1));
  }

  throw new Error('Model response did not contain valid JSON.');
}
