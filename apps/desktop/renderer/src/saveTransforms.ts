// Pure on-save text transforms (trim trailing whitespace, final newline, EOL).
// Kept separate so they're unit-testable and applied in one place at save time.

export interface SaveTransformOptions {
  trimTrailingWhitespace?: boolean;
  insertFinalNewline?: boolean;
  eol?: 'keep' | 'lf' | 'crlf';
}

export function applySaveTransforms(text: string, opts: SaveTransformOptions): string {
  let out = text;
  if (opts.trimTrailingWhitespace) {
    out = out
      .split('\n')
      .map((line) => line.replace(/[ \t]+(\r?)$/, '$1'))
      .join('\n');
  }
  if (opts.insertFinalNewline && out.length > 0 && !/\n$/.test(out)) {
    out += '\n';
  }
  if (opts.eol === 'crlf') out = out.replace(/\r?\n/g, '\r\n');
  else if (opts.eol === 'lf') out = out.replace(/\r\n/g, '\n');
  return out;
}
