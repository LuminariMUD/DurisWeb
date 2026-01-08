import { pool as db } from '../src/db/connection.js';

/**
 * Seed realistic incident data for the status page
 */
async function seedIncidents() {
  console.log('Seeding incident data...');

  const incidents = [
    {
      started_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
      ended_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000 + 23 * 60 * 1000), // 23 minutes later
      duration_seconds: 23 * 60,
      incident_type: 'crash',
      severity: 'major',
      title: 'Unexpected server crash',
      description: 'MUD server crashed due to segmentation fault. Automatically restarted and recovered.',
      resolved: true,
    },
    {
      started_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      ended_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000), // 5 minutes later
      duration_seconds: 5 * 60,
      incident_type: 'outage',
      severity: 'critical',
      title: 'Database connectivity issue',
      description: 'Lost connection to MySQL database. Connection pool exhausted. Recovered after connection reset.',
      resolved: true,
    },
    {
      started_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000), // 21 days ago
      ended_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000 + 12 * 60 * 1000), // 12 minutes later
      duration_seconds: 12 * 60,
      incident_type: 'crash',
      severity: 'major',
      title: 'Memory corruption crash',
      description: 'Server crashed during zone reset. GDB backtrace captured. Issue under investigation.',
      resolved: true,
    },
    {
      started_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
      ended_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000), // 45 minutes later
      duration_seconds: 45 * 60,
      incident_type: 'maintenance',
      severity: 'info',
      title: 'Scheduled server maintenance',
      description: 'Planned maintenance window for server upgrades and bug fixes. Server was offline for 45 minutes.',
      resolved: true,
    },
    {
      started_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      ended_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 1000), // 3 minutes later
      duration_seconds: 3 * 60,
      incident_type: 'degraded',
      severity: 'minor',
      title: 'Performance degradation',
      description: 'CPU usage spiked to 95% during player surge. Performance returned to normal after player count decreased.',
      resolved: true,
    },
    {
      started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      ended_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 8 * 60 * 1000), // 8 minutes later
      duration_seconds: 8 * 60,
      incident_type: 'crash',
      severity: 'major',
      title: 'Combat system crash',
      description: 'Server crashed during large-scale PvP battle. Automatically restarted. All player data preserved.',
      resolved: true,
    },
  ];

  for (const incident of incidents) {
    const endedAt = incident.ended_at.toISOString().slice(0, 19).replace('T', ' ');

    await db.query(
      `INSERT INTO server_incidents (
        started_at, ended_at, duration_seconds, incident_type, severity, title, description, resolved
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        incident.started_at.toISOString().slice(0, 19).replace('T', ' '),
        endedAt,
        incident.duration_seconds,
        incident.incident_type,
        incident.severity,
        incident.title,
        incident.description,
        incident.resolved ? 1 : 0,
      ]
    );
  }

  console.log(`✅ Successfully seeded ${incidents.length} incidents!`);
  await db.end();
}

seedIncidents().catch((error) => {
  console.error('Error seeding incidents:', error);
  process.exit(1);
});
