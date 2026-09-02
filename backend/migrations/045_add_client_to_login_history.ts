import type { Knex } from 'knex';

/** Add client identity columns when login history already exists. */
export async function up(knex: Knex): Promise<void> {
  // Fresh shared-schema baselines reach this migration before the timestamped
  // migration that creates account_login_history. That creator includes these
  // columns, so there is nothing to do yet when the table is absent.
  if (!(await knex.schema.hasTable('account_login_history'))) {
    return;
  }

  const hasClient = await knex.schema.hasColumn('account_login_history', 'client');
  const hasClientVersion = await knex.schema.hasColumn('account_login_history', 'client_version');

  await knex.schema.alterTable('account_login_history', (table) => {
    if (!hasClient) {
      table.string('client', 50).nullable();
    }
    if (!hasClientVersion) {
      table.string('client_version', 50).nullable();
    }
  });
}

/** Remove client identity columns when login history exists. */
export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('account_login_history'))) {
    return;
  }

  const hasClient = await knex.schema.hasColumn('account_login_history', 'client');
  const hasClientVersion = await knex.schema.hasColumn('account_login_history', 'client_version');

  await knex.schema.alterTable('account_login_history', (table) => {
    if (hasClient) {
      table.dropColumn('client');
    }
    if (hasClientVersion) {
      table.dropColumn('client_version');
    }
  });
}
