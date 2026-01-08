-- Migration 015: Fix Emoji Icons to Lucide Icon Names
-- Replace emoji icons with proper Lucide icon names

UPDATE forum_categories SET icon = 'MessageSquare' WHERE icon = '💬';
UPDATE forum_categories SET icon = 'Swords' WHERE icon = '⚔️';
UPDATE forum_categories SET icon = 'Castle' WHERE icon = '🏰';
UPDATE forum_categories SET icon = 'Sparkles' WHERE icon = '✨';
UPDATE forum_categories SET icon = 'Crown' WHERE icon = '👑';
UPDATE forum_categories SET icon = 'Bug' WHERE icon = '🐛';
UPDATE forum_categories SET icon = 'Lightbulb' WHERE icon = '💡';
UPDATE forum_categories SET icon = 'BookOpen' WHERE icon = '📖';
UPDATE forum_categories SET icon = 'Users' WHERE icon = '👥';
UPDATE forum_categories SET icon = 'Megaphone' WHERE icon = '📢';
