import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('gemini_analysis_log', (table) => {
    table.bigIncrements('id').primary();
    table.timestamp('analysis_timestamp').notNullable().comment('When the AI analysis was performed');
    table.integer('suspicious_count').notNullable().defaultTo(0).comment('Number of suspicious accounts found');
    table.integer('patterns_count').notNullable().defaultTo(0).comment('Number of patterns detected');
    table.text('summary').comment('Executive summary of findings');
    table.json('full_results').comment('Complete JSON response from Gemini');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('analysis_timestamp');
    table.index('created_at');
  });

  console.log('✅ Created gemini_analysis_log table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('gemini_analysis_log');
  console.log('✅ Dropped gemini_analysis_log table');
}
