import {createHmac, timingSafeEqual, randomBytes, createHash} from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status=status; }
}

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData, botToken, now=Math.floor(Date.now()/1000)) {
  const invalid=()=>new HttpError(401,'Не удалось подтвердить вход. Открой приложение заново через бота.');
  if(typeof initData!=='string' || !initData || initData.length>12000 || !botToken) throw invalid();
  const params=new URLSearchParams(initData);
  const seen=new Set();
  for(const [key] of params) { if(seen.has(key)) throw invalid(); seen.add(key); }
  const hash=params.get('hash');
  if(!/^[a-f0-9]{64}$/i.test(hash||'')) throw invalid();
  params.delete('hash');
  params.sort();
  const check=[...params].map(([key,value])=>`${key}=${value}`).join('\n');
  const secret=createHmac('sha256','WebAppData').update(botToken).digest();
  const expected=createHmac('sha256',secret).update(check).digest();
  if(!timingSafeEqual(expected,Buffer.from(hash,'hex'))) throw invalid();
  const authDate=Number(params.get('auth_date'));
  if(!Number.isSafeInteger(authDate) || authDate>now+30 || now-authDate>3600) throw invalid();
  let user;
  try { user=JSON.parse(params.get('user')); } catch { throw invalid(); }
  if(!user || !Number.isSafeInteger(user.id) || user.id<=0 || user.is_bot || typeof user.first_name!=='string') throw invalid();
  return {id:String(user.id),first_name:user.first_name};
}

export const newSessionToken=()=>randomBytes(32).toString('base64url');
export const hashToken=token=>createHash('sha256').update(token).digest('hex');
