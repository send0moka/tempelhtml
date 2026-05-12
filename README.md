# tempelhtml

> **HTML → Figma converter** — pipeline hybrid deterministic + AI untuk konversi 1:1

Converts any HTML/CSS page into a Figma file using a two-stage pipeline:
1. **Headless render** (Playwright) — resolves all computed styles, clamp(), vw/%, animations
2. **Figma Plugin API** — builds the node tree with accurate layout, typography, effects

Gap-gap yang tidak bisa dipetakan 1:1 oleh aturan deterministik ditangani oleh AI:
- `::before` / `::after` → Computer Vision (screenshot diff)
- CSS Grid kompleks → LLM (layout architect)
- Animasi & hover states → LLM (variant spec generator)

---

## Quickstart

```bash
npm install
npx playwright install chromium
npm run convert -- --input ./examples/vela.html --output ./out/vela.json
```

Lalu di Figma: **Plugins → tempelhtml** → load `out/vela.json` → Run.

---

## Project Structure

```
tempelhtml/
├── src/
│   ├── core/
│   │   ├── extractor.js        # Playwright: computed styles + BoundingClientRect
│   │   ├── dom-tree.js         # Walk DOM → intermediate JSON tree
│   │   └── screenshot.js       # Playwright screenshot utilities
│   ├── ai/
│   │   ├── pseudo-detector.js  # CV: screenshot diff → detect ::before/::after
│   │   ├── grid-resolver.js    # LLM: CSS grid → Figma Auto Layout strategy
│   │   └── hover-analyzer.js   # LLM: hover/transition → Figma Variant spec
│   ├── figma/
│   │   ├── mapper.js           # Intermediate tree → Figma Plugin API calls
│   │   ├── css-to-figma.js     # CSS property mapper (the deterministic core)
│   │   ├── font-resolver.js    # font-weight number → Figma style name + fallback
│   │   └── z-index-sorter.js   # CSS z-index → Figma layer order
│   └── utils/
│       ├── color.js            # hex/rgba → Figma RGB (0-1)
│       └── units.js            # em, %, vw → px conversion helpers
├── figma-plugin/
│   ├── manifest.json
│   ├── ui.html
│   └── code.js                 # Figma Plugin entry — receives JSON, builds nodes
├── docs/
│   ├── SKILLS.md               # Skill map & context (for AI-assisted development)
│   ├── css-figma-mapping.md    # CSS → Figma property reference
│   ├── ai-backup-approach.md   # AI strategy untuk 3 gap utama
│   └── architecture.md        # Full pipeline diagram & decisions
├── scripts/
│   └── convert.js              # CLI entry point
├── tests/
│   └── vela/                   # Test case: VELA landing page
│       ├── input.html
│       └── expected-snapshot.json
├── package.json
└── .env.example
```

---

## Architecture

```
HTML input
    │
    ▼
[1] Playwright render
    getComputedStyle() + getBoundingClientRect()
    force-reveal all animations (.reveal.visible)
    → intermediate DOM tree JSON
    │
    ▼
[2] Screenshot diff (Computer Vision)
    with pseudo vs without pseudo screenshot
    → detect ::before / ::after bounding boxes
    │
    ▼
[3] LLM: Grid resolver
    CSS grid rules → Figma Auto Layout nesting strategy
    (called once per unique grid pattern, not per element)
    │
    ▼
[4] LLM: Hover analyzer
    all CSS :hover + transition rules
    → Figma Component Variant specs
    │
    ▼
[5] Font resolver
    font-weight number → Figma style name
    fallback chain: primary → Regular → Inter
    │
    ▼
[6] Figma Plugin
    reads intermediate JSON
    calls figma.createFrame(), createText(), etc.
    applies z-index ordering
    │
    ▼
[7] QA visual diff (Computer Vision)
    screenshot Figma export vs HTML original
    → similarity score + discrepancy list
```

---

## Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Known Limitations

| CSS Feature | Figma Support | Workaround |
|---|---|---|
| CSS Grid (span, areas) | Partial | LLM → nested Auto Layout frames |
| `::before` / `::after` | None (not in DOM) | CV screenshot diff |
| Animations (keyframes) | None | Static final-state snapshot |
| Hover states | None (static) | Figma Component Variants |
| `mix-blend-mode` | Partial | Figma blend modes (most supported) |
| `clip-path` | None | Rasterize to image |
| CSS variables | Resolved | getComputedStyle resolves all vars |
