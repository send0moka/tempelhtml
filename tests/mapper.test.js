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

function frameNode({ tag = 'div', classList = [], rect, computed = {}, children = [], pseudo = { before: null, after: null }, effectiveZ = 0 }) {
  return {
    tag,
    id: null,
    classList,
    text: null,
    textRuns: [],
    isTextContainer: false,
    rect,
    computed: baseComputed(computed),
    pseudo,
    children,
    effectiveZ,
  };
}

function textContainerNode({ tag = 'div', classList = [], text, rect, computed = {}, textRuns = [] }) {
  return {
    tag,
    id: null,
    classList,
    text,
    textRuns,
    isTextContainer: true,
    rect,
    computed: baseComputed(computed),
    pseudo: { before: null, after: null },
    children: [],
    effectiveZ: 0,
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

test('merges full-cover negative z pseudo backgrounds into the parent fill', () => {
  const nav = frameNode({
    tag: 'nav',
    rect: { x: 0, y: 0, width: 300, height: 60 },
    pseudo: {
      before: null,
      after: {
        name: 'nav::after',
        type: 'box',
        content: null,
        rect: { x: 0, y: 0, width: 300, height: 60 },
        fillColor: 'rgb(13, 12, 10)',
        opacity: 1,
        position: 'absolute',
        zOrder: 'bottom',
        computed: baseComputed({
          position: 'absolute',
          zIndex: '-1',
          width: '300px',
          height: '60px',
          backgroundImage: 'linear-gradient(to bottom, rgb(13, 12, 10) 0%, rgba(0, 0, 0, 0) 100%)',
        }),
      },
    },
  });
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 300, height: 60 },
    children: [nav],
  });

  const [tree] = buildFigmaTree({ annotated: body });
  const builtNav = tree.children[0];

  expect(builtNav.children.some((child) => child.name.includes('[pseudo]'))).toBe(false);
  expect(builtNav.fills[0].type).toBe('GRADIENT_LINEAR');
});

test('maps centered flex text containers to centered Figma text alignment', () => {
  const accent = textContainerNode({
    classList: ['work-accent'],
    text: 'NOVA',
    rect: { x: 0, y: 0, width: 810, height: 810 },
    computed: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'Bebas Neue',
      fontSize: '120px',
    },
    textRuns: [{
      text: 'NOVA',
      lineIndex: 0,
      computed: baseComputed({
        fontFamily: 'Bebas Neue',
        fontSize: '120px',
      }),
    }],
  });
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 810, height: 810 },
    children: [accent],
  });

  const [tree] = buildFigmaTree({ annotated: body });
  const builtAccent = tree.children[0];

  expect(builtAccent.textAlignHorizontal).toBe('CENTER');
  expect(builtAccent.textAlignVertical).toBe('CENTER');
});

test('stretches ratio-based work visuals to the full card height', () => {
  const workAccent = textContainerNode({
    classList: ['work-accent'],
    text: 'FORM',
    rect: { x: 0, y: 0, width: 507, height: 329 },
    computed: {
      display: 'flex',
      position: 'absolute',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'Bebas Neue',
      fontSize: '120px',
      opacity: '0.04',
      left: '0px',
      right: '0px',
      top: '0px',
      bottom: '0px',
      inset: '0px',
    },
    textRuns: [{
      text: 'FORM',
      lineIndex: 0,
      computed: baseComputed({
        display: 'flex',
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'Bebas Neue',
        fontSize: '120px',
        opacity: '0.04',
      }),
    }],
  });

  const workBg = frameNode({
    tag: 'div',
    classList: ['work-bg', 'work-bg-2'],
    rect: { x: 0, y: 0, width: 507, height: 329 },
    computed: {
      position: 'absolute',
      top: '0px',
      right: '0px',
      bottom: '0px',
      left: '0px',
      inset: '0px',
      backgroundImage: 'linear-gradient(135deg, rgb(26, 21, 32) 0%, rgb(16, 13, 24) 50%, rgb(13, 12, 10) 100%)',
    },
    children: [workAccent],
  });

  const workTag = textContainerNode({
    classList: ['work-tag'],
    text: 'WEB DESIGN',
    rect: { x: 36, y: 253.25, width: 435, height: 13 },
    computed: {
      fontFamily: 'DM Sans',
      fontSize: '10px',
      letterSpacing: '2.5px',
      textTransform: 'uppercase',
    },
    textRuns: [{
      text: 'WEB DESIGN',
      lineIndex: 0,
      computed: baseComputed({
        fontFamily: 'DM Sans',
        fontSize: '10px',
        letterSpacing: '2.5px',
        textTransform: 'uppercase',
      }),
    }],
  });

  const workInfo = frameNode({
    tag: 'div',
    classList: ['work-info'],
    rect: { x: 0, y: 223.25, width: 507, height: 106 },
    computed: {
      position: 'absolute',
      top: '223.25px',
      right: '0px',
      bottom: '0px',
      left: '0px',
      inset: '223.25px 0px 0px',
      paddingTop: '30px',
      paddingRight: '36px',
      paddingBottom: '30px',
      paddingLeft: '36px',
      backgroundImage: 'linear-gradient(to top, rgba(13, 12, 10, 0.9) 0%, rgba(0, 0, 0, 0) 100%)',
    },
    children: [workTag],
  });

  const workVisual = frameNode({
    tag: 'div',
    classList: ['work-visual'],
    rect: { x: 0, y: 0, width: 507, height: 329 },
    computed: {
      position: 'relative',
      paddingBottom: '329.25px',
      overflow: 'hidden',
    },
    children: [workBg, workInfo],
  });

  const workCard = frameNode({
    tag: 'div',
    classList: ['work-card'],
    rect: { x: 0, y: 0, width: 507, height: 404 },
    computed: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: 'rgb(21, 20, 16)',
    },
    children: [workVisual],
  });

  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 507, height: 404 },
    children: [workCard],
  });

  const [tree] = buildFigmaTree({ annotated: body });
  const builtCard = tree.children[0];
  const builtVisual = builtCard.children[0];
  const builtBg = builtVisual.children[0];
  const builtInfo = builtVisual.children[1];
  const builtTag = builtInfo.children[0];

  expect(builtVisual.height).toBe(404);
  expect(builtBg.height).toBe(404);
  expect(builtInfo.y).toBe(298);
  expect(builtTag.y).toBe(30);
});
