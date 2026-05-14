import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function makeNode(type) {
  return {
    type,
    name: '',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    children: [],
    fills: [],
    strokes: [],
    characters: '',
    strokeWeight: undefined,
    strokeAlign: undefined,
    strokeTopWeight: undefined,
    strokeRightWeight: undefined,
    strokeBottomWeight: undefined,
    strokeLeftWeight: undefined,
    appendChild(child) {
      this.children.push(child);
      child.parent = this;
    },
    resize(width, height) {
      this.width = width;
      this.height = height;
    },
    remove() {
      this.removed = true;
    },
    setRangeFontName() {},
    setRangeFontSize() {},
    setRangeFills() {},
    setRangeLineHeight() {},
    setRangeLetterSpacing() {},
    setRangeTextCase() {},
  };
}

function createFigmaMock() {
  const page = makeNode('PAGE');
  const paintStyles = [];
  const textStyles = [];
  return {
    page,
    paintStyles,
    textStyles,
    figma: {
      ui: {
        onmessage: null,
        postMessage() {},
      },
      currentPage: page,
      showUI() {},
      notify() {},
      createFrame() {
        return makeNode('FRAME');
      },
      createText() {
        return makeNode('TEXT');
      },
      createComponent() {
        return makeNode('COMPONENT');
      },
      createNodeFromSvg(svg) {
        const node = makeNode('FRAME');
        node.svgMarkup = svg;
        return node;
      },
      async listAvailableFontsAsync() {
        return [];
      },
      async loadFontAsync() {},
      async getLocalPaintStylesAsync() {
        return paintStyles;
      },
      async getLocalTextStylesAsync() {
        return textStyles;
      },
      createPaintStyle() {
        return {
          id: `paint-style-${paintStyles.length + 1}`,
          name: '',
          paints: [],
          description: '',
          remove() {
            this.removed = true;
          },
        };
      },
      createTextStyle() {
        return {
          id: `text-style-${textStyles.length + 1}`,
          name: '',
          description: '',
          remove() {
            this.removed = true;
          },
        };
      },
    },
  };
}

function frameSpec(name, overrides = {}) {
  return {
    name,
    type: 'FRAME',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    fills: [],
    strokes: [],
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    clipsContent: false,
    effects: [],
    children: [],
    ...overrides,
  };
}

function textSpec(name, overrides = {}) {
  return {
    name,
    type: 'TEXT',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    characters: '',
    fontName: { family: 'Inter', style: 'Regular' },
    fontSize: 16,
    lineHeight: { unit: 'AUTO' },
    textAlignHorizontal: 'LEFT',
    fills: [],
    ...overrides,
  };
}

test('fixes only the auto-layout axis that needs rendered free space', async () => {
  const { figma, page } = createFigmaMock();
  const context = {
    figma,
    __html__: '',
    console,
    fetch,
    setTimeout,
    Promise,
    TextEncoder,
  };
  vm.createContext(context);
  vm.runInContext(readFileSync('./figma-plugin/code.js', 'utf8'), context);

  const navLinks = frameSpec('ul.nav-links', {
    x: 893,
    y: 36,
    width: 487,
    height: 21,
    layoutMode: 'HORIZONTAL',
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    itemSpacing: 40,
    children: [
      frameSpec('li', { width: 66, height: 21 }),
      frameSpec('li', { width: 94, height: 21 }),
      frameSpec('li', { width: 54, height: 21 }),
      frameSpec('li', { width: 152, height: 21 }),
    ],
  });

  await context.buildFromSnapshot({
    figmaTree: [
      frameSpec('nav', {
        width: 1440,
        height: 93,
        paddingTop: 28,
        paddingRight: 60,
        paddingBottom: 28,
        paddingLeft: 60,
        layoutMode: 'HORIZONTAL',
        primaryAxisAlignItems: 'SPACE_BETWEEN',
        counterAxisAlignItems: 'CENTER',
        itemSpacing: 0,
        children: [
          frameSpec('a.logo', { width: 59, height: 37 }),
          navLinks,
        ],
      }),
    ],
  });

  const nav = page.children[0];
  const builtNavLinks = nav.children[1];

  expect(nav.primaryAxisSizingMode).toBe('FIXED');
  expect(nav.layoutSizingHorizontal).toBe('FIXED');
  expect(nav.counterAxisSizingMode).toBeUndefined();
  expect(builtNavLinks.primaryAxisSizingMode).toBeUndefined();
  expect(builtNavLinks.layoutSizingHorizontal).toBeUndefined();
});

test('uses width-and-height auto resize for explicit multiline text', async () => {
  const { figma, page } = createFigmaMock();
  const context = {
    figma,
    __html__: '',
    console,
    fetch,
    setTimeout,
    Promise,
    TextEncoder,
  };
  vm.createContext(context);
  vm.runInContext(readFileSync('./figma-plugin/code.js', 'utf8'), context);

  await context.buildFromSnapshot({
    figmaTree: [
      {
        name: 'h2.section-title',
        type: 'TEXT',
        x: 0,
        y: 0,
        width: 230,
        height: 123,
        characters: 'Layanan\nUnggulan',
        fontName: { family: 'Playfair Display', style: 'Bold' },
        fontSize: 56,
        fills: [],
      },
    ],
  });

  const title = page.children[0];
  expect(title.textAutoResize).toBe('WIDTH_AND_HEIGHT');
  expect(title.width).toBe(0);
});

