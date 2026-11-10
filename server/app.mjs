import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {receiveCard,togglePin} from '../model.mjs';
import {HttpError,verifyInitData} from './auth.mjs';

const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
async function bodyJSON(req) {
  if(!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new HttpError(415,'Нужен JSON.');
  let size=0;const chunks=[];
  for await(const chunk of req) {size+=chunk.length;if(size>16384)throw new HttpError(413,'Слишком большой запрос.');chunks.push(chunk);}
  let data;
  try {data=JSON.parse(Buffer.concat(chunks).toString());} catch {throw new HttpError(400,'Некорректный JSON.');}
  if(!data || typeof data!=='object' || Array.isArray(data)) throw new HttpError(400,'Нужен объект JSON.');
  return data;
}

export function createApp(config,store,{isReady=()=>true}={}) {
  const logins=new Map();
  return http.createServer({requestTimeout:10000,headersTimeout:10000,maxHeaderSize:16384},async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
    try {
      const url=new URL(req.url,'http://local');
      if(url.pathname==='/healthz' && req.method==='GET') {store?.health();return json(res,isReady()?200:503,{ok:isReady()});}
      if(url.pathname==='/api/config' && req.method==='GET') return json(res,200,{mode:config.mode,botUsername:config.botUsername});
      if(url.pathname.startsWith('/api/')) {
        if(config.mode!=='telegram') throw new HttpError(404,'Локальный просмотр не использует серверные аккаунты.');
        if(req.headers.origin && req.headers.origin!==config.miniAppUrl) throw new HttpError(403,'Недопустимый источник запроса.');
        if(url.pathname==='/api/session' && req.method==='POST') {
          const now=Date.now();
          for(const [key,value] of logins) if(now-value.start>60000) logins.delete(key);
          const key=req.socket.remoteAddress;
          const attempts=logins.get(key)||{start:now,count:0};
          attempts.count++;logins.set(key,attempts);
          if(attempts.count>60) throw new HttpError(429,'Слишком много попыток. Подожди минуту.');
          const data=await bodyJSON(req);
          const user=verifyInitData(data.initData,config.botToken);
          if(!config.allowedIds.has(user.id)) throw new HttpError(403,`Лига пока только для друзей. Передай владельцу свой Telegram ID: ${user.id}.`);
          return json(res,200,store.login(user));
        }
        const token=req.headers.authorization?.match(/^Bearer ([\w-]+)$/)?.[1];
        const id=store.userForToken(token);
        if(!config.allowedIds.has(id)) throw new HttpError(403,'Доступ в эту лигу закрыт.');
        if(url.pathname==='/api/state' && req.method==='GET') return json(res,200,store.get(id));
        const claim=url.pathname.match(/^\/api\/cards\/([a-z]+)\/claim$/);
        const pin=url.pathname.match(/^\/api\/pins\/([a-z]+)$/);
        let change;let data;
        if(claim && req.method==='POST') {
          data=await bodyJSON(req);
          if(typeof data.date!=='string' || !data.date) throw new HttpError(400,'Укажи дату подвига.');
          if(typeof data.story!=='string' || data.story.length>400) throw new HttpError(400,'История должна быть не длиннее 400 символов.');
          change=state=>receiveCard(state,claim[1],data.story,data.date);
        } else if(pin && req.method==='PUT') {
          data=await bodyJSON(req);
          if(typeof data.pinned!=='boolean') throw new HttpError(400,'Укажи состояние витрины.');
          change=state=>state.pinned.includes(pin[1])===data.pinned ? state : togglePin(state,pin[1]);
        } else if(url.pathname==='/api/profile' && req.method==='PATCH') {
          data=await bodyJSON(req);
          if(typeof data.owner!=='string' || !data.owner.trim() || data.owner.trim().length>32) throw new HttpError(400,'Имя должно содержать от 1 до 32 символов.');
          change=state=>({...state,owner:data.owner.trim()});
        } else if(url.pathname==='/api/onboarding' && req.method==='POST') {
          data=await bodyJSON(req);change=state=>({...state,onboarded:true});
        } else throw new HttpError(404,'Действие не найдено.');
        let result;
        try {result=store.mutate(id,data.revision,change);} catch(error) {
          if(error instanceof HttpError) throw error;
          // Model validation errors are safe product messages. Database errors are not.
          if(error.code || /sqlite/i.test(error.message)) throw new HttpError(500,'Не удалось сохранить коллекцию. Попробуй ещё раз.');
          throw new HttpError(400,error.message);
        }
        return json(res,200,result);
      }
      if(!['GET','HEAD'].includes(req.method)) throw new HttpError(405,'Метод не поддерживается.');
      let name;
      try {name=decodeURIComponent(url.pathname);} catch {throw new HttpError(400,'Некорректный адрес.');}
      const target=path.resolve(root,'.'+(name==='/'?'/index.html':name));
      if(!target.startsWith(root+path.sep)) throw new HttpError(403,'Доступ закрыт.');
      let data;
      try {if(!(await stat(target)).isFile()) throw new Error();data=await readFile(target);} catch {throw new HttpError(404,'Не найдено.');}
      res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','Content-Length':data.length});
      res.end(req.method==='HEAD'?undefined:data);
    } catch(error) {
      if(!res.headersSent && !res.destroyed) json(res,error.status||500,{error:error.status?error.message:'Сервер временно недоступен. Попробуй ещё раз.'});
    }
  });
}
