import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS,DEFAULT_STATE,normalizeState,receiveCard,togglePin,filterCards} from '../model.mjs';
const sample=()=>({...structuredClone(DEFAULT_STATE),owned:['started','night','voice'],pinned:['night','started']});
test('Новая коллекция пуста',()=>{assert.deepEqual(DEFAULT_STATE.owned,[]);assert.deepEqual(DEFAULT_STATE.pinned,[]);assert.equal(DEFAULT_STATE.onboarded,false);});
test('Повреждённое сохранение не даёт чужих карточек, дублей и лишних закреплений',()=>{
  const s=normalizeState({version:1,owner:'  Тест  ',owned:['started','night','voice','deadline','x','started'],pinned:['x','started','night','voice','deadline'],stories:{night:123,started:'история',x:'мусор'}});
  assert.deepEqual(s.owned,['started','night','voice','deadline']);assert.deepEqual(s.pinned,['started','night','voice']);assert.deepEqual(s.stories,{started:'история'});assert.equal(s.owner,'Тест');assert.deepEqual(normalizeState(null),DEFAULT_STATE);
});
test('Получение не мутирует состояние и не выдаёт дубль; история сохраняется',()=>{
  const original=sample();const s=receiveCard(original,'deadline','  Сдал!  ','2026-01-01');
  assert.equal(s.owned.length,4);assert.equal(original.owned.length,3);assert.equal(s.stories.deadline,'Сдал!');assert.equal(receiveCard(s,'deadline'),s);
  assert.throws(()=>receiveCard(s,'other'));assert.throws(()=>receiveCard(original,'receipt','', '2999-01-01'));
  assert.throws(()=>receiveCard(original,'receipt','','2026-02-30'));
});
test('Витрина принимает только полученные карточки и максимум три',()=>{
  const s=togglePin(sample(),'voice');assert.equal(s.pinned.length,3);assert.throws(()=>togglePin(s,'deadline'));
  const all=receiveCard(s,'deadline');assert.throws(()=>togglePin(all,'deadline'),/три места/);assert.equal(togglePin(s,'night').pinned.length,2);
});
test('Поиск, редкость и статус работают совместно',()=>{
  assert.equal(filterCards(sample(),{tab:'locked'}).length,2);assert.equal(filterCards(sample(),{rarity:'rare'})[0].id,'night');assert.equal(filterCards(sample(),{query:'ГОЛОС РАЙОНА'})[0].id,'voice');assert.equal(filterCards(sample(),{tab:'locked',rarity:'common'}).length,0);assert.equal(new Set(CARDS.map(c=>c.rarity)).size,5);
});
