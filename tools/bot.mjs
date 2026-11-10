import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {readConfig} from '../server/config.mjs';

export function startMessage(url) {
  return {text:'Добро пожаловать в Лигу сомнительных чемпионов!\n\nСделай маленький подвиг, получи карточку и собери свою витрину. Достижения отмечаешь сам — здесь играют на доверии.',reply_markup:{inline_keyboard:[[{text:'🏆 Открыть Лигу',web_app:{url}}]]}};
}

export function createTelegramClient(token,{fetchImpl=fetch,signal}={}) {
  return async(method,data={})=>{
    let response,body;
    try {
      response=await fetchImpl(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(40000)]):AbortSignal.timeout(40000)});
      body=await response.json();
    } catch {
      if(signal?.aborted) throw new Error('Бот остановлен.');
      throw new Error(`Telegram временно недоступен (${method}).`);
    }
    if(!response.ok || !body.ok) {
      const error=new Error(`Telegram отклонил ${method} (код ${body.error_code||response.status}).`);
      error.code=body.error_code||response.status;
      error.retryAfter=body.parameters?.retry_after;
      throw error;
    }
    return body.result;
  };
}

export function replyForMessage(message,config) {
  if(message?.chat?.type!=='private' || !Number.isSafeInteger(message.from?.id)) return null;
  const match=message.text?.match(/^\/(start|help|id)(?:@([a-zA-Z0-9_]+))?(?:\s|$)/);
  if(!match || (match[2] && config.botUsername && match[2].toLowerCase()!==config.botUsername.toLowerCase())) return null;
  const id=String(message.from.id);
  if(match[1]==='id') return {chat_id:message.chat.id,text:`Твой Telegram ID: ${id}\nПередай его владельцу Лиги, чтобы он добавил тебя в список участников.`};
  if(!config.allowedIds.has(id)) return {chat_id:message.chat.id,text:`Лига пока открыта для друзей.\nТвой Telegram ID: ${id}\nПередай его владельцу и возвращайся после приглашения.`};
  if(match[1]==='help') return {chat_id:message.chat.id,text:'Выбери карточку, выполни условие и отметь подвиг с датой и историей. В профиле можно закрепить три карточки. Прогресс хранится в твоём Telegram-аккаунте Лиги.\n\n/start — открыть Лигу\n/id — узнать свой ID'};
  return {chat_id:message.chat.id,...startMessage(config.miniAppUrl)};
}

export async function prepareBot(config,call) {
  const me=await call('getMe');
  if(config.botUsername && me.username?.toLowerCase()!==config.botUsername.toLowerCase()) throw new Error('BOT_TOKEN принадлежит другому боту. Проверь BOT_USERNAME.');
  const webhook=await call('getWebhookInfo');
  if(webhook.url) throw new Error('У бота уже есть webhook. Он сохранён; сначала выбери способ получения обновлений.');
  await call('setMyCommands',{commands:[{command:'start',description:'Открыть Лигу'},{command:'help',description:'Как собирать карточки'},{command:'id',description:'Мой ID для приглашения'}]});
  await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Открыть Лигу',web_app:{url:config.miniAppUrl}}});
  return me;
}

export async function pollBot(config,call,{signal,getOffset=()=>0,setOffset=()=>{},onPoll=()=>{},onError=()=>{}}={}) {
  let offset=getOffset();
  while(!signal?.aborted) {
    try {
      const updates=await call('getUpdates',{offset,timeout:25,allowed_updates:['message']});
      onPoll();
      for(const update of updates) {
        if(signal?.aborted) return;
        const reply=replyForMessage(update.message,config);
        if(reply) {
          try {await call('sendMessage',reply);} catch(error) {if(![400,403].includes(error.code))throw error;}
        }
        offset=update.update_id+1;setOffset(offset);
      }
    } catch(error) {
      if(signal?.aborted) return;
      // Two long-polling instances must never compete; fail and let the host restart.
      if([401,409].includes(error.code)) throw error;
      onError(error);
      try {await delay(Math.min(60,Math.max(4,Number(error.retryAfter)||4))*1000,undefined,{signal});} catch {return;}
    }
  }
}

async function main() {
  const config=readConfig({...process.env,APP_MODE:'telegram'});
  const controller=new AbortController();
  process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
  const call=createTelegramClient(config.botToken,{signal:controller.signal});
  const me=await prepareBot(config,call);
  console.log(`@${me.username}: бот запущен.`);
  await pollBot({...config,botUsername:me.username},call,{signal:controller.signal,onError:error=>console.error(error.message)});
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
