import { resolveFonts } from '../src/figma/font-resolver.js';

function node(computed, children = []) {
  return { computed, children };
}

test('resolves unavailable named serif families through the CSS font stack', async () => {
  const domTree = node({}, [
    node({
      fontFamily: 'Marcellus, serif',
      fontWeight: '400',
      fontStyle: 'normal',
    }),
    node({
      fontFamily: 'Lora, serif',
      fontWeight: '400',
      fontStyle: 'italic',
    }),
    node({
      fontFamily: 'Brand Serif, "Playfair Display", serif',
      fontWeight: '700',
      fontStyle: 'normal',
    }),
    node({
      fontFamily: 'Some Sans, sans-serif',
      fontWeight: '400',
      fontStyle: 'normal',
    }),
  ]);

  const fontMap = await resolveFonts(domTree);

  expect(fontMap['Marcellus, serif|400|normal']).toEqual({
    family: 'Georgia',
    style: 'Regular',
  });
  expect(fontMap['Lora, serif|400|italic']).toEqual({
    family: 'Georgia',
    style: 'Italic',
  });
  expect(fontMap['Brand Serif, "Playfair Display", serif|700|normal']).toEqual({
    family: 'Playfair Display',
    style: 'Bold',
  });
  expect(fontMap['Some Sans, sans-serif|400|normal']).toEqual({
    family: 'Inter',
    style: 'Regular',
  });
});
