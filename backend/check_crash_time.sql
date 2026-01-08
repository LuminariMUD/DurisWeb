SELECT 
  NOW() as current_server_time,
  started_at as crash_time,
  TIMESTAMPDIFF(MINUTE, started_at, NOW()) as minutes_ago,
  TIMESTAMPDIFF(HOUR, started_at, NOW()) as hours_ago
FROM server_incidents 
WHERE incident_type = 'crash' 
ORDER BY started_at DESC 
LIMIT 1;
