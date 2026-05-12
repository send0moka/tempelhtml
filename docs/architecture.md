# Architecture

## Overview

tempelhtml is a two-process system:

1. **Node.js pipeline** (`scripts/convert.js`) — runs on your machine, uses Playwright + Claude API
2. **Figma Plugin** (`figma-plugin/`) — runs inside Figma's sandbox, receives JSON from step 1

These two communicate via a JSON file (the "intermediate representation").

---

## Intermediate Representation Format

The JSON file written by the Node.js pipeline and read by the Figma plugin:

```json
{
  "version": "0.1.0",
  "meta": {
    "source": "./examples/vela.html",
    "viewport": { "width": 1440, "height": 900 }
  },
  "figmaTree": [
    {
      "id": "body-el-abc1",
      "name": "body",
      "type": "FRAME",
      "x": 0,
      "y": 0,
      "width": 1440,
      "height": 5200,
      "fills": [{ "type": "SOLID", "color": { "r": 0.05, "g": 0.047, "b": 0.039 } }],
      "paddingTop": 0,
      "layoutMode": "VERTICAL",
      "children": [...]
    },
    {
      "id": "pseudo-grain-overlay",
      "name": "[pseudo] grain overlay",
      "type": "FRAME",
      "_isPseudo": true,
      "_pseudoPosition": "fixed",
      "x": 0, "y": 0,
      "width": 1440, "height": 900,
      "opacity": 0.6
    }
  ],
  "hoverSpecs": {
    ".btn-primary": {
      "componentName": "Button/Primary",
      "variants": [
        { "name": "State=Default", "properties": { "fills": [{"type":"SOLID","hex":"#c9a84c"}] } },
        { "name": "State=Hover", "properties": { "fills": [{"type":"SOLID","hex":"#e8c97a"}], "transform": {"translateY": -2} } }
      ],
      "transition": { "durationMs": 300, "easing": "ease-out" }
    }
  }
}
```

### FigmaNode Schema
```typescript
type FigmaNode = {
  id: string;
  name: string;
  type: "FRAME" | "TEXT";
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;

  // FRAME only
  fills?: Paint[];
  strokes?: Paint[];
  strokeWeight?: number;
  strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER";
  effects?: Effect[];
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  layoutMode?: "HORIZONTAL" | "VERTICAL" | "NONE";
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "STRETCH" | "BASELINE";
  itemSpacing?: number;
  layoutPositioning?: "AUTO" | "ABSOLUTE";
  clipsContent?: boolean;
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomRightRadius?: number;
  bottomLeftRadius?: number;
  blendMode?: string;
  children?: FigmaNode[];

  // TEXT only
  characters?: string;
  fontName?: { family: string; style: string };
  fontSize?: number;
  lineHeight?: { value: number; unit: "PERCENT" | "PIXELS" | "AUTO" };
  letterSpacing?: { value: number; unit: "PIXELS" };
  textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  textCase?: "ORIGINAL" | "UPPER" | "LOWER" | "TITLE";

  // AI-generated (used by plugin)
  _gridStrategy?: object;
  _hoverSpec?: object;
  _isPseudo?: boolean;
  _pseudoType?: string;
  _pseudoPosition?: string;
};
```

---

## Node.js Pipeline — Module Dependencies

```
convert.js
├── core/extractor.js
│   ├── core/screenshot.js
│   └── core/dom-tree.js (walkDOMInBrowser, serialized into browser)
├── ai/pseudo-detector.js        (Anthropic SDK: Vision)
├── ai/grid-resolver.js          (Anthropic SDK: LLM)
│   └── core/dom-tree.js         (findGridNodes)
├── ai/hover-analyzer.js         (Anthropic SDK: LLM)
├── figma/font-resolver.js
│   ├── core/dom-tree.js         (walk)
│   └── utils/units.js           (WEIGHT_MAP)
├── figma/z-index-sorter.js
│   └── core/dom-tree.js         (walk)
└── figma/mapper.js
    ├── figma/css-to-figma.js
    │   ├── utils/color.js
    │   └── utils/units.js
    └── utils/color.js
```

---

## Figma Plugin — Execution Flow

```
User pastes JSON → clicks "Build in Figma"
  ↓
ui.html: postMessage({ type: "BUILD", data })
  ↓
code.js: figma.ui.onmessage
  ↓
preloadFonts(figmaTree)
  → figma.loadFontAsync() for every unique fontName in tree
  ↓
for each node in figmaTree:
  buildNode(spec)
    if type === "TEXT" → buildTextNode()
    if type === "FRAME" → buildFrameNode()
      apply: resize, fills, padding, layout, radius, strokes, effects
      if _gridStrategy: applyGridStrategy()
      if _hoverSpec: buildComponentWithVariants()
      recurse children
  ↓
page.appendChild(node)
  ↓
layoutTopLevelNodes() — space out root-level frames
  ↓
postMessage({ type: "DONE", nodeCount })
```

---

## Key Constraints

### Figma Plugin Sandbox
- No `fetch()` to external URLs
- No Node.js APIs (`fs`, `path`, `process`)
- No `import` statements — must be a single bundled file or use `figma.loadFontAsync` etc.
- Async/await is supported
- `figma.createImageAsync()` requires a `Uint8Array` of image bytes

### Playwright in Node.js
- Must be run headless (`chromium.launch()`)
- Page functions passed to `page.evaluate()` must be **serializable** (no closure over Node.js scope)
- `page.addStyleTag()` returns an element handle; remove it after use to avoid contaminating computed styles

### Claude API Model
- Use `claude-sonnet-4-20250514` for both Vision and LLM calls
- Vision: pass images as `base64` with `media_type: "image/png"`
- Always prompt for pure JSON output (no markdown fences) to simplify parsing
- Always wrap `JSON.parse()` in try/catch — LLM can fail to produce valid JSON

---

## Future Work / TODOs

- [ ] `clip-path` → rasterize element to image fill
- [ ] `mix-blend-mode` → Figma blend modes (most common ones work, exotic ones need fallback)  
- [ ] QA visual diff step (step 7) — compare Figma export PNG vs original HTML screenshot
- [ ] CSS Grid `grid-template-areas` → AI-resolved absolute positioning with semantic names
- [ ] Multi-page support (scroll sections → separate Figma frames)
- [ ] Font download: if font not in Figma, download from Google Fonts and inject via `figma.createFontAsync`
- [ ] CLI flag `--qa` to run the visual diff QA step
- [ ] Watch mode: `--watch` to re-convert on HTML file save
