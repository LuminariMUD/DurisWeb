import fs from 'fs/promises';

export interface Property {
  key: string;
  value: number;
  category: string;
  subcategory?: string;
}

export interface PropertyCategory {
  name: string;
  description: string;
  properties: Property[];
}

const MUD_DIR = process.env.MUD_DIR!;
const PROPERTIES_PATH = `${MUD_DIR}/lib/duris.properties`;

/**
 * Parse the MUD's properties file and return all settings
 */
export async function parsePropertiesFile(): Promise<Map<string, number>> {
  const content = await fs.readFile(PROPERTIES_PATH, 'utf-8');
  const properties = new Map<string, number>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue;
    }

    // Parse key=value format
    const match = trimmed.match(/^([^=]+)=(.+)$/);
    if (match) {
      const key = match[1].trim();
      const valueStr = match[2].trim();

      // Parse numeric value (handle floats and integers)
      const value = parseFloat(valueStr);
      if (!isNaN(value)) {
        properties.set(key, value);
      }
    }
  }

  return properties;
}

/**
 * Get properties grouped by game system category
 */
export async function getCategorizedProperties(): Promise<PropertyCategory[]> {
  const properties = await parsePropertiesFile();

  const categories: Record<string, Property[]> = {
    leveling: [],
    epic: [],
    economy: [],
    combat: [],
    timers: [],
    other: [],
  };

  for (const [key, value] of properties.entries()) {
    const property: Property = {
      key,
      value,
      category: categorizeProperty(key),
      subcategory: extractSubcategory(key),
    };

    const categoryKey = property.category.toLowerCase().replace(/ /g, '_');
    if (categories[categoryKey]) {
      categories[categoryKey].push(property);
    } else {
      categories.other.push(property);
    }
  }

  return [
    {
      name: 'Leveling',
      description: 'Experience, level caps, and progression settings',
      properties: categories.leveling.sort((a, b) => a.key.localeCompare(b.key)),
    },
    {
      name: 'Epic',
      description: 'Epic system, errands, and bonus multipliers',
      properties: categories.epic.sort((a, b) => a.key.localeCompare(b.key)),
    },
    {
      name: 'Economy',
      description: 'Guild halls, ships, cargo, and trading',
      properties: categories.economy.sort((a, b) => a.key.localeCompare(b.key)),
    },
    {
      name: 'Combat',
      description: 'Damage caps, skill timers, and combat modifiers',
      properties: categories.combat.sort((a, b) => a.key.localeCompare(b.key)),
    },
    {
      name: 'Timers',
      description: 'Cooldown timers for skills and abilities',
      properties: categories.timers.sort((a, b) => a.key.localeCompare(b.key)),
    },
    {
      name: 'Other',
      description: 'Miscellaneous settings',
      properties: categories.other.sort((a, b) => a.key.localeCompare(b.key)),
    },
  ].filter((cat) => cat.properties.length > 0); // Only include non-empty categories
}

/**
 * Categorize a property key into a game system
 */
function categorizeProperty(key: string): string {
  const lowerKey = key.toLowerCase();

  // Leveling category
  if (
    lowerKey.startsWith('exp.') ||
    lowerKey.includes('level') ||
    lowerKey.includes('xp') ||
    lowerKey.includes('death.level')
  ) {
    return 'Leveling';
  }

  // Epic category
  if (lowerKey.startsWith('epic.') || lowerKey.includes('errand')) {
    return 'Epic';
  }

  // Economy category
  if (
    lowerKey.startsWith('guildhalls.') ||
    lowerKey.startsWith('ship.') ||
    lowerKey.includes('cargo') ||
    lowerKey.includes('platinum') ||
    lowerKey.includes('contraband')
  ) {
    return 'Economy';
  }

  // Combat category
  if (
    lowerKey.startsWith('damage.') ||
    lowerKey.startsWith('skill.') ||
    lowerKey.includes('hitroll') ||
    lowerKey.includes('damroll') ||
    lowerKey.includes('notch') ||
    lowerKey.startsWith('innate.')
  ) {
    return 'Combat';
  }

  // Timers category
  if (
    lowerKey.startsWith('timer.') ||
    lowerKey.includes('.delay') ||
    lowerKey.includes('.cooldown')
  ) {
    return 'Timers';
  }

  return 'Other';
}

/**
 * Extract subcategory from property key (e.g., "exp.factor" from "exp.factor.global")
 */
function extractSubcategory(key: string): string | undefined {
  const parts = key.split('.');
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  return undefined;
}

/**
 * Get a single property value by key
 */
export async function getProperty(key: string): Promise<number | null> {
  const properties = await parsePropertiesFile();
  return properties.get(key) ?? null;
}

/**
 * Search properties by key pattern
 */
