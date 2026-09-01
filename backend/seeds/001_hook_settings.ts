import type { Knex } from 'knex';

import { getToggleableHooks } from '../src/hooks/index.js';

/**
 * Restore only missing hook settings. Existing operator choices are never
 * overwritten, which makes the seed safe to run repeatedly.
 */
export async function seed(knex: Knex): Promise<void> {
  const rows = getToggleableHooks().map((hook) => {
    if (!hook.webSettingKey) {
      throw new Error(`Toggleable hook ${hook.id} has no webSettingKey.`);
    }

    return {
      setting_key: hook.webSettingKey,
      setting_value: 'true',
      description: `DurisWeb hook toggle: ${hook.description.slice(0, 400)}`,
      updated_by: null,
    };
  });

  if (rows.length === 0) {
    return;
  }

  await knex('web_settings').insert(rows).onConflict('setting_key').ignore();
}
