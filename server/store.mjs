import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {createState} from '../model.mjs';
import {hashToken,newSessionToken,HttpError} from './auth.mjs';

export function openStore(filename) {
  if(filename!==':memory:') mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
  const db=new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, state TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS bot_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    PRAGMA user_version=1;`);
  const get=id=> {
    const row=db.prepare('SELECT state, revision FROM users WHERE id=?').get(id);
    if(!row) throw new HttpError(404,'Профиль не найден.');
    return {state:JSON.parse(row.state),revision:row.revision};
  };
  return {
    db,
    close:()=>db.close(),
    health:()=>db.prepare('SELECT 1').get(),
    login(user,now=Date.now()) {
      db.prepare('INSERT OR IGNORE INTO users(id,state) VALUES (?,?)').run(user.id,JSON.stringify(createState(user.first_name)));
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
      // Bound active sessions per account, while retaining simultaneous devices.
      db.prepare('DELETE FROM sessions WHERE hash IN (SELECT hash FROM sessions WHERE user_id=? ORDER BY expires_at DESC LIMIT -1 OFFSET 19)').run(user.id);
      const token=newSessionToken();
      db.prepare('INSERT INTO sessions(hash,user_id,expires_at) VALUES (?,?,?)').run(hashToken(token),user.id,now+12*60*60*1000);
      return {token,...get(user.id)};
    },
    userForToken(token,now=Date.now()) {
      if(typeof token!=='string' || !/^[\w-]{43}$/.test(token)) throw new HttpError(401,'Открой приложение заново через бота.');
      const row=db.prepare('SELECT user_id FROM sessions WHERE hash=? AND expires_at>?').get(hashToken(token),now);
      if(!row) throw new HttpError(401,'Время входа истекло. Открой приложение заново через бота.');
      return row.user_id;
    },
    get,
    mutate(id,revision,change) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const current=get(id);
        if(!Number.isSafeInteger(revision) || revision!==current.revision) throw new HttpError(409,'Коллекция изменилась на другом устройстве. Обнови её и повтори действие.');
        const next=change(current.state);
        if(JSON.stringify(next)===JSON.stringify(current.state)) { db.exec('COMMIT'); return current; }
        db.prepare('UPDATE users SET state=?,revision=revision+1 WHERE id=?').run(JSON.stringify(next),id);
        db.exec('COMMIT');
        return {state:next,revision:current.revision+1};
      } catch(error) { db.exec('ROLLBACK'); throw error; }
    },
    getOffset:()=>db.prepare("SELECT value FROM bot_meta WHERE key='offset'").get()?.value||0,
    setOffset:offset=>db.prepare("INSERT INTO bot_meta(key,value) VALUES ('offset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(offset)
  };
}
