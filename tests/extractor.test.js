import { extractFromFile } from '../src/core/extractor.js';

function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const hit = find(child, predicate);
    if (hit) return hit;
  }
  return null;
}

test('preserves structured interactive children instead of collapsing them into text', async () => {
  const { domTree } = await extractFromFile('./tests/vela/input.html', {
    width: 1440,
    height: 900,
  });

  const navCta = find(domTree, (node) => node.classList?.includes('nav-cta'));
  const btnGhost = find(domTree, (node) => node.classList?.includes('btn-ghost'));

  expect(navCta).toBeTruthy();
  expect(navCta.tag).toBe('a');
  expect(navCta.isTextContainer).toBe(false);
  expect(navCta.computed.borderStyle).toBe('solid');

  expect(btnGhost).toBeTruthy();
  expect(btnGhost.tag).toBe('a');
  expect(btnGhost.isTextContainer).toBe(false);
  expect(btnGhost.computed.display).toBe('flex');
}, 30000);
