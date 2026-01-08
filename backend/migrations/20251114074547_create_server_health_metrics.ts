import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Server health metrics table for historical tracking
  await knex.schema.createTable('server_health_metrics', (table) => {
    table.increments('id').primary();

    // Timestamp
    table.datetime('recorded_at').notNullable().defaultTo(knex.fn.now());

    // MUD Server Status
    table.boolean('mud_is_running').notNullable();
    table.integer('mud_pid');
    table.integer('mud_uptime_seconds');
    table.float('mud_cpu_percent');
    table.float('mud_memory_mb');

    // Player Activity
    table.integer('online_players').defaultTo(0);

    // Database Health
    table.boolean('db_connected').notNullable();
    table.float('db_query_time_ms').comment('Average query response time');
    table.integer('db_connection_pool_used').comment('Active database connections');
    table.integer('db_connection_pool_total').comment('Total connection pool size');

    // System Resources
    table.float('system_load_1m').comment('1-minute load average');
    table.float('system_load_5m').comment('5-minute load average');
    table.float('system_load_15m').comment('15-minute load average');
    table.float('disk_used_gb');
    table.float('disk_total_gb');
    table.float('disk_percent');

    // WebSocket Connections
    table.integer('websocket_connections').defaultTo(0);

    // Incidents
    table.integer('crashes_last_hour').defaultTo(0);
    table.integer('crashes_last_24h').defaultTo(0);

    // Indexes
    table.index('recorded_at', 'idx_recorded_at');
    table.index('mud_is_running', 'idx_mud_is_running');
    table.index('crashes_last_24h', 'idx_crashes_24h');
  });

  // Server incidents table for status page timeline
  await knex.schema.createTable('server_incidents', (table) => {
    table.increments('id').primary();

    // Incident details
    table.datetime('started_at').notNullable();
    table.datetime('ended_at');
    table.integer('duration_seconds').comment('Calculated when incident ends');

    // Type and severity
    table.enum('incident_type', ['crash', 'maintenance', 'degraded', 'outage']).notNullable();
    table.enum('severity', ['critical', 'major', 'minor', 'info']).notNullable().defaultTo('minor');

    // Description
    table.string('title', 255).notNullable().comment('Brief incident title');
    table.text('description').comment('Detailed incident description');

    // Resolution
    table.boolean('resolved').defaultTo(false);
    table.text('resolution_notes');

    // Auto-populated data
    table.integer('crash_log_id').unsigned().comment('Link to crash_log if crash-related');

    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('started_at', 'idx_started_at');
    table.index('incident_type', 'idx_incident_type');
    table.index('resolved', 'idx_resolved');
    table.index('severity', 'idx_severity');

    // Foreign key
    table.foreign('crash_log_id').references('crash_log.id').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('server_incidents');
  await knex.schema.dropTableIfExists('server_health_metrics');
}

