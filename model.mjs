export const RARITIES = {
  common: {name:'Обычная', symbol:'◆', color:'#dce4d5', subtitle:'Честная печать. С этого всё начинается.'},
  rare: {name:'Редкая', symbol:'◆◆', color:'#c9f77a', subtitle:'Кислотная фольга для неспящих чемпионов.'},
  epic: {name:'Эпическая', symbol:'◆◆◆', color:'#f5a7c2', subtitle:'Подвиг больше не помещается в рамку.'},
  legendary: {name:'Легендарная', symbol:'★', color:'#ffca63', subtitle:'Здесь рамка становится частью подвига.'},
  secret: {name:'Секретная', symbol:'?', color:'#ece8d7', subtitle:'Погодите. Кто положил сюда этот чек?'}
};

export const CARDS = [
  {id:'started', rarity:'common', number:'001', name:'ОН НАЧАЛ', score:61, role:'ПОЛУЗАЩИТНИК НАЧИНАНИЙ', stats:[['СТАРТ',99],['ПЛАН',14],['ПАФОС',98]], condition:'Сделать первый шаг к давно отложенному делу.', short:'Первый шаг к отложенному делу', story:'Три недели выбирал идеальное время. Сегодня просто начал.', quip:'Маленький шаг для человека. Сверхновая для его списка дел.', color:'#7eb6e0'},
  {id:'night', rarity:'rare', number:'002', name:'НОЧНОЙ\nДИРЕКТОР', score:94, role:'КАПИТАН ПОСЛЕ ПОЛУНОЧИ', stats:[['УПОРСТВО',99],['СОН',12],['ЗДРАВЫЙ СМЫСЛ',4]], condition:'Закончить отложенную задачу вечером. Бессонная ночь не требуется.', short:'Разобраться с вечерней задачей', story:'Наконец разобрал папку «разобрать потом». Лампа была моим ассистентом.', quip:'Рабочий день окончен. Его величество настольная лампа так не считает.', color:'#bff776'},
  {id:'voice', rarity:'epic', number:'003', name:'ГОЛОС\nРАЙОНА', score:87, role:'ФОРВАРД ВЫСТУПЛЕНИЙ', stats:[['ГРОМКОСТЬ',97],['СМЕЛОСТЬ',86],['ПАУЗА',3]], condition:'Впервые выступить перед аудиторией и довести речь до конца.', short:'Первое выступление перед людьми', story:'Рассказал о своём проекте. Руки тряслись, но микрофон выжил.', quip:'Хотел сказать пару слов. Теперь у микрофона свой фан-клуб.', color:'#f8a3c0'},
  {id:'deadline', rarity:'legendary', number:'004', name:'ДЕДЛАЙНОЕД', score:98, role:'НАПАДАЮЩИЙ НА ДЕДЛАЙНЫ', stats:[['ФИНИШ',99],['ОТГОВОРКИ',0],['АППЕТИТ',96]], condition:'Завершить личный проект, отложенный хотя бы на месяц, и показать результат.', short:'Закончить и показать свой проект', story:'', quip:'Сначала съел дедлайн. Потом взялся за рамку. Остановите легенду.', color:'#ffca63'},
  {id:'receipt', rarity:'secret', number:'???', name:'БЕЗ\nЛИШНЕГО', score:404, role:'ОШИБКА КАССОВОГО АППАРАТА', stats:[['СПИСОК',100],['ИМПУЛЬС',0],['ПАКЕТ',1]], condition:'Сходить за покупками со списком и купить только то, что в нём.', short:'Купить только то, что в списке', story:'', quip:'Пробил покупки. Не пробил бюджет. Охрана просит автограф.', color:'#e8e5d5'}
];
export const DEFAULT_STATE = {version:2, owner:'Чемпион', owned:[], pinned:[], stories:{}, dates:{}, onboarded:false};

export function createState(owner='Чемпион') {
  return {...structuredClone(DEFAULT_STATE), owner:typeof owner==='string' && owner.trim() ? owner.trim().slice(0,32) : 'Чемпион'};
}

export function normalizeState(raw) {
  const valid = new Set(CARDS.map(c=>c.id));
  if (!raw || ![1,2].includes(raw.version)) return createState();
  const ids = list => [...new Set(Array.isArray(list) ? list.filter(id=>valid.has(id)) : [])];
  const owned = ids(raw.owned);
  const strings = obj=>Object.fromEntries(Object.entries(obj && typeof obj==='object' && !Array.isArray(obj) ? obj : {}).filter(([k,v])=>valid.has(k) && typeof v==='string').map(([k,v])=>[k,v.slice(0,400)]));
  return {version:2, owner:createState(raw.owner).owner, owned, pinned:ids(raw.pinned).filter(id=>owned.includes(id)).slice(0,3), stories:strings(raw.stories), dates:strings(raw.dates), onboarded:raw.onboarded===true || raw.version===1};
}
export function receiveCard(state,id,story='',date='') {
  if (!CARDS.some(c=>c.id===id)) throw new Error('Неизвестная карточка');
  if (state.owned.includes(id)) return state;
  if (typeof story!=='string' || story.length>400) throw new Error('История должна быть короче 400 символов');
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  if (typeof date!=='string' || (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date || date>localToday))) throw new Error('Выбери дату подвига, которая уже наступила');
  return {...state, owned:[...state.owned,id], stories:{...state.stories,[id]:story.trim()}, dates:{...state.dates,[id]:date}, onboarded:true};
}
export function togglePin(state,id) {
  if (!state.owned.includes(id)) throw new Error('Сначала получи карточку');
  if (state.pinned.includes(id)) return {...state,pinned:state.pinned.filter(x=>x!==id)};
  if (state.pinned.length>=3) throw new Error('В витрине три места. Сначала освободи одно.');
  return {...state,pinned:[...state.pinned,id]};
}
export function filterCards(state,{tab='all',rarity='all',query=''}={}) {
  return CARDS.filter(c=>(tab==='owned' ? state.owned.includes(c.id) : tab==='locked' ? !state.owned.includes(c.id) : true) && (rarity==='all' || c.rarity===rarity) && `${c.name} ${c.condition} ${RARITIES[c.rarity].name}`.toLowerCase().replace(/\n/g,' ').includes(query.trim().toLowerCase()));
}
