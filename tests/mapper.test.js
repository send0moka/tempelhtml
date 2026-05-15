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
    flexGrow: '0',
    flexShrink: '1',
    flexBasis: 'auto',
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
    objectFit: 'fill',
    objectPosition: '50% 50%',
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
    borderTopWidth: '0px',
    borderRightWidth: '0px',
    borderBottomWidth: '0px',
    borderLeftWidth: '0px',
    borderTopColor: 'rgba(0, 0, 0, 0)',
    borderRightColor: 'rgba(0, 0, 0, 0)',
    borderBottomColor: 'rgba(0, 0, 0, 0)',
    borderLeftColor: 'rgba(0, 0, 0, 0)',
    borderTopStyle: 'none',
    borderRightStyle: 'none',
    borderBottomStyle: 'none',
    borderLeftStyle: 'none',
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

function frameNode({ tag = 'div', classList = [], rect, computed = {}, children = [], pseudo = { before: null, after: null }, effectiveZ = 0, svgMarkup = null, formControl = null, imageData = null }) {
  return {
    tag,
    id: null,
    classList,
    text: null,
    textRuns: [],
    isTextContainer: false,
    rect,
    computed: baseComputed(computed),
    ...(formControl ? { formControl } : {}),
    ...(svgMarkup ? { svgMarkup } : {}),
    ...(imageData ? { imageData } : {}),
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
  expect(tree.clipsContent).toBe(true);
  expect(tree.children[0].name).toBe('section.hero');
  expect(tree.children[1].name).toBe('header');
  expect(tree.children[1]._role).toBe('header');
  expect(tree.children[1].children[0].name).toBe('nav');
});

test('keeps original flex stacks as flow auto-layout without forcing children absolute', () => {
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

  expect(tree.children[0].layoutMode).toBe('VERTICAL');
  expect(tree.children[0].primaryAxisSizingMode).toBe('FIXED');
  expect(tree.children[0].counterAxisSizingMode).toBe('FIXED');
  expect(tree.children[0].children[0].layoutPositioning).toBeUndefined();
  expect(tree.children[0].itemSpacing).toBe(32);
  expect(tree.children[0].children[1].y).toBe(282);
  expect(tree.children[0].children[3].y).toBe(695);
});

test('marks flex children that fill the parent counter axis as fill sizing', () => {
  const cardHeader = frameNode({
    tag: 'div',
    classList: ['card-header'],
    rect: { x: 24, y: 24, width: 552, height: 23 },
    computed: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    children: [
      textContainerNode({
        tag: 'h3',
        classList: ['card-title'],
        text: 'Tetracare - Healthcare Service',
        rect: { x: 24, y: 24, width: 290, height: 23 },
      }),
      frameNode({
        tag: 'span',
        classList: ['badge'],
        rect: { x: 500, y: 24, width: 76, height: 23 },
      }),
    ],
  });
  const card = frameNode({
    tag: 'div',
    classList: ['card'],
    rect: { x: 0, y: 0, width: 600, height: 240 },
    computed: {
      display: 'flex',
      flexDirection: 'column',
      paddingTop: '24px',
      paddingRight: '24px',
      paddingBottom: '24px',
      paddingLeft: '24px',
    },
    children: [cardHeader],
  });
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 600, height: 240 },
    children: [card],
  });

  const [tree] = buildFigmaTree({ annotated: body });
  const builtHeader = tree.children[0].children[0];

  expect(builtHeader.layoutSizingHorizontal).toBe('FILL');
  expect(builtHeader.layoutMode).toBe('HORIZONTAL');
  expect(builtHeader.primaryAxisAlignItems).toBe('SPACE_BETWEEN');
  expect(builtHeader.primaryAxisSizingMode).toBe('FIXED');
  expect(builtHeader.counterAxisSizingMode).toBe('FIXED');
});

test('maps base64 img sources to image nodes', () => {
  const img = frameNode({
    tag: 'img',
    classList: ['avatar'],
    rect: { x: 12, y: 24, width: 80, height: 64 },
    computed: {
      objectFit: 'cover',
      borderTopLeftRadius: '12px',
      borderTopRightRadius: '12px',
      borderBottomRightRadius: '12px',
      borderBottomLeftRadius: '12px',
    },
    imageData: {
      src: 'data:image/png;base64,aGVsbG8=',
      alt: 'avatar',
      naturalWidth: 10,
      naturalHeight: 10,
    },
  });
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 120, height: 120 },
    children: [img],
  });

  const [tree] = buildFigmaTree({ annotated: body });
  const builtImg = tree.children[0];

  expect(builtImg.type).toBe('IMAGE');
  expect(builtImg.name).toBe('img.avatar');
  expect(builtImg._image.src).toBe('data:image/png;base64,aGVsbG8=');
  expect(builtImg._objectFit).toBe('cover');
  expect(builtImg.cornerRadius).toBe(12);
});

test('orders children by effective z-index for Figma layer stacking', () => {
  const low = frameNode({
    tag: 'div',
    classList: ['low'],
    rect: { x: 0, y: 0, width: 100, height: 100 },
    computed: {
      position: 'absolute',
      zIndex: '1',
    },
    effectiveZ: 1,
  });
  const high = frameNode({
    tag: 'div',
    classList: ['high'],
    rect: { x: 0, y: 0, width: 100, height: 100 },
    computed: {
      position: 'absolute',
      zIndex: '5',
    },
    effectiveZ: 5,
  });
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 100, height: 100 },
    children: [high, low],
  });

  const [tree] = buildFigmaTree({ annotated: body });

  expect(tree.children[0].name).toBe('div.low');
  expect(tree.children[1].name).toBe('div.high');
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

