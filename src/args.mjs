export function parseArgs(argv, spec) {
  if (!Array.isArray(argv)) throw new TypeError('argv must be an array');
  const flags = spec?.flags || {};
  const positionalMode = spec?.positional ?? 'none';
  if (!['any', 'none'].includes(positionalMode)) throw new TypeError("positional must be 'any' or 'none'");
  for (const [name, type] of Object.entries(flags)) {
    if (!['string', 'number', 'boolean'].includes(type)) throw new TypeError(`unsupported flag type for --${name}: ${type}`);
  }

  const values = {};
  const positional = [];
  if (argv.includes('--help')) return { values, positional, help: true };
  const expected = Object.keys(flags).map((name) => `--${name}`).join(', ');
  let options = true;
  const setValue = (name, value) => Object.defineProperty(values, name, {
    value, enumerable: true, configurable: true, writable: true,
  });

  for (let i = 0; i < argv.length; i++) {
    const token = String(argv[i]);
    if (options && token === '--') {
      options = false;
      continue;
    }
    if (!options || !token.startsWith('--')) {
      if (positionalMode === 'none') throw new Error(`unexpected positional argument: ${token}`);
      positional.push(token);
      continue;
    }

    const equal = token.indexOf('=');
    const name = token.slice(2, equal < 0 ? undefined : equal);
    const inline = equal < 0 ? undefined : token.slice(equal + 1);
    if (!Object.hasOwn(flags, name)) throw new Error(`unknown option --${name} (expected: ${expected})`);
    const type = flags[name];
    if (type === 'boolean') {
      if (inline !== undefined) throw new Error(`option --${name} does not take a value`);
      setValue(name, true);
      continue;
    }

    let value = inline;
    if (value === undefined) {
      const next = argv[i + 1] === undefined ? undefined : String(argv[i + 1]);
      if (next === undefined || next.startsWith('--')) throw new Error(`missing value for --${name}`);
      value = next;
      i++;
    }
    if (type === 'number') {
      if (value.trim() === '' || !Number.isFinite(Number(value))) throw new Error(`--${name} must be a number`);
      setValue(name, Number(value));
    } else setValue(name, value);
  }

  return { values, positional, help: false };
}
