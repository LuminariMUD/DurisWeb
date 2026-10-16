/** Check emitted SQL, including dynamically assembled/Knex-generated DDL, before execution. */
export function assertWebForwardSql(sql: string, declared: ReadonlySet<string>): void {
  // Hide literals before interpreting comments or statement separators.
  let text = sql.replace(/'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"/g, '?');
  if (/\/\*(?:!|M!)/i.test(text)) throw new Error('forward_schema_unsupported_sql');
  text = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[ \t][^\r\n]*|#[^\r\n]*/g, ' ')
    .trim()
    .replace(/;$/, '');
  if (text.includes(';')) throw new Error('forward_schema_unsupported_sql');
  const tokens = text.match(/`[^`]*`|[a-zA-Z_][a-zA-Z0-9_]*|[^\s]/g) ?? [];
  const words = tokens.map((token) => token.toUpperCase());
  const unsupported = (): never => {
    throw new Error('forward_schema_unsupported_sql');
  };
  const table = (index: number): number => {
    const name = tokens[index]?.replace(/^`|`$/g, '');
    if (!name || !/^[a-z][a-z0-9_]*$/.test(name) || tokens[index + 1] === '.') return unsupported();
    if (!declared.has(name)) throw new Error('forward_schema_undeclared_table');
    return index + 1;
  };
  const command = words[0];
  if (
    [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'SET',
      'SHOW',
      'DESCRIBE',
      'EXPLAIN',
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
      'SAVEPOINT',
      'RELEASE',
    ].includes(command)
  )
    return;
  if (command === 'ALTER' && words[1] === 'TABLE') {
    table(2);
    for (let index = 3; index < tokens.length; index++) {
      if (words[index] === 'RENAME' && !['COLUMN', 'INDEX', 'KEY'].includes(words[index + 1])) {
        table(index + (['TO', 'AS'].includes(words[index + 1]) ? 2 : 1));
      }
      if (words[index] === 'WITH' && words[index + 1] === 'TABLE') table(index + 2);
    }
  } else if (command === 'TRUNCATE') {
    const end = table(words[1] === 'TABLE' ? 2 : 1);
    if (end !== tokens.length) return unsupported();
  } else if (command === 'RENAME' && words[1] === 'TABLE') {
    let index = 2;
    while (index < tokens.length) {
      index = table(index);
      if (words[index++] !== 'TO') return unsupported();
      index = table(index);
      if (index < tokens.length && tokens[index++] !== ',') return unsupported();
    }
  } else if (command === 'CREATE' || command === 'DROP') {
    let index = words[1] === 'TEMPORARY' ? 2 : 1;
    if (words[index] === 'TABLE') {
      index++;
      if (words[index] === 'IF') {
        index += command === 'CREATE' ? 3 : 2;
        if (words[index - 1] !== 'EXISTS') return unsupported();
      }
      index = table(index);
      if (command === 'DROP') {
        while (tokens[index] === ',') index = table(index + 1);
        if (index < tokens.length && !['RESTRICT', 'CASCADE'].includes(words[index]))
          return unsupported();
      }
    } else {
      if (['UNIQUE', 'FULLTEXT', 'SPATIAL'].includes(words[index])) index++;
      if (words[index] !== 'INDEX') return unsupported();
      const on = words.indexOf('ON', index + 2);
      if (on === -1) return unsupported();
      table(on + 1);
    }
  } else return unsupported();
  // Foreign keys must not introduce an undeclared cross-owner dependency.
  for (let index = 0; index < tokens.length; index++) {
    if (words[index] === 'REFERENCES') table(index + 1);
  }
}