test('keeps centered flex text boxes fixed so vertical middle alignment can apply', async () => {
  const { figma, page } = createFigmaMock();
  const context = {
    figma,
    __html__: '',
    console,
    fetch,
    setTimeout,
    Promise,
    TextEncoder,
  };
  vm.createContext(context);
  vm.runInContext(readFileSync('./figma-plugin/code.js', 'utf8'), context);

  await context.buildFromSnapshot({
    figmaTree: [
      {
        name: 'div.work-accent',
        type: 'TEXT',
        x: 0,
        y: 0,
        width: 810,
        height: 810,
        characters: 'NOVA',
        fontName: { family: 'Bebas Neue', style: 'Regular' },
        fontSize: 120,
        textAlignHorizontal: 'CENTER',
        textAlignVertical: 'CENTER',
        fills: [],
      },
    ],
  });

  const accent = page.children[0];
  expect(accent.textAutoResize).toBe('NONE');
  expect(accent.textAlignHorizontal).toBe('CENTER');
  expect(accent.textAlignVertical).toBe('CENTER');
});

test('auto-sizes rendered single-line text without class-specific widths', async () => {
  const { figma, page } = createFigmaMock();
  const context = {
    figma,
    __html__: '',
    console,
    fetch,
    setTimeout,
    Promise,
    TextEncoder,
  };
  vm.createContext(context);
  vm.runInContext(readFileSync('./figma-plugin/code.js', 'utf8'), context);

  await context.buildFromSnapshot({
    figmaTree: [
      frameSpec('div.author-avatar', {
        width: 46,
        height: 46,
        layoutMode: 'HORIZONTAL',
        primaryAxisAlignItems: 'CENTER',
        counterAxisAlignItems: 'CENTER',
        children: [
          textSpec('span', {
            width: 12,
            height: 21,
            characters: 'AR',
            textAlignHorizontal: 'CENTER',
          }),
        ],
      }),
      frameSpec('div.author-info', {
        width: 110,
        height: 16,
        children: [
          textSpec('div.author-role', {
            width: 110,
            height: 16,
            characters: 'CEO, Nusantara Collective',
            fontSize: 12,
          }),
        ],
      }),
      textSpec('div.testimonial-stars', {
        width: 800,
        height: 19,
        characters: '★★★★★',
        textAlignHorizontal: 'CENTER',
        fontSize: 14,
      }),
      textSpec('div.announcement span', {
        width: 510,
        height: 15,
        characters: 'COMPLIMENTARY SHIPPING ON ALL ORDERS - WORLDWIDE DELIVERY',
        textAlignHorizontal: 'CENTER',
        fontSize: 11.5,
        letterSpacing: { value: 3, unit: 'PIXELS' },
      }),
    ],
  });

  const initials = page.children[0].children[0];
  const role = page.children[1].children[0];
  const centeredBoxText = page.children[2];
  const announcement = page.children[3];

  expect(initials.textAutoResize).toBe('WIDTH_AND_HEIGHT');
  expect(role.textAutoResize).toBe('WIDTH_AND_HEIGHT');
  expect(centeredBoxText.textAutoResize).toBe('HEIGHT');
  expect(centeredBoxText.width).toBe(800);
  expect(announcement.textAutoResize).toBe('WIDTH_AND_HEIGHT');
});

test('creates local styles only for reusable values and prunes stale generated styles', async () => {
  const { figma, paintStyles, textStyles } = createFigmaMock();
  paintStyles.push(
    {
      id: 'stale-paint',
      name: 'TempelHTML / Color / Purple / 900 / OLD',
      paints: [],
      remove() {
        this.removed = true;
      },
    },
    {
      id: 'custom-paint',
      name: 'Brand / Color / Neutral / 50',
      paints: [],
      remove() {
        this.removed = true;
      },
    }
  );
  textStyles.push({
    id: 'stale-text',
    name: 'TempelHTML / Typography / Body / XS / Regular / OLD',
    remove() {
      this.removed = true;
    },
  });

  const context = {
    figma,
    __html__: '',
    console,
    fetch,
    setTimeout,
    Promise,
    TextEncoder,
  };
  vm.createContext(context);
  vm.runInContext(readFileSync('./figma-plugin/code.js', 'utf8'), context);

  const sharedFill = [{
    type: 'SOLID',
    color: { r: 0.96, g: 0.95, b: 0.93 },
    opacity: 1,
  }];
  const oneOffFill = [{
    type: 'SOLID',
    color: { r: 0.2, g: 0.1, b: 0.08 },
    opacity: 1,
  }];

  await context.buildFromSnapshot({
    figmaTree: [
      textSpec('p.first', {
        characters: 'Shared copy one',
        fontSize: 16,
        fills: sharedFill,
      }),
      textSpec('p.second', {
        characters: 'Shared copy two',
        fontSize: 16,
        fills: sharedFill,
      }),
      textSpec('h1.once', {
        characters: 'One off heading',
        fontSize: 48,
        fills: oneOffFill,
      }),
    ],
  });

  const activePaintStyles = paintStyles.filter((style) => !style.removed);
  const activeTextStyles = textStyles.filter((style) => !style.removed);
  const generatedPaintStyles = activePaintStyles.filter((style) => style.name.startsWith('TempelHTML / '));
  const generatedTextStyles = activeTextStyles.filter((style) => style.name.startsWith('TempelHTML / '));

  expect(paintStyles.find((style) => style.id === 'stale-paint').removed).toBe(true);
  expect(textStyles.find((style) => style.id === 'stale-text').removed).toBe(true);
  expect(paintStyles.find((style) => style.id === 'custom-paint').removed).toBeUndefined();

  expect(generatedPaintStyles).toHaveLength(1);
  expect(generatedPaintStyles[0].paints).toEqual(sharedFill);
  expect(generatedTextStyles).toHaveLength(1);
  expect(generatedTextStyles[0].fontSize).toBe(16);
});

