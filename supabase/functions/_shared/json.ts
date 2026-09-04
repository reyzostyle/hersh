// Parsing JSON that a model wrote.
//
// The models are told to answer with JSON and mostly do, but "mostly" is the
// problem: a real newline inside a string value is the single most common way
// the output stops being valid, and it costs the whole analysis. That is what
// "Bad control character in string literal in JSON" means, and it surfaced as
// a support message rather than as anything the creator could act on.
//
// Six call sites were doing the same match-then-parse by hand, which is six
// places for the same failure to be fixed once and stay broken five times.

// Escape the control characters that are only illegal INSIDE a string. State
// has to be tracked properly rather than swept with a global replace: a
// backslash-escaped quote does not end the string, and a newline between two
// keys is legal whitespace that must be left alone.
function escapeControlChars(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (const ch of json) {
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }

    if (inString && ch < ' ') {
      out += ch === '\n' ? '\\n'
        : ch === '\r' ? '\\r'
        : ch === '\t' ? '\\t'
        : `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
      continue;
    }
    out += ch;
  }

  return out;
}

// Pull the JSON object out of whatever the model wrapped it in and parse it.
// The clean parse is tried first: output that is already valid is far more
// common, and rewriting it would be work done to change nothing.
// `shape` says whether the answer is an object or a list, because a prompt that
// asks for a list gets `[...]` and looking for a brace would find one inside it.
export function parseModelJson<T = any>(
  text: string,
  what = 'response',
  shape: 'object' | 'array' = 'object',
): T {
  const match = shape === 'array' ? text.match(/\[[\s\S]*\]/) : text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in the model ${what}`);

  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return JSON.parse(escapeControlChars(match[0])) as T;
  }
}
