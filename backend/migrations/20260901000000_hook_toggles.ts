import type { Knex } from 'knex';

import { getToggleableHooks } from '../src/hooks/index.js';

/**
 * Seed one `web_settings` row per toggleable hook, all enabled.
 *
 * Rows are derived from the hook registry rather than listed here, so a hook
 * added to the registry cannot be forgotten and a key cannot drift from its id.
 *
 * Strictly additive: `web_settings` lives in a schema shared with the MUD, and
 * this must not touch anything it did not create. Idempotent on re-run.
 */

const DESCRIPTION_PREFIX = 'DurisWeb hook toggle:';

export async function up(knex: Knex): Promise<void> {
  const hooks = getToggleableHooks();

  for (const hook of hooks) {
    // Always-on hooks are excluded by getToggleableHooks, but a null key would
    // silently insert a bad row, so refuse it explicitly.
    if (!hook.webSettingKey) {
      throw new Error(
        `Toggleable hook ${hook.id} has no webSettingKey; registry is inconsistent.`,
      );
    }

    const existing = await knex('web_settings')
      .where({ setting_key: hook.webSettingKey })
      .first();

    if (existing) {
      continue;
    }

    await knex('web_settings').insert({
      setting_key: hook.webSettingKey,
      setting_value: 'true',
      description: `${DESCRIPTION_PREFIX} ${hook.description.slice(0, 400)}`,
      updated_by: null,
    });
  }
}

/**
 * Remove only the rows this migration added, matched by the registry's keys.
 * A blanket delete on the description prefix would also remove rows an operator
 * added by hand for a hook since removed from the registry.
 */
export async function down(knex: Knex): Promise<void> {
  const keys = getToggleableHooks()
    .map((hook) => hook.webSettingKey)
    .filter((key): key is string => key !== null);

  if (keys.length === 0) {
    return;
  }

  await knex('web_settings').whereIn('setting_key', keys).del();
}
