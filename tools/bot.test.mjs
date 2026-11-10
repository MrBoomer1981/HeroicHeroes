import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBot,replyForMessage,pollBot,createTelegramClient} from './bot.mjs';
const config={miniAppUrl:'https://league.example',botUsername:'HeroicHeroesBot',allowedIds:new Set(['101'])};
const message=(id,text)=>({from:{id},chat:{id,type:'private'},text});
test('Бот: кнопка для участника, ID для приглашения, приватные чаты',()=>{
  assert.equal(replyForMessage(message(101,'/start'),config).reply_markup.inline_keyboard[0][0].web_app.url,config.miniAppUrl);
  assert.match(replyForMessage(message(202,'/start'),config).text,/202/);
  assert.equal(replyForMessage(message(202,'/start'),config).reply_markup,undefined);
  assert.match(replyForMessage(message(101,'/id'),config).text,/101/);
  assert.equal(replyForMessage({...message(101,'/start'),chat:{id:1,type:'group'}},config),null);
  assert.equal(replyForMessage(message(101,'/start@OtherBot'),config),null);
});
test('Бот не меняет настройки при чужом токене или существующем webhook',async()=>{
  let calls=[];
  const call=async method=>{calls.push(method);return method==='getMe'?{username:'HeroicHeroesBot'}:{url:'https://existing.example'};};
  await assert.rejects(prepareBot(config,call),/webhook/);
  assert.deepEqual(calls,['getMe','getWebhookInfo']);
  await assert.rejects(prepareBot(config,async()=>({username:'WrongBot'})),/другому/);
});
test('Бот сохраняет offset после ответа и продолжает с него',async()=>{
  const controller=new AbortController();const calls=[];let offset;
  const call=async(method,data)=>{
    calls.push([method,data]);
    if(method==='getUpdates')return [{update_id:44,message:message(101,'/start')}];
    return {};
  };
  await pollBot(config,call,{signal:controller.signal,getOffset:()=>40,setOffset:value=>{offset=value;controller.abort();}});
  assert.equal(calls[0][1].offset,40);assert.equal(calls[1][0],'sendMessage');assert.equal(offset,45);
});
test('Ошибки Telegram не раскрывают токен',async()=>{
  const token='secret-token';
  const call=createTelegramClient(token,{fetchImpl:async()=>{throw new Error(`bad URL ${token}`);}});
  await assert.rejects(call('getMe'),error=>!error.message.includes(token));
});