test('imports inline SVG markup as a rendered Figma node', async () => {
  const { figma, page } = createFigmaMock();
  const context = {
    figma,
    __html__: '',
    console,
    fetch,
    setTimeout,
    Promise,
    TextEncoder,
  };
  vm.createContext(context);
  vm.runInContext(readFileSync('./figma-plugin/code.js', 'utf8'), context);

  await context.buildFromSnapshot({
    figmaTree: [
      {
        name: 'svg.collar-illustration',
        type: 'SVG',
        x: 12,
        y: 18,
        width: 366,
        height: 403,
        opacity: 0.15,
        _svgMarkup: '<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg"><path d="M40 80 L80 40" stroke="#2B2220" fill="none"/></svg>',
      },
    ],
  });

  const svg = page.children[0];
  expect(svg.name).toBe('svg.collar-illustration');
  expect(svg.svgMarkup).toContain('<path');
  expect(svg.x).toBe(12);
  expect(svg.y).toBe(18);
  expect(svg.width).toBe(366);
  expect(svg.height).toBe(403);
  expect(svg.opacity).toBe(0.15);
});

test('applies side-specific border weights for underline-like borders', async () => {
  const { figma, page } = createFigmaMock();
  const context = {
    figma,
    __html__: '',
    console,
    fetch,
    setTimeout,
    Promise,
    TextEncoder,
  };
  vm.createContext(context);
  vm.runInContext(readFileSync('./figma-plugin/code.js', 'utf8'), context);

  await context.buildFromSnapshot({
    figmaTree: [
      {
        name: 'a.editorial-link',
        type: 'FRAME',
        x: 0,
        y: 0,
        width: 120,
        height: 18,
        fills: [],
        strokes: [{
          type: 'SOLID',
          color: { r: 1, g: 1, b: 1 },
          opacity: 0.4,
        }],
        strokeWeight: 1,
        strokeAlign: 'INSIDE',
        strokeTopWeight: 0,
        strokeRightWeight: 0,
        strokeBottomWeight: 1,
        strokeLeftWeight: 0,
      },
    ],
  });

  const link = page.children[0];
  expect(link.strokeBottomWeight).toBe(1);
  expect(link.strokeTopWeight).toBe(0);
  expect(link.strokeRightWeight).toBe(0);
  expect(link.strokeLeftWeight).toBe(0);
});

test('extends page-layout height when fixed header content is offset down', async () => {
  const { figma, page } = createFigmaMock();
  const context = {
    figma,
    __html__: '',
    console,
    fetch,
    setTimeout,
    Promise,
    TextEncoder,
  };
  vm.createContext(context);
  vm.runInContext(readFileSync('./figma-plugin/code.js', 'utf8'), context);

  await context.buildFromSnapshot({
    figmaTree: [
      frameSpec('body', {
        width: 1440,
        height: 450,
        _pageLayout: true,
        clipsContent: true,
        children: [
          frameSpec('nav', {
            _role: 'header',
            x: 0,
            y: 0,
            width: 1440,
            height: 90,
            layoutMode: 'HORIZONTAL',
            primaryAxisAlignItems: 'SPACE_BETWEEN',
            counterAxisAlignItems: 'CENTER',
          }),
          frameSpec('section.hero', {
            x: 0,
            y: 0,
            width: 1440,
            height: 360,
          }),
          frameSpec('div.footer-bottom', {
            x: 0,
            y: 360,
            width: 1440,
            height: 90,
            layoutMode: 'HORIZONTAL',
            primaryAxisAlignItems: 'SPACE_BETWEEN',
            counterAxisAlignItems: 'CENTER',
          }),
        ],
      }),
    ],
  });

  const body = page.children[0];
  const footerBottom = body.children[2];

  expect(body.height).toBe(540);
  expect(body.clipsContent).toBe(true);
  expect(body.children[1].y).toBe(90);
  expect(footerBottom.y).toBe(450);
});
