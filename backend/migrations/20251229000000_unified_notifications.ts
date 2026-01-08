import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // create unified notifications table
  await knex.schema.createTable('notifications', (table) => {
    table.increments('id').primary();
    table.string('account_name', 50).notNullable();
    table.string('source', 20).notNullable(); // forum, builder, auction, etc
    table.string('notification_type', 50).notNullable();
    table.text('message').notNullable();
    table.string('link', 255).nullable(); // where to navigate
    table.boolean('is_read').defaultTo(false);
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('read_at').nullable();
    table.string('triggered_by_account', 50).nullable();
    table.string('triggered_by_character', 50).nullable();
    table.json('data').nullable(); // feature-specific data

    table.index(['account_name', 'is_read'], 'idx_notif_account_read');
    table.index('source', 'idx_notif_source');
    table.index('created_at', 'idx_notif_created');
  });

  // migrate forum_notifications
  const forumExists = await knex.schema.hasTable('forum_notifications');
  if (forumExists) {
    const forumNotifs = await knex('forum_notifications').select('*');
    for (const n of forumNotifs) {
      await knex('notifications').insert({
        account_name: n.user_account_name,
        source: 'forum',
        notification_type: n.notification_type,
        message: n.message,
        link: `/forum/thread/${n.thread_id}`,
        is_read: n.is_read,
        created_at: n.created_at,
        read_at: n.read_at,
        triggered_by_account: n.triggered_by_account_name,
        triggered_by_character: n.triggered_by_character,
        data: JSON.stringify({ threadId: n.thread_id, postId: n.post_id }),
      });
    }
    await knex.schema.dropTable('forum_notifications');
  }

  // migrate builder_notifications
  const builderExists = await knex.schema.hasTable('builder_notifications');
  if (builderExists) {
    const builderNotifs = await knex('builder_notifications').select('*');
    for (const n of builderNotifs) {
      const subTab = n.entity_type === 'comment' ? 'comments' : 'proc-requests';
      await knex('notifications').insert({
        account_name: n.account_name,
        source: 'builder',
        notification_type: n.notification_type,
        message: n.message,
        link: `/builder/zone/${n.zone_id}?tab=info&subTab=${subTab}`,
        is_read: n.is_read,
        created_at: n.created_at,
        read_at: n.read_at,
        triggered_by_account: n.triggered_by_account,
        triggered_by_character: null,
        data: JSON.stringify({ zoneId: n.zone_id, zoneName: n.zone_name, entityType: n.entity_type, entityId: n.entity_id }),
      });
    }
    await knex.schema.dropTable('builder_notifications');
  }
}

export async function down(knex: Knex): Promise<void> {
  // recreate forum_notifications
  await knex.schema.createTable('forum_notifications', (table) => {
    table.increments('id').primary();
    table.string('user_account_name', 50).notNullable();
    table.string('notification_type', 50).notNullable();
    table.integer('thread_id').unsigned().notNullable();
    table.integer('post_id').unsigned().nullable();
    table.string('triggered_by_account_name', 50).notNullable();
    table.string('triggered_by_character', 50).nullable();
    table.text('message').notNullable();
    table.boolean('is_read').defaultTo(false);
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('read_at').nullable();
  });

  // recreate builder_notifications
  await knex.schema.createTable('builder_notifications', (table) => {
    table.increments('id').primary();
    table.string('account_name', 50).notNullable();
    table.string('notification_type', 50).notNullable();
    table.string('zone_id', 100).notNullable();
    table.string('zone_name', 255).nullable();
    table.string('entity_type', 50).nullable();
    table.integer('entity_id').unsigned().nullable();
    table.string('triggered_by_account', 50).notNullable();
    table.text('message').notNullable();
    table.boolean('is_read').defaultTo(false);
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('read_at').nullable();
  });

  // migrate back
  const notifs = await knex('notifications').select('*');
  for (const n of notifs) {
    const data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
    if (n.source === 'forum' && data?.threadId) {
      await knex('forum_notifications').insert({
        user_account_name: n.account_name,
        notification_type: n.notification_type,
        thread_id: data.threadId,
        post_id: data.postId,
        triggered_by_account_name: n.triggered_by_account,
        triggered_by_character: n.triggered_by_character,
        message: n.message,
        is_read: n.is_read,
        created_at: n.created_at,
        read_at: n.read_at,
      });
    } else if (n.source === 'builder' && data?.zoneId) {
      await knex('builder_notifications').insert({
        account_name: n.account_name,
        notification_type: n.notification_type,
        zone_id: data.zoneId,
        zone_name: data.zoneName,
        entity_type: data.entityType,
        entity_id: data.entityId,
        triggered_by_account: n.triggered_by_account,
        message: n.message,
        is_read: n.is_read,
        created_at: n.created_at,
        read_at: n.read_at,
      });
    }
  }

  await knex.schema.dropTable('notifications');
}
