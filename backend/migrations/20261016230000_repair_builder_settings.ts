import type { Knex } from 'knex';
import { loadWebBaselineBundle } from '../src/db/webBaselineBundle.js';
import {
  matchesSchemaPostcondition,
  schemaDatabaseFamily,
  type SchemaDatabase,
} from '../src/db/schemaPostconditions.js';

export const config = { transaction: false };
const receiptKey = 'schema_repair_builder_settings';

function database(knex: Knex): SchemaDatabase {
  return { query: async (sql, bindings = []) => knex.raw(sql, bindings) };
}
async function receipt(knex: Knex): Promise<string | undefined> {
  const row = await knex('web_settings').where({ setting_key: receiptKey }).first('setting_value');
  const value = row?.setting_value as unknown;
  if (
    value !== undefined &&
    !['creating', 'created', 'preexisting', 'dropping'].includes(String(value))
  )
    throw new Error('Unexpected builder-settings repair receipt');
  return value === undefined ? undefined : String(value);
}
async function record(knex: Knex, value: string): Promise<void> {
  await knex('web_settings')
    .insert({ setting_key: receiptKey, setting_value: value })
    .onConflict('setting_key')
    .merge({ setting_value: value });
}
async function verify(knex: Knex): Promise<void> {
  const target = database(knex);
  if (
    !(await matchesSchemaPostcondition(
      target,
      'builder_settings',
      await schemaDatabaseFamily(target),
    ))
  )
    throw new Error('schema_drift_builder_settings');
}

/** Repair missing historical DDL before adopting the full current web baseline. */
export async function up(knex: Knex): Promise<void> {
  const progress = await receipt(knex);
  if (await knex.schema.hasTable('builder_settings')) {
    await verify(knex);
    if (progress === 'dropping') throw new Error('Finish builder-settings rollback before upgrade');
    await record(
      knex,
      progress === 'creating' || progress === 'created' ? 'created' : 'preexisting',
    );
    return;
  }
  if (progress !== undefined && progress !== 'creating')
    throw new Error('Builder-settings repair object is missing');
  await record(knex, 'creating'); // Durable intent precedes nontransactional DDL.
  const table = loadWebBaselineBundle().tables.find(({ name }) => name === 'builder_settings');
  if (!table) throw new Error('Builder-settings source definition is missing');
  await knex.raw(table.sql);
  await verify(knex);
  await record(knex, 'created');
}

/** Reverse only a repair-created, empty table before baseline adoption takes ownership. */
export async function down(knex: Knex): Promise<void> {
  const progress = await receipt(knex);
  const present = await knex.schema.hasTable('builder_settings');
  if (present) await verify(knex);
  if (progress === undefined || progress === 'preexisting') {
    if (progress === 'preexisting' && !present)
      throw new Error('Preexisting builder settings are missing');
    await knex('web_settings').where({ setting_key: receiptKey }).delete();
    return;
  }
  if (progress === 'creating') throw new Error('Finish builder-settings upgrade before rollback');
  if (await knex.schema.hasTable('web_schema_baselines')) {
    const provenance = await knex('web_schema_baselines').first('id');
    if (provenance)
      throw new Error('Adopted baseline owns builder settings; do not roll back across adoption');
  }
  if (present) {
    const [row] = await knex('builder_settings').count({ count: '*' });
    if (Number(row.count) !== 0) throw new Error('Builder-settings rollback refuses user data');
    await record(knex, 'dropping');
    await knex.schema.dropTable('builder_settings');
  } else if (progress !== 'dropping') throw new Error('Builder-settings repair object is missing');
  await knex('web_settings').where({ setting_key: receiptKey }).delete();
}
