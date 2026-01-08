import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('server_incidents', (table) => {
    // Wholist snapshot before crash
    table.text('wholist_snapshot').comment('List of online players before crash');

    // Last 3 lines from various log files
    table.text('cmd_debug_last3').comment('Last 3 lines from cmd.debug log');
    table.text('status_log_last3').comment('Last 3 lines from status log');
    table.text('wizcmds_last3').comment('Last 3 lines from wizcmds log');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('server_incidents', (table) => {
    table.dropColumn('wholist_snapshot');
    table.dropColumn('cmd_debug_last3');
    table.dropColumn('status_log_last3');
    table.dropColumn('wizcmds_last3');
  });
}
