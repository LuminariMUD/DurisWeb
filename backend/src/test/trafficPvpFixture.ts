import type { Connection, RowDataPacket } from 'mysql2/promise';

export const TRAFFIC_PVP_EVENTS = 50_000;

/** Synthetic snapshots only; caller must have selected a new owned fixture. */
export async function seedTrafficPvpFixture(database: Connection): Promise<void> {
  const [identity] = await database.query<RowDataPacket[]>('SELECT DATABASE() AS name');
  if (
    typeof identity[0]?.name !== 'string' ||
    !/^durisweb_qualification_[a-z0-9_]+$/.test(identity[0].name)
  ) {
    throw new Error('Traffic seed requires an owned qualification database');
  }
  const [existing] = await database.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS count FROM pkill_event',
  );
  if (Number(existing[0]?.count) !== 0) {
    throw new Error('Traffic seed requires an empty event store');
  }
  const now = Date.now();
  await database.beginTransaction();
  try {
    for (let start = 0; start < TRAFFIC_PVP_EVENTS; start += 500) {
      const events: (string | number)[][] = [];
      const participants: (string | number)[][] = [];
      for (let index = start; index < Math.min(start + 500, TRAFFIC_PVP_EVENTS); index++) {
        const stamp = new Date(now - (3600 + index * 600) * 1000)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' ');
        events.push([
          index + 1,
          stamp,
          100 + (index % 20),
          `Fixture Valley ${index % 20}`,
          index % 31,
        ]);
        for (let participant = 0; participant < 4; participant++) {
          const player = (index + participant) % 1000;
          const name = `Trafficchar${String(player).padStart(4, '0')}`;
          participants.push([
            index + 1,
            player + 1,
            56,
            participant < 2 ? 'KILLER' : 'VICTIM',
            'synthetic equipment',
            'synthetic combat log',
            1,
            participant % 2,
            `[56 ${player % 2 ? 'Mage' : 'Warrior'}] ${name} (${player % 2 ? 'Orc' : 'Human'})`,
          ]);
        }
      }
      await database.query(
        'INSERT INTO pkill_event(id,stamp,room_vnum,room_name,like_count) VALUES ?',
        [events],
      );
      await database.query(
        'INSERT INTO pkill_info(event_id,pid,level,pk_type,equip,log,inroom,leader,player_description) VALUES ?',
        [participants],
      );
    }
    await database.query(
      'INSERT INTO pkill_event(id,stamp,room_name) VALUES(?,DATE_ADD(NOW(),INTERVAL 1 HOUR),?)',
      [TRAFFIC_PVP_EVENTS + 1, 'Hidden future fixture'],
    );
    await database.commit();
    await database.query('ANALYZE TABLE pkill_event,pkill_info');
  } catch (error) {
    await database.rollback();
    throw error;
  }
}
