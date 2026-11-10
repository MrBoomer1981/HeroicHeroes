import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';
import {createState} from '../model.mjs';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const script=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function page(t,{fetchImpl,storage}={}) {
  const errors=[];const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error));
  const dom=new JSDOM(html,{url:'https://league.example',runScripts:'outside-only',virtualConsole});
  t.after(()=>dom.window.close());
  const w=dom.window;w.structuredClone=structuredClone;w.AbortSignal=AbortSignal;w.scrollTo=()=>{};
  w.fetch=fetchImpl|| (async()=>({ok:true,json:async()=>({mode:'local'})}));
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.Telegram={WebApp:{initData:'signed-by-test',ready(){},expand(){},isVersionAtLeast:()=>false,BackButton:{show(){},hide(){},onClick(){},offClick(){}}}};
  if(storage)w.localStorage.setItem('questionable-league:local:v2',storage);
  w.eval(script);await tick();
  const $=s=>w.document.querySelector(s);
  const click=async s=>{assert.ok($(s),`Missing ${s}`);$(s).click();await tick();};
  const submit=async s=>{$(s).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();};
  return {w,$,click,submit,errors};
}

test('Интерфейс: знакомство, первая карточка, экранирование истории, витрина и повторное открытие',async t=>{
  const p=await page(t);
  assert.match(p.$('.score-value').textContent,/00\/05/);
  await p.click('[data-action="onboard"]');
  assert.equal(p.$('.welcome-panel'),null);
  await p.click('#card-dialog [data-card="started"]');
  p.$('textarea[name=story]').value='<img src=x onerror=alert(1)> Мой шаг';
  p.$('input[name=date]').value='2026-01-01';
  await p.submit('#claim-form');
  assert.match(p.$('.score-value').textContent,/01\/05/);
  assert.equal(p.$('.detail-story img'),null);assert.match(p.$('.detail-story').textContent,/<img/);
  await p.click('#card-dialog [data-action="pin"]');
  await p.click('#card-dialog [data-action="close"]');
  await p.click('.desktop-nav [data-view="profile"]');
  assert.equal(p.w.document.querySelectorAll('.profile-cards .card-item').length,1);
  const storage=p.w.localStorage.getItem('questionable-league:local:v2');
  const reopened=await page(t,{storage});
  assert.match(reopened.$('.score-value').textContent,/01\/05/);
  assert.equal(reopened.$('.welcome-panel'),null);
  assert.deepEqual(p.errors,[]);assert.deepEqual(reopened.errors,[]);
});

test('Интерфейс: не выдаёт карточку при ошибке сервера, оставляет историю для повторной отправки',async t=>{
  const state={...createState('Друг'),onboarded:true};const calls=[];
  const p=await page(t,{fetchImpl:async(url,options)=>{
    calls.push([url,options]);
    if(url==='/api/config')return {ok:true,json:async()=>({mode:'telegram',botUsername:'HeroicHeroesBot'})};
    if(url==='/api/session')return {ok:true,json:async()=>({token:'test-session',state,revision:0})};
    return {ok:false,status:500,json:async()=>({error:'Не удалось сохранить коллекцию.'})};
  }});
  await p.click('#cards-grid [data-card="started"]');
  p.$('textarea[name=story]').value='Не потерять историю';p.$('input[name=date]').value='2026-01-01';
  await p.submit('#claim-form');
  assert.match(p.$('.score-value').textContent,/00\/05/);
  assert.equal(p.$('textarea[name=story]').value,'Не потерять историю');
  assert.equal(p.$('#claim-form button[type=submit]').disabled,false);
  assert.match(p.$('#toast').textContent,/Не удалось сохранить/);
  assert.equal(calls.at(-1)[1].headers.Authorization,'Bearer test-session');
  assert.equal(p.w.localStorage.length,0);assert.deepEqual(p.errors,[]);
});

test('Интерфейс: ошибка входа не переключает Telegram-пользователя на локальный профиль',async t=>{
  const p=await page(t,{fetchImpl:async url=>url==='/api/config'?{ok:true,json:async()=>({mode:'telegram',botUsername:'HeroicHeroesBot'})}:{ok:false,status:403,json:async()=>({error:'Доступ закрыт.'})}});
  assert.equal(p.$('#cards-grid'),null);assert.match(p.$('#main').textContent,/Доступ закрыт/);
  assert.equal(p.$('#main a').href,'https://t.me/HeroicHeroesBot');
});
