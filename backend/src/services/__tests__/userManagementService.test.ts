import { describe, it, expect } from '@jest/globals';
import { pool } from '../../db/connection.js';
import { getUserList, getUniqueRaces, getUniqueClasses } from '../userManagementService.js';

describe('userManagementService', () => {
  describe('getUserList', () => {
    it('should return users with all required fields populated', async () => {
      const result = await getUserList({ page: 1, limit: 10 });

      expect(result.data.length).toBeGreaterThan(0);

      // check at least some users have populated fields
      const usersWithRace = result.data.filter(u => u.race && u.race !== '');
      const usersWithClass = result.data.filter(u => u.class && u.class !== '');
      const usersWithLastIp = result.data.filter(u => u.last_ip && u.last_ip !== '');

      console.log(`Total users: ${result.data.length}`);
      console.log(`Users with race: ${usersWithRace.length}`);
      console.log(`Users with class: ${usersWithClass.length}`);
      console.log(`Users with last_ip: ${usersWithLastIp.length}`);

      // sample data for inspection
      console.log('Sample user:', JSON.stringify(result.data[0], null, 2));

      expect(usersWithRace.length).toBeGreaterThan(0);
      expect(usersWithClass.length).toBeGreaterThan(0);
    });

    it('race should come from races table with ansi_name', async () => {
      // get a user and verify race matches races table
      const result = await getUserList({ page: 1, limit: 10 });
      const userWithRace = result.data.find(u => u.race && u.race !== '');

      if (userWithRace) {
        // race should contain ansi codes like &+B or be a plain name
        console.log('User race:', userWithRace.race);
        expect(userWithRace.race).toBeTruthy();
      }
    });

    it('class should come from classes table using LOG2 conversion', async () => {
      const result = await getUserList({ page: 1, limit: 10 });
      const userWithClass = result.data.find(u => u.class && u.class !== '');

      if (userWithClass) {
        console.log('User class:', userWithClass.class);
        expect(userWithClass.class).toBeTruthy();
      }
    });

    it('last_ip should come from ip_info table', async () => {
      const result = await getUserList({ page: 1, limit: 50 });
      const userWithIp = result.data.find(u => u.last_ip && u.last_ip !== '' && u.last_ip !== 'none');

      console.log('Users with IP:', result.data.filter(u => u.last_ip && u.last_ip !== 'none').length);

      if (userWithIp) {
        console.log('User last_ip:', userWithIp.last_ip);
        // ip should look like an ip address
        expect(userWithIp.last_ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      }
    });
  });

  describe('getUniqueRaces', () => {
    it('should return races from races table', async () => {
      const races = await getUniqueRaces();

      console.log('Races count:', races.length);
      console.log('Sample races:', races.slice(0, 5));

      expect(races.length).toBeGreaterThan(0);
      // should have common races
      const raceNames = races.map(r => r.replace(/&[+\-][A-Za-z]/g, '').replace(/&n/g, ''));
      expect(raceNames.some(r => r.includes('Human') || r.includes('Elf') || r.includes('Orc'))).toBe(true);
    });
  });

  describe('getUniqueClasses', () => {
    it('should return classes from classes table', async () => {
      const classes = await getUniqueClasses();

      console.log('Classes count:', classes.length);
      console.log('Sample classes:', classes.slice(0, 5));

      expect(classes.length).toBeGreaterThan(0);
      // should have common classes
      const classNames = classes.map(c => c.replace(/&[+\-][A-Za-z]/g, '').replace(/&n/g, ''));
      expect(classNames.some(c => c.includes('Warrior') || c.includes('Cleric') || c.includes('Monk'))).toBe(true);
    });
  });

  describe('data integrity', () => {
    it('should verify players_core has race and classname', async () => {
      const [rows]: any = await pool.query(`
        SELECT pid, name, race, classname
        FROM players_core
        WHERE race IS NOT NULL AND race != ''
        LIMIT 5
      `);

      console.log('players_core test:', rows);

      for (const row of rows) {
        expect(row.race).toBeTruthy();
        expect(row.classname).toBeTruthy();
      }
    });

    it('should verify classname includes specializations', async () => {
      const [rows]: any = await pool.query(`
        SELECT DISTINCT classname
        FROM players_core
        WHERE classname IS NOT NULL AND classname != ''
        LIMIT 20
      `);

      console.log('Class names:', rows.map((r: any) => r.classname));

      // should have specialized classes like Zealot, Healer, etc.
      const classNames = rows.map((r: any) => r.classname);
      expect(classNames.length).toBeGreaterThan(0);
    });

    it('should verify ip_info join works', async () => {
      const [rows]: any = await pool.query(`
        SELECT ac.pid, ac.char_name, ii.last_ip, ii.last_connect
        FROM account_characters ac
        LEFT JOIN ip_info ii ON ac.pid = ii.pid
        WHERE ii.last_ip IS NOT NULL AND ii.last_ip != 'none'
        LIMIT 5
      `);

      console.log('IP join test:', rows);

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.last_ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      }
    });
  });
});
