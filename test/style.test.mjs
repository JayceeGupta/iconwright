import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStyle, formatStyle } from '../src/render.mjs';
import { parsePaint } from '../src/color.mjs';

test('style strings round trip and parse parenthesized colors and gradients', () => {
  const style = { color: 'white', bg: '#1DB954', shape: 'squircle', radius: 0.3, padding: 0.1, shadow: true };
  assert.deepEqual(parseStyle(formatStyle(style)), style);
  assert.deepEqual(parseStyle('bg=rgb(1, 2, 3) shape=circle'), { bg: 'rgb(1, 2, 3)', shape: 'circle' });
  for (const bg of ['linear-gradient(135deg, #f00, #00f)', 'linear-gradient(to right, #f00 10%, #00f 90%)']) {
    const paint = parsePaint(bg);
    assert.match(paint.fill, /url\(#bg\)/);
    assert.match(paint.defs, /<linearGradient/);
    assert.match(paint.defs, /<stop/);
  }
});

test('style parser reports unknown keys and invalid values clearly', () => {
  assert.throws(() => parseStyle('colour=red'), /unknown style key/);
  assert.throws(() => parseStyle('shape=octagon'), /shape must be one of/);
  assert.throws(() => parseStyle('color=notacolor'), /unsupported color/);
  assert.throws(() => parseStyle('bg='), /needs a value/);
});
