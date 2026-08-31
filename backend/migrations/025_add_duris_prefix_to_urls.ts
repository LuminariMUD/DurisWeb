import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Update avatar URLs in user_profiles
  await knex.raw(`
    UPDATE user_profiles
    SET avatar_url = REPLACE(avatar_url, '/avatars/', '/duris/avatars/')
    WHERE avatar_url LIKE '%/avatars/%'
      AND avatar_url NOT LIKE '%/duris/avatars/%'
  `);

  // Update forum image URLs
  await knex.raw(`
    UPDATE forum_post_images
    SET image_url = REPLACE(image_url, '/forum-images/', '/duris/forum-images/'),
        image_key = CONCAT('duris/', image_key)
    WHERE image_url LIKE '%/forum-images/%'
      AND image_url NOT LIKE '%/duris/forum-images/%'
  `);

  // Update embedded images in forum post content
  await knex.raw(`
    UPDATE forum_posts
    SET content = REPLACE(content, '/forum-images/', '/duris/forum-images/')
    WHERE content LIKE '%/forum-images/%'
      AND content NOT LIKE '%/duris/forum-images/%'
  `);

  // Update embedded avatars in forum post content (if any)
  await knex.raw(`
    UPDATE forum_posts
    SET content = REPLACE(content, '/avatars/', '/duris/avatars/')
    WHERE content LIKE '%/avatars/%'
      AND content NOT LIKE '%/duris/avatars/%'
  `);

  // Update thread content if it contains images
  await knex.raw(`
    UPDATE forum_threads
    SET content = REPLACE(content, '/forum-images/', '/duris/forum-images/')
    WHERE content LIKE '%/forum-images/%'
      AND content NOT LIKE '%/duris/forum-images/%'
  `);

  await knex.raw(`
    UPDATE forum_threads
    SET content = REPLACE(content, '/avatars/', '/duris/avatars/')
    WHERE content LIKE '%/avatars/%'
      AND content NOT LIKE '%/duris/avatars/%'
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Revert avatar URLs
  await knex.raw(`
    UPDATE user_profiles
    SET avatar_url = REPLACE(avatar_url, '/duris/avatars/', '/avatars/')
    WHERE avatar_url LIKE '%/duris/avatars/%'
  `);

  // Revert forum image URLs
  await knex.raw(`
    UPDATE forum_post_images
    SET image_url = REPLACE(image_url, '/duris/forum-images/', '/forum-images/'),
        image_key = SUBSTRING(image_key, 7)
    WHERE image_url LIKE '%/duris/forum-images/%'
  `);

  // Revert embedded images in forum post content
  await knex.raw(`
    UPDATE forum_posts
    SET content = REPLACE(content, '/duris/forum-images/', '/forum-images/')
    WHERE content LIKE '%/duris/forum-images/%'
  `);

  await knex.raw(`
    UPDATE forum_posts
    SET content = REPLACE(content, '/duris/avatars/', '/avatars/')
    WHERE content LIKE '%/duris/avatars/%'
  `);

  // Revert thread content
  await knex.raw(`
    UPDATE forum_threads
    SET content = REPLACE(content, '/duris/forum-images/', '/forum-images/')
    WHERE content LIKE '%/duris/forum-images/%'
  `);

  await knex.raw(`
    UPDATE forum_threads
    SET content = REPLACE(content, '/duris/avatars/', '/avatars/')
    WHERE content LIKE '%/duris/avatars/%'
  `);
}
