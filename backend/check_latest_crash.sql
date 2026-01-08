SELECT 
  id,
  detected_at,
  severity,
  shutdown_reason,
  exit_code,
  signal_name,
  crash_function,
  crash_file,
  crash_line,
  online_players,
  memory_mb,
  uptime_seconds
FROM incidents
WHERE shutdown_reason LIKE '%SIGSEGV%'
ORDER BY detected_at DESC
LIMIT 1;
