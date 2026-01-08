import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Zone documentation and metadata
  await knex.schema.createTable('builder_zone_info', (table) => {
    table.increments('id').primary();
    table.string('zone_id', 100).notNullable().unique();
    table.text('description').nullable(); // TipTap JSON content
    table.text('description_html').nullable(); // Rendered HTML for display
    table.string('owner_account', 50).notNullable(); // Account that created/owns zone
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('zone_id', 'idx_zone_info_zone_id');
    table.index('owner_account', 'idx_zone_info_owner');
  });

  // Zone access permissions
  await knex.schema.createTable('builder_zone_permissions', (table) => {
    table.increments('id').primary();
    table.string('zone_id', 100).notNullable();
    table.string('account_name', 50).notNullable();
    table.string('permission_level', 20).notNullable(); // 'view', 'edit', 'manage'
    table.string('granted_by', 50).notNullable();
    table.timestamp('granted_at').defaultTo(knex.fn.now());

    table.unique(['zone_id', 'account_name'], { indexName: 'uk_zone_account' });
    table.index('account_name', 'idx_zone_perm_account');
    table.index('zone_id', 'idx_zone_perm_zone');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('builder_zone_permissions');
  await knex.schema.dropTableIfExists('builder_zone_info');
}
