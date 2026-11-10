import path from 'node:path';

export function readConfig(env=process.env) {
  const production=env.NODE_ENV==='production' || Boolean(env.RAILWAY_ENVIRONMENT_ID);
  const mode=env.APP_MODE || (production?'telegram':'local');
  if(!['local','telegram'].includes(mode)) throw new Error('APP_MODE: укажи local или telegram.');
  if(production && mode!=='telegram') throw new Error('В production требуется APP_MODE=telegram.');
  const port=Number(env.PORT||4048);
  if(!Number.isInteger(port) || port<0 || port>65535) throw new Error('Некорректный PORT.');
  const host=env.HOST || (production?'0.0.0.0':'127.0.0.1');
  if(mode==='local' && !['127.0.0.1','localhost','::1'].includes(host)) throw new Error('Локальный просмотр доступен только на loopback.');
  const botToken=env.BOT_TOKEN||'';
  const botUsername=(env.BOT_USERNAME||'').replace(/^@/,'');
  if(botUsername && !/^[a-zA-Z0-9_]{5,32}$/.test(botUsername)) throw new Error('Некорректный BOT_USERNAME.');
  const allowedIds=new Set((env.ALLOWED_TELEGRAM_IDS||'').split(',').map(x=>x.trim()).filter(Boolean));
  if([...allowedIds].some(id=>!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id)<=0)) throw new Error('ALLOWED_TELEGRAM_IDS: нужны числовые ID через запятую.');
  let miniAppUrl=env.MINI_APP_URL || (env.RAILWAY_PUBLIC_DOMAIN?`https://${env.RAILWAY_PUBLIC_DOMAIN}`:'');
  if(mode==='telegram') {
    if(!botToken) throw new Error('Укажи BOT_TOKEN в переменных окружения.');
    let url;
    try { url=new URL(miniAppUrl); } catch { throw new Error('Укажи MINI_APP_URL: HTTPS-адрес приложения.'); }
    if(url.protocol!=='https:' || url.username || url.password || url.hash || url.search || url.pathname!=='/') throw new Error('MINI_APP_URL должен быть HTTPS-адресом корня сайта без параметров.');
    miniAppUrl=url.origin;
    if(env.RAILWAY_ENVIRONMENT_ID && env.DATA_DIR!=='/data') throw new Error('В Railway подключи Volume /data и задай DATA_DIR=/data.');
    if(env.RAILWAY_ENVIRONMENT_ID && env.RAILWAY_VOLUME_MOUNT_PATH!=='/data') throw new Error('Для SQLite нужен постоянный Railway Volume. Подключи его в /data.');
  }
  const runBot=env.RUN_BOT==='true';
  if(runBot && mode!=='telegram') throw new Error('RUN_BOT требует APP_MODE=telegram.');
  return {mode,host,port,botToken,botUsername,allowedIds,miniAppUrl,runBot,dataDir:path.resolve(env.DATA_DIR||'data')};
}
