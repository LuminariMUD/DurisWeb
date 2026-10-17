import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { webBaselineDirectory } from '../db/webBaselineBundle.js';

/** Run the real current source in a disposable fixture, outside Jest's module loader. */
export function runFixtureWebMigrations(
  port: number,
  database: string,
  options: {
    direction?: 'up' | 'down';
    name?: string;
    loseDdlAcknowledgement?: boolean | 'image' | 'holds' | 'retention';
  } = {},
): void {
  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    [3306, 3307, 13306].includes(port) ||
    !/^durisweb_(?:baseline_engine|qualification)_[a-zA-Z0-9_]+$/.test(database)
  )
    throw new Error('Current migration fixture requires an explicit disposable target');
  const root = path.resolve(webBaselineDirectory(), '../..');
  const script = `
    import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
    const [root,port,database,direction,name,interrupted]=process.argv.slice(1);
    const require=createRequire(root+'/package.json');
    const {WebMigrationSource}=await import(pathToFileURL(root+'/src/db/webMigrationSource.ts').href);
    const connection={host:'127.0.0.1',port:Number(port),database,user:'root',password:''};
    const knex=require('knex')({client:'mysql2',connection,pool:{min:0,max:1},migrations:{migrationSource:new WebMigrationSource(connection)},log:{warn:()=>{},error:()=>{}}});
    const interruption=interrupted==='image'?'synthetic_after_image_ddl':interrupted==='holds'?'synthetic_after_hold_ddl':interrupted==='retention'?'synthetic_after_retention_ddl':'synthetic_after_audit_ddl';
    const ddl=interrupted==='image'?'ALTER TABLE forum_post_images':interrupted==='holds'?(direction==='down'?'DROP TABLE web_data_holds':'CREATE TABLE web_data_holds'):interrupted==='retention'?(direction==='down'?'DROP TABLE web_retention_runs':'CREATE TABLE web_retention_runs'):'ALTER TABLE admin_action_log';
    if(interrupted!=='false'){
      const query=knex.client.query.bind(knex.client);let injected=false;
      knex.client.query=async(connection,request)=>{
        const result=await query(connection,request);
        if(!injected&&request.sql.startsWith(ddl)){injected=true;throw new Error(interruption);}
        return result;
      };
    }
    try{
      try{if(direction==='latest')await knex.migrate.latest();else await knex.migrate[direction]({name});if(interrupted!=='false')throw new Error('DDL interruption was not exercised');}
      catch(error){if(interrupted==='false'||!error.message.includes(interruption))throw error;}
      console.log('Current fixture migrations completed.');
    }
    finally{await knex.destroy();}
  `;
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      script,
      root,
      String(port),
      database,
      options.direction ?? 'latest',
      options.name ?? '',
      String(options.loseDdlAcknowledgement ?? false),
    ],
    { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0 || !result.stdout.includes('Current fixture migrations completed.'))
    throw new Error(`Current fixture migrations failed: ${result.stderr}`);
}
