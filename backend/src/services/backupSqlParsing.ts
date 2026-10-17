export interface BackupContents {
  accounts: string[];
  characters: { pid: number; name: string }[];
}

// ============================================================================
// BACKUP CONTENTS LISTING
// ============================================================================

/**
 * extract the accounts + characters lists from a sql dump by parsing the
 * account_characters table's INSERT blocks. exported for unit testing.
 */
export function parseBackupContentsFromSql(sqlContent: string): BackupContents {
  const accountsSet = new Set<string>();
  const chars: { pid: number; name: string }[] = [];

  const columns = parseCreateTableColumns(sqlContent, 'account_characters');
  if (columns.length === 0) return { accounts: [], characters: [] };
  const accIdx = columns.indexOf('account_name');
  const nameIdx = columns.indexOf('char_name');
  const pidIdx = columns.indexOf('pid');
  if (accIdx === -1 || nameIdx === -1 || pidIdx === -1) {
    return { accounts: [], characters: [] };
  }

  const blocks = extractInsertBlocks(sqlContent, 'account_characters');
  for (const block of blocks) {
    for (const row of parseMultiValueInsert(block)) {
      const acc = extractColValue(row, accIdx);
      const name = extractColValue(row, nameIdx);
      const pidStr = extractColValue(row, pidIdx);
      if (acc) accountsSet.add(acc);
      if (name && pidStr) {
        const pid = parseInt(pidStr, 10);
        if (!isNaN(pid)) chars.push({ pid, name });
      }
    }
  }

  return {
    accounts: [...accountsSet].sort(),
    characters: chars.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * extract every INSERT INTO `tableName` ... VALUES (...); statement for a specific table
 * from a sql dump string. returns the VALUES payload of each statement (without the
 * INSERT prefix or trailing semicolon). handles multiline statements, single-quoted
 * strings that contain parens/semicolons, and escaped quotes.
 * mysqldump always emits sql keywords in uppercase, so we do not need a case-insensitive
 * search for VALUES (which would cost a full dump copy per call).
 */
export function extractInsertBlocks(sqlContent: string, tableName: string): string[] {
  const blocks: string[] = [];
  const prefix = 'INSERT INTO `' + tableName + '`';
  let i = 0;

  while (i < sqlContent.length) {
    const start = sqlContent.indexOf(prefix, i);
    if (start === -1) break;

    // must match the whole table name — reject `player_data_backup` when looking for `player_data`
    const nextChar = sqlContent[start + prefix.length];
    if (nextChar !== ' ' && nextChar !== '\t' && nextChar !== '\n' && nextChar !== '(') {
      i = start + prefix.length;
      continue;
    }

    // find VALUES (mysqldump always emits keywords uppercase)
    const valuesIdx = sqlContent.indexOf('VALUES', start + prefix.length);
    if (valuesIdx === -1) break;

    let j = valuesIdx + 'VALUES'.length;
    while (j < sqlContent.length && /\s/.test(sqlContent[j])) j++;

    let depth = 0;
    let inString = false;
    let escapeNext = false;
    const valuesStart = j;

    while (j < sqlContent.length) {
      const c = sqlContent[j];
      if (escapeNext) {
        escapeNext = false;
        j++;
        continue;
      }
      if (c === '\\') {
        escapeNext = true;
        j++;
        continue;
      }
      if (c === "'") {
        inString = !inString;
        j++;
        continue;
      }
      if (!inString) {
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ';' && depth === 0) {
          blocks.push(sqlContent.slice(valuesStart, j).trimEnd());
          j++;
          break;
        }
      }
      j++;
    }

    i = j;
  }

  return blocks;
}

/**
 * extract ordered column names from a CREATE TABLE block in a sql dump.
 * returns [] if the table's CREATE block isn't present.
 * ignores constraint-only lines (PRIMARY KEY, UNIQUE KEY, KEY, FOREIGN KEY, CONSTRAINT).
 */
export function parseCreateTableColumns(sqlContent: string, tableName: string): string[] {
  const marker = 'CREATE TABLE `' + tableName + '`';
  const start = sqlContent.indexOf(marker);
  if (start === -1) return [];

  const openParen = sqlContent.indexOf('(', start);
  if (openParen === -1) return [];

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let closeParen = -1;

  for (let i = openParen; i < sqlContent.length; i++) {
    const c = sqlContent[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (c === '\\') {
      escapeNext = true;
      continue;
    }
    if (c === "'") {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) {
          closeParen = i;
          break;
        }
      }
    }
  }

  if (closeParen === -1) return [];

  const body = sqlContent.slice(openParen + 1, closeParen);

  // split the body by top-level commas (ignore commas inside parens like int(11)
  // or inside quoted default values). this handles both multi-line mysqldump
  // output and single-line CREATE TABLEs.
  const pieces: string[] = [];
  let current = '';
  let parenDepth = 0;
  inString = false;
  escapeNext = false;
  for (const c of body) {
    if (escapeNext) {
      current += c;
      escapeNext = false;
      continue;
    }
    if (c === '\\') {
      escapeNext = true;
      current += c;
      continue;
    }
    if (c === "'") {
      inString = !inString;
      current += c;
      continue;
    }
    if (!inString) {
      if (c === '(') parenDepth++;
      else if (c === ')') parenDepth--;
      else if (c === ',' && parenDepth === 0) {
        if (current.trim()) pieces.push(current.trim());
        current = '';
        continue;
      }
    }
    current += c;
  }
  if (current.trim()) pieces.push(current.trim());

  const columns: string[] = [];
  const constraintPrefixes = [
    'PRIMARY KEY',
    'UNIQUE KEY',
    'UNIQUE INDEX',
    'KEY ',
    'INDEX ',
    'FOREIGN KEY',
    'CONSTRAINT',
    'FULLTEXT',
    'SPATIAL',
  ];

  for (const piece of pieces) {
    const upper = piece.toUpperCase();
    if (constraintPrefixes.some((p) => upper.startsWith(p))) continue;
    const m = piece.match(/^`([^`]+)`/);
    if (m) columns.push(m[1]);
  }

  return columns;
}

/**
 * unescape mysql's backslash-escaped string literal back to the raw string.
 * mysqldump emits e.g. O'Brien as 'O\'Brien' — so after stripping the outer
 * quotes we must convert '\\'' back to "'" so equality checks against raw
 * user input (sets of account/character names) match.
 */
export function unescapeMysqlString(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const next = s[i + 1];
      if (next === "'") {
        out += "'";
        i++;
      } else if (next === '"') {
        out += '"';
        i++;
      } else if (next === '\\') {
        out += '\\';
        i++;
      } else if (next === 'n') {
        out += '\n';
        i++;
      } else if (next === 'r') {
        out += '\r';
        i++;
      } else if (next === '0') {
        out += '\0';
        i++;
      } else if (next === 'Z') {
        out += '\x1A';
        i++;
      } else {
        out += s[i];
      }
    } else {
      out += s[i];
    }
  }
  return out;
}

/**
 * parse the filter-col value out of one row-string and return it as a plain string.
 * numeric values stay as digit strings ('42'); quoted values have their outer quotes
 * stripped and mysql-escape sequences unescaped so equality checks against raw user
 * input match.
 */
export function extractColValue(rowStr: string, colIndex: number): string | null {
  if (!rowStr.startsWith('(') || !rowStr.endsWith(')')) return null;
  const inner = rowStr.slice(1, -1);
  let currentStart = 0;
  let col = 0;
  let inString = false;
  let escapeNext = false;
  let depth = 0;

  for (let i = 0; i <= inner.length; i++) {
    const c = i < inner.length ? inner[i] : ',';
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (c === '\\') {
      escapeNext = true;
      continue;
    }
    if (c === "'") {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) {
        if (col === colIndex) {
          let val = inner.slice(currentStart, i).trim();
          if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
            val = unescapeMysqlString(val.slice(1, -1));
          }
          return val;
        }
        col++;
        currentStart = i + 1;
      }
    }
  }
  return null;
}

/**
 * Parse multi-value INSERT VALUES section into individual row strings
 * Handles nested parentheses and quoted strings with commas
 */
export function parseMultiValueInsert(valuesStr: string): string[] {
  const rows: string[] = [];
  let depth = 0;
  let currentRow = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < valuesStr.length; i++) {
    const char = valuesStr[i];

    if (escapeNext) {
      currentRow += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      currentRow += char;
      escapeNext = true;
      continue;
    }

    if (char === "'" && !escapeNext) {
      inString = !inString;
      currentRow += char;
      continue;
    }

    if (!inString) {
      if (char === '(') {
        depth++;
        if (depth === 1) {
          currentRow = '(';
          continue;
        }
      } else if (char === ')') {
        depth--;
        if (depth === 0) {
          currentRow += ')';
          rows.push(currentRow);
          currentRow = '';
          continue;
        }
      } else if (char === ',' && depth === 0) {
        continue; // Skip comma between rows
      }
    }

    if (depth > 0) {
      currentRow += char;
    }
  }

  return rows;
}
