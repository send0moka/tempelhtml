import { buildFigmaTree } from '../src/figma/mapper.js';

function baseComputed(overrides = {}) {
  return {
    display: 'block',
    position: 'static',
    zIndex: 'auto',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    flexWrap: 'nowrap',
    gap: '0px',
    columnGap: '0px',
    rowGap: '0px',
    gridTemplateColumns: 'none',
    gridTemplateRows: 'none',
    gridRow: 'auto',
    gridColumn: 'auto',
    width: '0px',
    height: '0px',
    minWidth: '0px',
    maxWidth: 'none',
    minHeight: '0px',
    paddingTop: '0px',
    paddingRight: '0px',
    paddingBottom: '0px',
    paddingLeft: '0px',
    marginTop: '0px',
    marginRight: '0px',
    marginBottom: '0px',
    marginLeft: '0px',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    backgroundImage: 'none',
    backgroundSize: 'auto',
    backgroundPosition: '0% 0%',
    color: 'rgb(0, 0, 0)',
    opacity: '1',
    borderRadius: '0px',
    borderTopLeftRadius: '0px',
    borderTopRightRadius: '0px',
    borderBottomRightRadius: '0px',
    borderBottomLeftRadius: '0px',
    border: '0px none rgba(0, 0, 0, 0)',
    borderWidth: '0px',
    borderColor: 'rgba(0, 0, 0, 0)',
    borderStyle: 'none',
    boxShadow: 'none',
    overflow: 'visible',
    overflowX: 'visible',
    overflowY: 'visible',
    mixBlendMode: 'normal',
    transform: 'none',
    fontFamily: 'Inter',
    fontSize: '16px',
    fontWeight: '400',
    fontStyle: 'normal',
    lineHeight: 'normal',
    letterSpacing: 'normal',
    textAlign: 'left',
    textTransform: 'none',
    whiteSpace: 'normal',
    textDecoration: 'none',
    webkitTextStrokeWidth: '0px',
    webkitTextStrokeColor: 'rgba(0, 0, 0, 0)',
    top: 'auto',
    right: 'auto',
    bottom: 'auto',
    left: 'auto',
    inset: 'auto',
    content: 'none',
    ...overrides,
  };
}

function frameNode({ tag = 'div', classList = [], rect, computed = {}, children = [], effectiveZ = 0 }) {
  return {
    tag,
    id: null,
    classList,
    text: null,
    textRuns: [],
    isTextContainer: false,
    rect,
    computed: baseComputed(computed),
    pseudo: { before: null, after: null },
    children,
    effectiveZ,
  };
}

test('groups top-level fixed bars into a header frame', () => {
  const nav = frameNode({
    tag: 'nav',
    rect: { x: 0, y: 0, width: 1440, height: 92 },
    computed: { position: 'fixed', display: 'flex' },
    effectiveZ: 100,
  });
  const hero = frameNode({
    tag: 'section',
    classList: ['hero'],
    rect: { x: 0, y: 0, width: 1440, height: 900 },
  });
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 1440, height: 900 },
    children: [nav, hero],
  });

  const [tree] = buildFigmaTree({ annotated: body });

  expect(tree._pageLayout).toBe(true);
  expect(tree.children[0].name).toBe('header');
  expect(tree.children[0]._role).toBe('header');
  expect(tree.children[0].children[0].name).toBe('nav');
  expect(tree.children[1].name).toBe('section.hero');
});

test('keeps margin-driven flex stacks out of auto-layout', () => {
  const heroLeft = frameNode({
    tag: 'div',
    classList: ['hero-left'],
    rect: { x: 0, y: 0, width: 720, height: 900 },
    computed: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      paddingTop: '160px',
      paddingRight: '60px',
      paddingBottom: '80px',
      paddingLeft: '60px',
    },
    children: [
      frameNode({
        tag: 'p',
        rect: { x: 60, y: 236, width: 200, height: 14 },
        computed: { marginBottom: '32px' },
      }),
      frameNode({
        tag: 'h1',
        rect: { x: 60, y: 282, width: 600, height: 246 },
        computed: { marginBottom: '8px' },
      }),
      frameNode({
        tag: 'p',
        rect: { x: 60, y: 572, width: 360, height: 76 },
        computed: { marginTop: '36px', marginBottom: '48px' },
      }),
      frameNode({
        tag: 'div',
        rect: { x: 60, y: 695, width: 240, height: 49 },
      }),
    ],
  });
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 1440, height: 900 },
    children: [heroLeft],
  });

  const [tree] = buildFigmaTree({ annotated: body });

  expect(tree.children[0].layoutMode).toBeUndefined();
  expect(tree.children[0].children[1].y).toBe(282);
  expect(tree.children[0].children[3].y).toBe(695);
});

test('skips auto-layout grid strategy for complex two-dimensional grids', () => {
  const workGrid = frameNode({
    tag: 'div',
    classList: ['work-grid'],
    rect: { x: 60, y: 2200, width: 1320, height: 810 },
    computed: {
      display: 'grid',
      gridTemplateColumns: '1.6fr 1fr',
      gridTemplateRows: '1fr 1fr',
    },
    children: [
      frameNode({
        rect: { x: 60, y: 2200, width: 810, height: 810 },
      }),
      frameNode({
        rect: { x: 874, y: 2200, width: 506, height: 404 },
      }),
      frameNode({
        rect: { x: 874, y: 2608, width: 506, height: 402 },
      }),
    ],
  });
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 1440, height: 3200 },
    children: [workGrid],
  });

  const [tree] = buildFigmaTree(
    { annotated: body },
    {
      gridStrategies: {
        '.work-grid': {
          outerFrame: {
            layoutMode: 'VERTICAL',
            primaryAxisSizingMode: 'FIXED',
            counterAxisSizingMode: 'FIXED',
            itemSpacing: 24,
          },
          notes: 'deterministic fallback guessed a vertical stack',
        },
      },
    }
  );

  expect(tree.children[0].name).toBe('div.work-grid');
  expect(tree.children[0]._gridStrategy).toBeUndefined();
  expect(tree.children[0].layoutMode).toBeUndefined();
});

test('assigns a fallback font to pseudo text content', () => {
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 1440, height: 900 },
    children: [],
  });

  const [tree] = buildFigmaTree(
    { annotated: body },
    {
      pseudoElements: [
        {
          name: 'decorative quote',
          type: 'text',
          x: 40,
          y: 32,
          width: 120,
          height: 120,
          fillColor: 'rgba(255, 255, 255, 0.4)',
          opacity: 1,
          content: '"',
          position: 'absolute',
          zOrder: 'top',
        },
      ],
    }
  );

  expect(tree.children[0].children[0].fontName).toEqual({
    family: 'Inter',
    style: 'Regular',
  });
});
