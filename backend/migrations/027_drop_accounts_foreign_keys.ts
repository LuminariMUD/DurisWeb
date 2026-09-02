import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Drop FK from user_profiles
  const hasUserProfiles = await knex.schema.hasTable('user_profiles');
  if (hasUserProfiles) {
    // Check if constraint exists before dropping
    const [userProfilesFKs] = await knex.raw(`
      SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_profiles'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    `);

    for (const fk of userProfilesFKs) {
      await knex.raw(`ALTER TABLE user_profiles DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
    }
  }

  // Keep extension-table constraints out of the MUD runtime fingerprint. The
  // shared production database treats accounts as MUD-owned, so web profile
  // rows must not add incoming foreign keys to it.
  const hasUserProfileStats = await knex.schema.hasTable('user_profile_stats');
  if (hasUserProfileStats) {
    const [userProfileStatsFKs] = await knex.raw(`
      SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'user_profile_stats'
        AND REFERENCED_TABLE_NAME = 'accounts'
    `);

    for (const fk of userProfileStatsFKs) {
      await knex.raw('ALTER TABLE user_profile_stats DROP FOREIGN KEY ??', [fk.CONSTRAINT_NAME]);
    }
  }

  // Drop FK from forum_mentions
  const hasMentions = await knex.schema.hasTable('forum_mentions');
  if (hasMentions) {
    const [mentionsFKs] = await knex.raw(`
      SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'forum_mentions'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    `);

    for (const fk of mentionsFKs) {
      await knex.raw(`ALTER TABLE forum_mentions DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
    }
  }

  // Drop FK from user_bans if it exists
  const hasUserBans = await knex.schema.hasTable('user_bans');
  if (hasUserBans) {
    const [userBansFKs] = await knex.raw(`
      SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_bans'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    `);

    for (const fk of userBansFKs) {
      await knex.raw(`ALTER TABLE user_bans DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Re-add FKs if needed (but we probably won't need to roll this back)
  // Intentionally left empty - the accounts table is unused
}
