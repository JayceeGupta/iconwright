// Shapes results for agents: Windows paths use forward slashes (no doubled backslash
// escapes in JSON) and null fields are dropped. Every iconwright command accepts these paths back.
const WIN_PATH = /^[A-Za-z]:\\/;

export function slim(value) {
  if (Array.isArray(value)) return value.map(slim);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) if (v !== null && v !== undefined) out[key] = slim(v);
    return out;
  }
  if (typeof value === 'string' && WIN_PATH.test(value)) return value.replaceAll('\\', '/');
  return value;
}

export const toJson = (value) => JSON.stringify(slim(value));
