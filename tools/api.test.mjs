import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {readConfig} from '../server/config.mjs';
import {signedData,TEST_TOKEN} from './test-helpers.mjs';

async function fixture(t,{filename=':memory:',mode='telegram'}={}) {
  const config=mode==='telegram'?readConfig({APP_MODE:'telegram',BOT_TOKEN:TEST_TOKEN,MINI_APP_URL:'https://league.example',ALLOWED_TELEGRAM_IDS:'101,202',BOT_USERNAME:'HeroicHeroesBot'}):readConfig({});
  const store=openStore(filename);const server=createApp(config,store);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  let closed=false;
  const close=async()=>{if(closed)return;closed=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();};
  t.after(close);
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(route,{token,method='GET',data,headers={}}={}) {
    const response=await fetch(base+route,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});
    const body=await response.json();return {status:response.status,body};
  }
  const login=async(id=101)=>{const result=await request('/api/session',{method:'POST',data:{initData:signedData(id)}});assert.equal(result.status,200);return result.body;};
  return {request,login,store,config,close,base};
}
test('API: вход закрыт без подписи, по чужому Origin и для посторонних',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/state')).status,401);
  assert.equal((await f.request('/api/session',{method:'POST',data:{initData:'forged'}})).status,401);
  assert.equal((await f.request('/api/session',{method:'POST',data:{initData:signedData(303)}})).status,403);
  assert.equal((await f.request('/api/session',{method:'POST',headers:{Origin:'https://other.example'},data:{initData:signedData()}})).status,403);
  const {token}=await f.login();
  f.config.allowedIds.delete('101');
  assert.equal((await f.request('/api/state',{token})).status,403);
});
test('API: первый вход → история → витрина → профиль; повторный вход и два пользователя',async t=>{
  const f=await fixture(t);let session=await f.login();const token=session.token;
  assert.deepEqual(session.state.owned,[]);assert.equal(session.state.owner,'Глеб');
  const mutate=async(route,method,data)=>{
    const result=await f.request(route,{token,method,data:{revision:session.revision,...data}});
    assert.equal(result.status,200,JSON.stringify(result.body));session=result.body;return result;
  };
  await mutate('/api/onboarding','POST',{});assert.equal(session.state.onboarded,true);
  await mutate('/api/cards/started/claim','POST',{story:'Сделал <первый> шаг',date:'2026-01-01'});
  await mutate('/api/pins/started','PUT',{pinned:true});
  await mutate('/api/profile','PATCH',{owner:'Глеб & друзья'});
  const again=await f.login();assert.deepEqual(again.state,session.state);
  assert.deepEqual((await f.login(202)).state.owned,[]);
  assert.equal(session.state.stories.started,'Сделал <первый> шаг');
  assert.equal((await f.request('/api/profile',{token,method:'PATCH',data:{revision:0,owner:'Устаревшее имя'}})).status,409);
  assert.equal((await f.request('/api/state',{token})).body.state.owner,'Глеб & друзья');
  assert.throws(()=>f.store.userForToken(token,Date.now()+13*3600000),{status:401});
});
test('API: неверная дата, длинная история, неизвестная карточка и четвёртое закрепление не сохраняются',async t=>{
  const f=await fixture(t);let session=await f.login();const token=session.token;
  for(const data of [{story:'',date:'2026-02-30'},{story:'',date:'2999-01-01'},{story:'x'.repeat(401),date:'2026-01-01'},{story:'',date:''}]) {
    assert.equal((await f.request('/api/cards/started/claim',{token,method:'POST',data:{revision:session.revision,...data}})).status,400);
  }
  assert.equal((await f.request('/api/cards/unknown/claim',{token,method:'POST',data:{revision:session.revision,story:'',date:'2026-01-01'}})).status,400);
  for(const id of ['started','night','voice','deadline']) {
    session=(await f.request(`/api/cards/${id}/claim`,{token,method:'POST',data:{revision:session.revision,story:'',date:'2026-01-01'}})).body;
    const pin=await f.request(`/api/pins/${id}`,{token,method:'PUT',data:{revision:session.revision,pinned:true}});
    if(id==='deadline')assert.equal(pin.status,400);else{assert.equal(pin.status,200);session=pin.body;}
  }
  const current=(await f.request('/api/state',{token})).body;
  assert.equal(current.state.pinned.length,3);assert.equal(current.state.owned.length,4);
});
test('SQLite: коллекция и сессия переживают закрытие и повторное открытие файла',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'league-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const filename=path.join(dir,'league.sqlite');
  const first=await fixture(t,{filename});const session=await first.login();
  await first.request('/api/cards/started/claim',{token:session.token,method:'POST',data:{revision:0,story:'Сохранилось',date:'2026-01-01'}});
  first.store.setOffset(123);await first.close();
  const second=await fixture(t,{filename});
  assert.equal((await second.request('/api/state',{token:session.token})).body.state.stories.started,'Сохранилось');
  assert.equal(second.store.getOffset(),123);
});
test('Локальный режим не создаёт аккаунты; секреты и серверные исходники не раздаются',async t=>{
  const f=await fixture(t,{mode:'local'});
  assert.equal((await f.request('/api/config')).body.mode,'local');
  assert.equal((await f.request('/api/session',{method:'POST',data:{initData:signedData()}})).status,404);
  for(const route of ['/.env','/server/store.mjs','/%2e%2e%2fREADME.md'])assert.ok((await fetch(f.base+route)).status>=400);
  assert.equal((await fetch(f.base+'/')).status,200);
  assert.equal((await f.request('/healthz')).status,200);
});
