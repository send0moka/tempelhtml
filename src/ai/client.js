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
