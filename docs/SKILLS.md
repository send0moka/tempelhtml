# Morphus Project Context

## What This Project Does

Morphus converts HTML/CSS pages into Figma designs through a deterministic local pipeline.

**Input:** HTML file or pasted HTML
**Output:** JSON snapshot that the Figma plugin uses to build the page

---

## Architecture at a Glance

```
HTML
  -> Playwright render
  -> computed styles + bounding boxes
  -> CSS -> Figma mapping
  -> z-index sorting
  -> JSON snapshot
  -> Figma plugin builds nodes
```

---

## File Map

| File | Purpose |
|---|---|
| `scripts/convert.js` | CLI entry for file conversion |
| `scripts/server.js` | Local HTTP bridge used by the plugin |
| `src/core/extractor.js` | Playwright render and DOM extraction |
| `src/core/dom-tree.js` | DOM tree helpers |
| `src/figma/css-to-figma.js` | CSS -> Figma property mapper |
| `src/figma/font-resolver.js` | Font fallback and style matching |
| `src/figma/z-index-sorter.js` | Stacking order normalization |
| `src/figma/mapper.js` | Final Figma tree assembly |
| `src/pipeline/convert.js` | Shared conversion pipeline |
| `src/utils/color.js` | Color helpers |
| `src/utils/units.js` | Unit parsing helpers |
| `figma-plugin/code.js` | Figma plugin main thread |
| `figma-plugin/ui.html` | Plugin UI |
| `figma-plugin/manifest.json` | Figma plugin manifest |

---

## Key Design Decisions

### Why Playwright?
It resolves the rendered layout so the pipeline can rely on computed pixels instead of reimplementing CSS math.

### Why a Local Server?
The plugin runs inside Figma's sandbox, so the browser UI talks to a local Node process for conversion.

### Why a JSON Snapshot?
It keeps the pipeline inspectable, testable, and easy to replay.

---

## CSS -> Figma Mapping Reference

### Layout
| CSS | Figma |
|---|---|
| `display: flex; flex-direction: row` | `layoutMode = "HORIZONTAL"` |
| `display: flex; flex-direction: column` | `layoutMode = "VERTICAL"` |
| `justify-content: center` | `primaryAxisAlignItems = "CENTER"` |
| `align-items: center` | `counterAxisAlignItems = "CENTER"` |
| `gap: 20px` | `itemSpacing = 20` |
| `overflow: hidden` | `clipsContent = true` |
| `position: absolute` | `layoutPositioning = "ABSOLUTE"` |

### Typography
| CSS | Figma |
|---|---|
| `font-weight: 900` | `style = "Black"` |
| `font-style: italic` | `style = "Italic"` |
| `letter-spacing: 0.12em` | pixel letter spacing |
| `text-transform: uppercase` | `textCase = "UPPER"` |

### Color
| CSS | Figma |
|---|---|
| `#c9a84c` | solid RGB paint |
| `rgba(201,168,76,0.3)` | solid RGB paint with opacity |
| `linear-gradient(...)` | gradient paint |

---

## What Still Needs Care

- `clip-path`
- complex CSS Grid
- multi-page layouts
- font download fallback
- watch mode
