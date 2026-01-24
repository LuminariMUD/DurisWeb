import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('mud_restores', (table) => {
    // add new columns for account/character restore
    table.json('accounts').nullable().after('restore_type');
    table.json('characters').nullable().after('accounts');
    table.json('categories').nullable().after('characters');
  });

  // migrate existing data: convert targets to characters format
  const restores = await knex('mud_restores').whereNotNull('targets');
  for (const restore of restores) {
    if (restore.targets) {
      try {
        const targets = JSON.parse(restore.targets);
        const characters = targets
          .filter((t: { type: string }) => t.type === 'character')
          .map((t: { name: string }) => ({ pid: 0, name: t.name }));
        const accounts = targets
          .filter((t: { type: string }) => t.type === 'account')
          .map((t: { name: string }) => t.name);

        await knex('mud_restores')
          .where('id', restore.id)
          .update({
            accounts: accounts.length > 0 ? JSON.stringify(accounts) : null,
            characters: characters.length > 0 ? JSON.stringify(characters) : null,
            restore_type: restore.restore_type === 'selective' ? 'character' : restore.restore_type,
          });
      } catch {
        // skip if targets can't be parsed
      }
    }
  }

  // drop old targets column
  await knex.schema.alterTable('mud_restores', (table) => {
    table.dropColumn('targets');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('mud_restores', (table) => {
    table.json('targets').nullable().after('restore_type');
  });

  // migrate data back to targets format
  const restores = await knex('mud_restores').where(function() {
    this.whereNotNull('accounts').orWhereNotNull('characters');
  });

  for (const restore of restores) {
    const targets: { type: string; name: string }[] = [];

    if (restore.accounts) {
      try {
        const accounts = JSON.parse(restore.accounts);
        for (const name of accounts) {
          targets.push({ type: 'account', name });
        }
      } catch {
        // skip
      }
    }

    if (restore.characters) {
      try {
        const characters = JSON.parse(restore.characters);
        for (const char of characters) {
          targets.push({ type: 'character', name: char.name });
        }
      } catch {
        // skip
      }
    }

    await knex('mud_restores')
      .where('id', restore.id)
      .update({
        targets: targets.length > 0 ? JSON.stringify(targets) : null,
        restore_type: restore.restore_type === 'character' || restore.restore_type === 'account' ? 'selective' : restore.restore_type,
      });
  }

  await knex.schema.alterTable('mud_restores', (table) => {
    table.dropColumn('accounts');
    table.dropColumn('characters');
    table.dropColumn('categories');
  });
}
