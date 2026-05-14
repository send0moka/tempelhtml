# CSS -> Figma Property Mapping Reference

This guide summarizes the deterministic CSS-to-Figma mapping used by the pipeline.

---

## Layout

### Flexbox -> Auto Layout

```js
frame.layoutMode = "HORIZONTAL"; // display: flex
frame.primaryAxisAlignItems = "MIN"; // justify-content: flex-start
frame.primaryAxisAlignItems = "CENTER"; // justify-content: center
frame.primaryAxisAlignItems = "MAX"; // justify-content: flex-end
frame.counterAxisAlignItems = "MIN"; // align-items: flex-start
frame.counterAxisAlignItems = "CENTER"; // align-items: center
frame.counterAxisAlignItems = "MAX"; // align-items: flex-end
frame.itemSpacing = 20; // gap: 20px
```

### Grid

Simple grids can be approximated with auto layout. More complex grids still fall back to absolute positioning or nested frames.

```js
// grid-template-columns: 1.6fr 1fr
// outer horizontal frame with proportional children
child1.layoutGrow = 1.6;
child2.layoutGrow = 1;
```

### Sizing and Positioning

```js
frame.resize(rect.width, rect.height);
frame.paddingTop = 52;
frame.paddingRight = 44;
frame.paddingBottom = 52;
frame.paddingLeft = 44;

node.layoutPositioning = "ABSOLUTE";
node.x = rect.x - parentRect.x;
node.y = rect.y - parentRect.y;
```

---

## Typography

```js
text.fontName = { family: "Playfair Display", style: "Black" };
text.fontSize = 88;
text.lineHeight = { value: 95, unit: "PERCENT" };
text.letterSpacing = { value: 1.56, unit: "PIXELS" };
text.textCase = "UPPER";
text.textAlignHorizontal = "CENTER";
```

### Outline text

```js
text.fills = [];
text.strokes = [{ type: "SOLID", color: { r: 0.35, g: 0.34, b: 0.28 } }];
text.strokeWeight = 1;
text.strokeAlign = "OUTSIDE";
```

---

## Color and Fills

### Solid fill

```js
frame.fills = [{ type: "SOLID", color: { r: 0.79, g: 0.66, b: 0.30 } }];
```

### Linear gradient

```js
frame.fills = [{
  type: "GRADIENT_LINEAR",
  gradientTransform: [[0, 1, 0], [-1, 0, 1]],
  gradientStops: [
    { position: 0, color: { r: 0.05, g: 0.05, b: 0.04, a: 0.95 } },
    { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } }
  ]
}];
```

### Multiple backgrounds

```js
frame.fills = [gradient1Paint, gradient2Paint, solidBgPaint];
```

---

## Borders and Effects

```js
frame.strokes = [{ type: "SOLID", color: { r: 0.79, g: 0.66, b: 0.30 }, opacity: 0.2 }];
frame.strokeWeight = 1;
frame.strokeAlign = "INSIDE";

frame.effects = [{
  type: "DROP_SHADOW",
  color: { r: 0.79, g: 0.66, b: 0.30, a: 0.3 },
  offset: { x: 0, y: 0 },
  radius: 30,
  spread: 10,
  visible: true,
  blendMode: "NORMAL"
}];
```

### Overflow and radius

```js
frame.clipsContent = true;
frame.cornerRadius = 12;
frame.topLeftRadius = 12;
frame.topRightRadius = 12;
frame.bottomRightRadius = 4;
frame.bottomLeftRadius = 4;
```

---

## Pseudo Elements

`::before` and `::after` are approximated when their computed styles and bounds can be derived. Decorative cases that cannot be mapped cleanly should be checked with the benchmark tool.

---

## Z-Index

Figma layer order is bottom-to-top, so the pipeline sorts nodes in ascending stacking order before building the tree.

---

## What Still Needs Care

- `clip-path`
- complex CSS Grid
- multi-page layouts
- font download fallback
- watch mode