export async function searchProperties(query: string): Promise<Property[]> {
  const properties = await parsePropertiesFile();
  const lowerQuery = query.toLowerCase();
  const results: Property[] = [];

  for (const [key, value] of properties.entries()) {
    if (key.toLowerCase().includes(lowerQuery)) {
      results.push({
        key,
        value,
        category: categorizeProperty(key),
        subcategory: extractSubcategory(key),
      });
    }
  }

  return results.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Update a property value in the properties file
 * Creates a backup before updating
 */
export async function updateProperty(key: string, newValue: number): Promise<{ oldValue: number }> {
  const content = await fs.readFile(PROPERTIES_PATH, 'utf-8');
  const lines = content.split('\n');

  let oldValue: number | null = null;
  let found = false;
  const updatedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this is the property we want to update
    const match = trimmed.match(/^([^=]+)=(.+)$/);
    if (match && match[1].trim() === key) {
      found = true;
      oldValue = parseFloat(match[2].trim());
      // Replace with new value
      updatedLines.push(`${key}=${newValue}`);
    } else {
      // Keep line as-is
      updatedLines.push(line);
    }
  }

  if (!found) {
    throw new Error(`Property '${key}' not found in properties file`);
  }

  // Create backup of current properties file
  const backupPath = `${PROPERTIES_PATH}.bak`;
  await fs.copyFile(PROPERTIES_PATH, backupPath);

  // Write updated content atomically (write to temp file, then rename)
  const tempPath = `${PROPERTIES_PATH}.tmp`;
  await fs.writeFile(tempPath, updatedLines.join('\n'), 'utf-8');
  await fs.rename(tempPath, PROPERTIES_PATH);

  return { oldValue: oldValue! };
}

/**
 * Get property change history from audit log
 */
export async function getPropertyHistory(
  key: string,
  limit: number = 10,
): Promise<
  Array<{
    id: number;
    accountName: string;
    oldValue: string;
    newValue: string;
    timestamp: Date;
    notes?: string;
  }>
> {
  const { pool } = await import('../db/connection.js');

  const [rows] = await pool.query<any[]>(
    `SELECT id, account_name, old_value, new_value, timestamp, notes
     FROM admin_action_log
     WHERE action_type = 'property_change' AND target = ?
     ORDER BY timestamp DESC
     LIMIT ?`,
    [key, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    accountName: row.account_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    timestamp: new Date(row.timestamp),
    notes: row.notes,
  }));
}

/**
 * Validate property value is within acceptable range
 */
export function validatePropertyValue(
  key: string,
  value: number,
): { valid: boolean; error?: string } {
  // Define validation rules for known properties
  const validationRules: Record<string, { min?: number; max?: number; description?: string }> = {
    // Experience settings
    'exp.maxExpLevel': { min: 1, max: 100, description: 'Max XP level must be between 1 and 100' },
    'exp.factor.global': {
      min: 0.1,
      max: 10,
      description: 'Global XP rate must be between 0.1x and 10x',
    },
    'exp.factor.racewar.good': {
      min: 0.1,
      max: 10,
      description: 'Good XP rate must be between 0.1x and 10x',
    },
    'exp.factor.racewar.evil': {
      min: 0.1,
      max: 10,
      description: 'Evil XP rate must be between 0.1x and 10x',
    },
    'exp.factor.overCap': {
      min: 0,
      max: 1,
      description: 'Over-cap XP factor must be between 0 and 1',
    },
    'exp.death.level.loss': {
      min: 0,
      max: 1,
      description: 'Death XP loss must be between 0 and 1',
    },

    // Epic settings
    'epic.maxFreeLevel': {
      min: 1,
      max: 100,
      description: 'Max epic level must be between 1 and 100',
    },
    'epic.errandStep': {
      min: 1,
      max: 10000,
      description: 'Epic errand step must be between 1 and 10000',
    },
    'epic.errand.penaltyMod': {
      min: 0,
      max: 1,
      description: 'Errand penalty must be between 0 and 1',
    },
    'epic.errand.completeBonusMod': {
      min: 0,
      max: 10,
      description: 'Errand bonus must be between 0 and 10x',
    },

    // Damage caps
    'damage.damrollCap': {
      min: 1,
      max: 1000,
      description: 'Damage roll cap must be between 1 and 1000',
    },
    'damage.hitrollCap': {
      min: 1,
      max: 1000,
      description: 'Hit roll cap must be between 1 and 1000',
    },
  };

  const rule = validationRules[key];

  // If no rule exists, allow any positive number
  if (!rule) {
    if (value < 0) {
      return { valid: false, error: 'Value must be non-negative' };
    }
    return { valid: true };
  }

  // Check min/max bounds
  if (rule.min !== undefined && value < rule.min) {
    return { valid: false, error: rule.description || `Value must be >= ${rule.min}` };
  }

  if (rule.max !== undefined && value > rule.max) {
    return { valid: false, error: rule.description || `Value must be <= ${rule.max}` };
  }

  return { valid: true };
}