test('preserves inline SVG markup as a single SVG node', () => {
  const svgMarkup = '<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg"><path d="M40 80 L80 40" stroke="#2B2220" fill="none"/></svg>';
  const svg = frameNode({
    tag: 'svg',
    classList: ['collar-illustration'],
    rect: { x: 100, y: 120, width: 366, height: 403 },
    computed: { opacity: '0.15' },
    svgMarkup,
    children: [
      frameNode({
        tag: 'path',
        rect: { x: 160, y: 180, width: 40, height: 40 },
      }),
    ],
  });
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 800, height: 600 },
    children: [svg],
  });

  const [tree] = buildFigmaTree({ annotated: body });
  const builtSvg = tree.children[0];

  expect(builtSvg.type).toBe('SVG');
  expect(builtSvg.name).toBe('svg.collar-illustration');
  expect(builtSvg._svgMarkup).toBe(svgMarkup);
  expect(builtSvg.width).toBe(366);
  expect(builtSvg.height).toBe(403);
  expect(builtSvg.opacity).toBe(0.15);
  expect(builtSvg.children).toBeUndefined();
});

test('maps one-sided css borders to individual Figma stroke weights', () => {
  const link = frameNode({
    tag: 'a',
    classList: ['editorial-link'],
    rect: { x: 0, y: 0, width: 120, height: 18 },
    computed: {
      borderWidth: '0px 0px 1px',
      borderColor: 'rgb(245, 242, 237) rgb(245, 242, 237) rgba(245, 242, 237, 0.4)',
      borderStyle: 'none none solid',
      borderBottomWidth: '1px',
      borderBottomColor: 'rgba(245, 242, 237, 0.4)',
      borderBottomStyle: 'solid',
    },
  });
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 300, height: 120 },
    children: [link],
  });

  const [tree] = buildFigmaTree({ annotated: body });
  const builtLink = tree.children[0];

  expect(builtLink.strokes).toHaveLength(1);
  expect(builtLink.strokeTopWeight).toBe(0);
  expect(builtLink.strokeRightWeight).toBe(0);
  expect(builtLink.strokeBottomWeight).toBe(1);
  expect(builtLink.strokeLeftWeight).toBe(0);
  expect(builtLink.strokes[0].opacity).toBeCloseTo(0.4, 2);
});

test('maps inline-block text wrappers to horizontal auto layout', () => {
  const link = frameNode({
    tag: 'a',
    classList: ['editorial-link'],
    rect: { x: 0, y: 0, width: 119, height: 18 },
    computed: {
      display: 'inline-block',
      paddingBottom: '2px',
      borderWidth: '0px 0px 1px',
      borderColor: 'rgb(245, 242, 237) rgb(245, 242, 237) rgba(245, 242, 237, 0.4)',
      borderStyle: 'none none solid',
      borderBottomWidth: '1px',
      borderBottomColor: 'rgba(245, 242, 237, 0.4)',
      borderBottomStyle: 'solid',
    },
    children: [
      textContainerNode({
        tag: 'span',
        text: 'Read Our Story',
        rect: { x: 0, y: 0, width: 119, height: 14 },
        computed: {
          fontFamily: 'Satoshi, sans-serif',
          fontSize: '10.88px',
          fontWeight: '500',
          letterSpacing: '1.9584px',
          textAlign: 'center',
          textTransform: 'uppercase',
        },
      }),
    ],
  });
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 300, height: 120 },
    children: [link],
  });

  const [tree] = buildFigmaTree({ annotated: body });
  const builtLink = tree.children[0];

  expect(builtLink.layoutMode).toBe('HORIZONTAL');
  expect(builtLink.primaryAxisAlignItems).toBe('MIN');
  expect(builtLink.counterAxisAlignItems).toBe('MIN');
  expect(builtLink.strokeBottomWeight).toBe(1);
  expect(builtLink.children).toHaveLength(1);
  expect(builtLink.children[0].type).toBe('TEXT');
});

test('maps form control placeholders into text nodes from extracted metadata', () => {
  const input = frameNode({
    tag: 'input',
    classList: ['cta-input'],
    rect: { x: 0, y: 0, width: 336, height: 49 },
    computed: {
      display: 'block',
      paddingTop: '16px',
      paddingRight: '20px',
      paddingBottom: '16px',
      paddingLeft: '20px',
      fontFamily: 'DM Sans',
      fontSize: '16px',
      fontWeight: '400',
      color: 'rgb(43, 34, 32)',
    },
    formControl: {
      type: 'email',
      value: '',
      placeholder: 'email@perusahaan.com',
      placeholderComputed: baseComputed({
        fontFamily: 'DM Sans',
        fontSize: '16px',
        fontWeight: '400',
        color: 'rgba(43, 34, 32, 0.42)',
      }),
    },
  });
  const body = frameNode({
    tag: 'body',
    rect: { x: 0, y: 0, width: 360, height: 120 },
    children: [input],
  });

  const [tree] = buildFigmaTree({ annotated: body });
  const builtInput = tree.children[0];
  const placeholder = builtInput.children[0];

  expect(builtInput.name).toBe('input.cta-input');
  expect(builtInput.children).toHaveLength(1);
  expect(placeholder.type).toBe('TEXT');
  expect(placeholder.name).toBe('input.cta-input / placeholder');
  expect(placeholder.characters).toBe('email@perusahaan.com');
  expect(placeholder.x).toBe(20);
  expect(placeholder.y).toBe(16);
  expect(placeholder.fills[0].opacity).toBeCloseTo(0.42, 2);
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
