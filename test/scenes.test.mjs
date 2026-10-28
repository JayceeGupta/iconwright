import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { renderMaster } from '../src/render.mjs';
import { renderScenes, SCENES } from '../src/scenes.mjs';

const source = fileURLToPath(new URL('./fixtures/logo.svg', import.meta.url));
test('every scene renders a valid PNG and supports scaling', async () => {
  const master = await renderMaster({ source });
  for (const scene of SCENES) {
    const png = await renderScenes({ master, scenes: [scene] });
    const meta = await sharp(png).metadata();
    assert.equal(meta.format, 'png', scene);
    assert.ok(meta.width > 400, `${scene}: ${meta.width}`);
  }
  await assert.rejects(renderScenes({ master, scenes: ['unknown'] }), /unknown scene/i);
  const normal = await renderScenes({ master, scenes: ['taskbar'] });
  const larger = await renderScenes({ master, scenes: ['taskbar'], scale: 2 });
  assert.ok((await sharp(larger).metadata()).width > (await sharp(normal).metadata()).width);
});
