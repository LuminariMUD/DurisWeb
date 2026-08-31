import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('web_donation_totals', (table) => {
    table.string('account_name', 50).primary();
    table.bigInteger('total_cents').unsigned().notNullable().defaultTo(0);
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    INSERT INTO web_donation_totals (account_name, total_cents)
    SELECT account_name, CAST(ROUND(SUM(amount) * 100) AS UNSIGNED)
    FROM donations
    WHERE account_name IS NOT NULL
    GROUP BY account_name
    ON DUPLICATE KEY UPDATE total_cents = VALUES(total_cents), updated_at = UTC_TIMESTAMP()
  `);

  await knex.schema.createTable('donation_outbox', (table) => {
    table.bigIncrements('id').primary();
    table.integer('donation_id').unsigned().notNullable().unique();
    table.string('event_id', 64).notNullable().unique();
    table.bigInteger('amount_cents').unsigned().notNullable();
    table.string('currency', 3).notNullable();
    table.boolean('is_public').notNullable().defaultTo(false);
    table.string('character_name', 32).nullable();
    table.string('message', 256).nullable();
    table.string('status', 16).notNullable().defaultTo('pending');
    table.integer('attempts').unsigned().notNullable().defaultTo(0);
    table.timestamp('available_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('locked_at').nullable();
    table.timestamp('published_at').nullable();
    table.string('last_error', 500).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('donation_id').references('id').inTable('donations').onDelete('RESTRICT');
    table.index(['status', 'available_at'], 'idx_donation_outbox_ready');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('donation_outbox');
  await knex.schema.dropTableIfExists('web_donation_totals');
}
