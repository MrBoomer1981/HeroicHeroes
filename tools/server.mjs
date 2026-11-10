import path from 'node:path';
import {readConfig} from '../server/config.mjs';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {createTelegramClient,prepareBot,pollBot} from './bot.mjs';

async function main() {
  const config=readConfig();
  const store=config.mode==='telegram'?openStore(path.join(config.dataDir,'league.sqlite')):null;
  const controller=new AbortController();
  let lastPoll=Date.now();let server;let closing=false;
  async function stop(code=0) {
    if(closing)return;closing=true;controller.abort();
    if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    store?.close();process.exitCode=code;
  }
  process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
  try {
    let call;
    if(config.runBot) {
      call=createTelegramClient(config.botToken,{signal:controller.signal});
      const me=await prepareBot(config,call);config.botUsername=me.username;
      console.log(`@${me.username}: команды и кнопка запуска настроены.`);
      if(!config.allowedIds.size)console.log('Список участников пуст: вход закрыт. Узнай свой ID командой /id и добавь его в ALLOWED_TELEGRAM_IDS.');
    }
    server=createApp(config,store,{isReady:()=>!closing && (!config.runBot || Date.now()-lastPoll<120000)});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.host,resolve);});
    console.log(`Лига: http://${config.host}:${server.address().port} (${config.mode==='local'?'локальный просмотр':'Telegram'})`);
    if(config.runBot) void pollBot(config,call,{signal:controller.signal,getOffset:store.getOffset,setOffset:store.setOffset,onPoll:()=>{lastPoll=Date.now();},onError:error=>console.error(error.message)}).catch(async error=>{console.error(error.message);await stop(1);});
  } catch(error) {console.error(error.message);await stop(1);}
}
main().catch(()=>{console.error('Не удалось запустить сервер. Проверь переменные окружения.');process.exitCode=1;});
