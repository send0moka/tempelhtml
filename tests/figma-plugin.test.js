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
  return {
    page,
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
      async listAvailableFontsAsync() {
        return [];
      },
      async loadFontAsync() {},
      async getLocalPaintStylesAsync() {
        return [];
      },
      async getLocalTextStylesAsync() {
        return [];
      },
      createPaintStyle() {
        return { id: 'paint-style', name: '', paints: [], description: '' };
      },
      createTextStyle() {
        return { id: 'text-style', name: '', description: '' };
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
    ],
  });

  const initials = page.children[0].children[0];
  const role = page.children[1].children[0];
  const centeredBoxText = page.children[2];

  expect(initials.textAutoResize).toBe('WIDTH_AND_HEIGHT');
  expect(role.textAutoResize).toBe('WIDTH_AND_HEIGHT');
  expect(centeredBoxText.textAutoResize).toBe('HEIGHT');
  expect(centeredBoxText.width).toBe(800);
});
