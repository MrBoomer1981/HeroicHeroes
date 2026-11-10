import test from 'node:test';
import assert from 'node:assert/strict';
import {signedData,TEST_TOKEN} from './test-helpers.mjs';
import {verifyInitData} from '../server/auth.mjs';
import {readConfig} from '../server/config.mjs';

test('Telegram: подписанные поля, Unicode и signature проверяются до чтения пользователя',()=>{
  assert.deepEqual(verifyInitData(signedData(101,{extra:{signature:'signed-field'}}),TEST_TOKEN),{id:'101',first_name:'Глеб'});
  const forged=new URLSearchParams(signedData());forged.set('user',JSON.stringify({id:202,first_name:'Подмена'}));
  assert.throws(()=>verifyInitData(forged.toString(),TEST_TOKEN),{status:401});
  assert.throws(()=>verifyInitData(signedData(),TEST_TOKEN+'other'),{status:401});
});
test('Telegram: старые, будущие, дублирующиеся и повреждённые данные отклоняются',()=>{
  const now=Math.floor(Date.now()/1000);
  for(const data of [signedData(101,{date:now-3601}),signedData(101,{date:now+60}),signedData()+'&user=bad','hash=x',signedData(-1),signedData(101,{extra:{user:'null'}})]) {
    assert.throws(()=>verifyInitData(data,TEST_TOKEN,now),{status:401});
  }
});
test('Production не допускает локальный режим, открытый список или непостоянную БД Railway',()=>{
  assert.equal(readConfig({}).mode,'local');
  assert.throws(()=>readConfig({NODE_ENV:'production',APP_MODE:'local'}));
  assert.throws(()=>readConfig({APP_MODE:'local',HOST:'0.0.0.0'}));
  const env={APP_MODE:'telegram',BOT_TOKEN:TEST_TOKEN,MINI_APP_URL:'https://league.example',ALLOWED_TELEGRAM_IDS:'101,202'};
  assert.equal(readConfig(env).allowedIds.size,2);
  assert.equal(readConfig({...env,ALLOWED_TELEGRAM_IDS:''}).allowedIds.size,0);
  assert.throws(()=>readConfig({...env,ALLOWED_TELEGRAM_IDS:'*'}));
  assert.throws(()=>readConfig({...env,MINI_APP_URL:'http://league.example'}));
  assert.throws(()=>readConfig({...env,RAILWAY_ENVIRONMENT_ID:'test',DATA_DIR:'/data'}));
  assert.equal(readConfig({...env,RAILWAY_ENVIRONMENT_ID:'test',DATA_DIR:'/data',RAILWAY_VOLUME_MOUNT_PATH:'/data'}).dataDir,'/data');
});
