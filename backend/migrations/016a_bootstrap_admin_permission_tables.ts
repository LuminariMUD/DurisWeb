import type { Knex } from "knex";

/**
 * Bootstrap the admin permission tables so a fresh database can migrate.
 *
 * Seven migrations between 017 and 041 insert into `admin_permissions`, but the
 * table is created by `20251115000000_admin_permissions_system.ts`, which sorts
 * 33 positions later under knex's lexicographic ordering. On an existing
 * database the tables were created out of band before those migrations ran, so
 * the gap never surfaced; on a fresh one `migrate:latest` fails at 017.
 *
 * This migration creates the schema only -- no seed rows. The later migration
 * still owns seeding, and is guarded so it skips tables that already exist.
 *
 * Named `016a_` so it sorts after `016_create_terminal_sessions.ts` and before
 * `017_add_terminal_access_permission.ts`.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("admin_permissions"))) {
    await knex.schema.createTable("admin_permissions", (table) => {
      table.increments("id").primary();
      table.string("permission_key", 100).notNullable().unique();
      table.string("permission_name", 255).notNullable();
      table.text("description");
      table.string("category", 50).notNullable();
      table.integer("sort_order").defaultTo(0);
      table.timestamp("created_at").defaultTo(knex.fn.now());

      table.index("category");
      table.index("sort_order");
    });
  }

  if (!(await knex.schema.hasTable("admin_roles"))) {
    await knex.schema.createTable("admin_roles", (table) => {
      table.increments("id").primary();
      table.string("role_name", 100).notNullable().unique();
      table.text("description");
      table.boolean("is_system_role").defaultTo(false);
      table.string("created_by", 50).notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("admin_role_permissions"))) {
    await knex.schema.createTable("admin_role_permissions", (table) => {
      table.increments("id").primary();
      table.integer("role_id").unsigned().notNullable();
      table.integer("permission_id").unsigned().notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());

      table
        .foreign("role_id")
        .references("id")
        .inTable("admin_roles")
        .onDelete("CASCADE");
      table
        .foreign("permission_id")
        .references("id")
        .inTable("admin_permissions")
        .onDelete("CASCADE");
      table.unique(["role_id", "permission_id"]);
    });
  }

  if (!(await knex.schema.hasTable("admin_account_roles"))) {
    await knex.schema.createTable("admin_account_roles", (table) => {
      table.increments("id").primary();
      table.string("account_name", 50).notNullable();
      table.integer("role_id").unsigned().notNullable();
      table.string("granted_by", 50).notNullable();
      table.timestamp("granted_at").defaultTo(knex.fn.now());

      table
        .foreign("role_id")
        .references("id")
        .inTable("admin_roles")
        .onDelete("CASCADE");
      table.unique(["account_name", "role_id"]);
      table.index("account_name");
    });
  }

  if (!(await knex.schema.hasTable("admin_account_permissions"))) {
    await knex.schema.createTable("admin_account_permissions", (table) => {
      table.increments("id").primary();
      table.string("account_name", 50).notNullable();
      table.integer("permission_id").unsigned().notNullable();
      table.string("granted_by", 50).notNullable();
      table.timestamp("granted_at").defaultTo(knex.fn.now());

      table
        .foreign("permission_id")
        .references("id")
        .inTable("admin_permissions")
        .onDelete("CASCADE");
      table.unique(["account_name", "permission_id"]);
      table.index("account_name");
    });
  }
}

/**
 * Deliberately a no-op. Dropping these tables belongs to
 * `20251115000000_admin_permissions_system.ts`, which owns them; doing it here
 * as well would drop live permission data when rolling back past this point on
 * a database where the later migration is still applied.
 */
export async function down(): Promise<void> {
  // no-op by design -- see the comment above
}
