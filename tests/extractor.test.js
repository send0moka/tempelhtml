import { extractFromFile, extractFromHtml } from '../src/core/extractor.js';

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

test('captures form control placeholders and placeholder styles', async () => {
  const { domTree } = await extractFromHtml(`
    <style>
      .newsletter-input {
        color: rgb(20, 18, 16);
        font-family: Arial, sans-serif;
        font-size: 16px;
        padding: 12px 20px;
      }

      .newsletter-input::placeholder {
        color: rgba(20, 18, 16, 0.42);
      }
    </style>
    <input class="newsletter-input" type="email" placeholder="email@perusahaan.com" />
  `, {
    width: 360,
    height: 120,
  });

  const input = find(domTree, (node) => node.classList?.includes('newsletter-input'));

  expect(input).toBeTruthy();
  expect(input.formControl).toEqual(expect.objectContaining({
    type: 'email',
    value: '',
    placeholder: 'email@perusahaan.com',
  }));
  expect(input.formControl.placeholderComputed.color).toBe('rgba(20, 18, 16, 0.42)');
  expect(input.formControl.placeholderComputed.fontSize).toBe('16px');
}, 30000);

test('skips pseudo-elements collapsed in the default state', async () => {
  const { domTree } = await extractFromHtml(`
    <style>
      .nav-link {
        color: #111;
        display: inline-block;
        margin: 24px;
        overflow: visible;
        position: relative;
      }

      .nav-link::after {
        background: currentColor;
        bottom: -2px;
        content: '';
        height: 1px;
        left: 0;
        position: absolute;
        transform-origin: left center;
        width: 100%;
      }

      .nav-link.is-zero-width::after {
        width: 0;
      }

      .nav-link.is-zero-width:hover::after {
        width: 100%;
      }

      .nav-link.is-scaled::after {
        transform: scaleX(0);
      }

      .nav-link.is-scaled:hover::after {
        transform: scaleX(1);
      }

      .nav-link.is-clipped::after {
        clip-path: inset(0 100% 0 0);
      }

      .nav-link.is-clipped:hover::after {
        clip-path: inset(0);
      }

      .nav-link.is-translated {
        overflow: hidden;
      }

      .nav-link.is-translated::after {
        transform: translateX(-100%);
      }

      .nav-link.is-translated:hover::after {
        transform: translateX(0);
      }
    </style>
    <a class="nav-link is-zero-width" href="#">Shop</a>
    <a class="nav-link is-scaled" href="#">Story</a>
    <a class="nav-link is-clipped" href="#">Lookbook</a>
    <a class="nav-link is-translated" href="#">Journal</a>
    <a class="nav-link is-visible" href="#">Story</a>
  `, {
    width: 720,
    height: 160,
  });

  const hiddenClasses = ['is-zero-width', 'is-scaled', 'is-clipped', 'is-translated'];
  const visibleLink = find(domTree, (node) => node.classList?.includes('is-visible'));

  for (const className of hiddenClasses) {
    const hiddenLink = find(domTree, (node) => node.classList?.includes(className));
    expect(hiddenLink).toBeTruthy();
    expect(hiddenLink.pseudo.after).toBeNull();
  }

  expect(visibleLink).toBeTruthy();
  expect(visibleLink.pseudo.after).toBeTruthy();
  expect(visibleLink.pseudo.after.rect.width).toBeGreaterThan(0);
}, 30000);

test('captures inline svg markup for native import', async () => {
  const { domTree } = await extractFromHtml(`
    <svg class="collar-illustration" viewBox="0 0 200 220" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M40 80 L80 40 L100 55 L120 40 L160 80" stroke="#2B2220" stroke-width="1.5" fill="none"/>
      <circle cx="100" cy="80" r="3" fill="#2B2220" opacity="0.5"/>
    </svg>
  `, {
    width: 240,
    height: 240,
  });

  const svg = find(domTree, (node) => node.tag === 'svg');
  expect(svg).toBeTruthy();
  expect(svg.children).toHaveLength(0);
  expect(svg.svgMarkup).toContain('<path');
  expect(svg.svgMarkup).toContain('stroke="rgb(43, 34, 32)"');
  expect(svg.svgMarkup).toContain('<circle');
}, 30000);

test('captures one-sided borders as visual boxes', async () => {
  const { domTree } = await extractFromHtml(`
    <style>
      .editorial-link {
        border-bottom: 1px solid rgba(245, 242, 237, 0.4);
        color: rgb(245, 242, 237);
        display: inline-block;
        text-decoration: none;
      }
    </style>
    <a class="editorial-link" href="#">Read Our Story</a>
  `, {
    width: 320,
    height: 120,
  });

  const link = find(domTree, (node) => node.classList?.includes('editorial-link'));
  expect(link).toBeTruthy();
  expect(link.isTextContainer).toBe(false);
  expect(link.computed.borderBottomWidth).toBe('1px');
  expect(link.computed.borderBottomStyle).toBe('solid');
  expect(link.computed.borderBottomColor).toBe('rgba(245, 242, 237, 0.4)');
}, 30000);
