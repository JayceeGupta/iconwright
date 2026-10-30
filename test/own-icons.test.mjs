import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOwnIcons, isOwnIcon } from '../src/own-icons.mjs';

test('app: and desktop: sources resolve to their icon images, one call per kind', async () => {
  const calls = [];
  const win = async (command, o) => {
    calls.push([command, o]);
    const names = o.app ?? o.item;
    return names.map((n) => (n === 'Gone' ? { error: 'not found' } : { image: `C:/cache/${command}/${n}.png` }));
  };
  const out = await resolveOwnIcons(['mdi:home', 'app:Zen', 'desktop:This PC', 'APP:Steam'], win);
  assert.deepEqual(out, ['mdi:home', 'C:/cache/app-icon-image/Zen.png', 'C:/cache/desktop-icon-image/This PC.png', 'C:/cache/app-icon-image/Steam.png']);
  assert.deepEqual(calls, [['app-icon-image', { app: ['Zen', 'Steam'] }], ['desktop-icon-image', { item: ['This PC'] }]]);
  await assert.rejects(resolveOwnIcons(['desktop:Gone'], win), /desktop:Gone: not found/);
  await assert.rejects(resolveOwnIcons(['app:Zen'], null), /only work there/);
  assert.deepEqual(await resolveOwnIcons(['mdi:home'], null), ['mdi:home']);
  assert.equal(isOwnIcon('desktop:Recycle Bin'), true);
  assert.equal(isOwnIcon('C:/icons/a.png'), false);
});
