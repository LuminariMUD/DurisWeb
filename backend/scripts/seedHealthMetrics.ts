import { pool as db } from '../src/db/connection.js';

/**
 * Seed 90 days of fake health metrics data
 * This creates realistic historical data for the status page calendar
 */
async function seedHealthMetrics() {
  console.log('Seeding 90 days of health metrics...');

  const values: any[] = [];
  const today = new Date();

  // Generate data for the last 90 days
  for (let dayOffset = 89; dayOffset >= 0; dayOffset--) {
    const currentDate = new Date(today);
    currentDate.setDate(currentDate.getDate() - dayOffset);

    // Generate 288 checks per day (every 5 minutes)
    const checksPerDay = 288;

    for (let checkNum = 0; checkNum < checksPerDay; checkNum++) {
      const recordTime = new Date(currentDate);
      recordTime.setMinutes(checkNum * 5);

      // Realistic data with occasional issues
      const rand = Math.random();
      let mudIsRunning = true;
      let mudCpu = 5 + Math.random() * 15; // 5-20% CPU
      let mudMemory = 800 + Math.random() * 400; // 800-1200 MB
      let onlinePlayers = Math.floor(Math.random() * 20); // 0-20 players
      let dbQueryTime = 1 + Math.random() * 4; // 1-5ms
      let diskPercent = 45 + Math.random() * 10; // 45-55%

      // 3% chance of degraded performance
      if (rand < 0.03) {
        mudCpu = 60 + Math.random() * 20; // 60-80% CPU
        dbQueryTime = 50 + Math.random() * 50; // 50-100ms
      }

      // 1% chance of crash (MUD offline)
      if (rand < 0.01) {
        mudIsRunning = false;
        mudCpu = 0;
        mudMemory = 0;
        onlinePlayers = 0;
      }

      values.push([
        recordTime.toISOString().slice(0, 19).replace('T', ' '), // recorded_at
        mudIsRunning ? 1 : 0, // mud_is_running
        mudIsRunning ? Math.floor(Math.random() * 90000) : null, // mud_pid
        mudIsRunning ? Math.floor(Math.random() * 86400) : 0, // mud_uptime_seconds
        mudCpu, // mud_cpu_percent
        mudMemory, // mud_memory_mb
        onlinePlayers, // online_players
        1, // db_connected
        dbQueryTime, // db_query_time_ms
        Math.floor(Math.random() * 3), // db_connection_pool_used
        10, // db_connection_pool_total
        0.5 + Math.random() * 1.5, // system_load_1m
        0.6 + Math.random() * 1.4, // system_load_5m
        0.7 + Math.random() * 1.3, // system_load_15m
        Math.floor(100 + Math.random() * 50), // disk_used_gb
        500, // disk_total_gb
        diskPercent, // disk_percent
        Math.floor(Math.random() * 10), // websocket_connections
        0, // crashes_last_hour
        0, // crashes_last_24h
      ]);
    }
  }

  console.log(`Generated ${values.length} health metric records`);

  // Insert in batches of 1000
  const batchSize = 1000;
  for (let i = 0; i < values.length; i += batchSize) {
    const batch = values.slice(i, i + batchSize);

    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const flatValues = batch.flat();

    await db.query(
      `INSERT INTO server_health_metrics (
        recorded_at, mud_is_running, mud_pid, mud_uptime_seconds, mud_cpu_percent, mud_memory_mb,
        online_players, db_connected, db_query_time_ms, db_connection_pool_used, db_connection_pool_total,
        system_load_1m, system_load_5m, system_load_15m, disk_used_gb, disk_total_gb, disk_percent,
        websocket_connections, crashes_last_hour, crashes_last_24h
      ) VALUES ${placeholders}`,
      flatValues
    );

    console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(values.length / batchSize)}`);
  }

  console.log('✅ Successfully seeded 90 days of health metrics!');
  await db.end();
}

seedHealthMetrics().catch((error) => {
  console.error('Error seeding health metrics:', error);
  process.exit(1);
});
