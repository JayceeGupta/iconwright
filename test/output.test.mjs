import test from 'node:test';
import assert from 'node:assert/strict';
import { slim, toJson } from '../src/output.mjs';

test('slim turns Windows paths into forward-slash paths and drops nulls', () => {
  assert.deepEqual(slim({
    ico: 'C:\\Users\\me\\icon.ico', appId: '{1AC14E77-02E7}\\charmap.exe', hint: null,
    items: [{ path: 'D:\\x\\y.lnk', icon: undefined }], ok: true, n: 0, empty: [],
  }), { ico: 'C:/Users/me/icon.ico', appId: '{1AC14E77-02E7}\\charmap.exe', items: [{ path: 'D:/x/y.lnk' }], ok: true, n: 0, empty: [] });
  assert.equal(toJson({ note: "This app's icon", p: 'C:\\a' }), '{"note":"This app\'s icon","p":"C:/a"}');
});
