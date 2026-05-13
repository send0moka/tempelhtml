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
