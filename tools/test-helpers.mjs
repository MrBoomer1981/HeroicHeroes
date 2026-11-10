import {createHmac} from 'node:crypto';
export const TEST_TOKEN='12345:test-only-not-a-real-bot-token';
export function signedData(id=101,{date=Math.floor(Date.now()/1000),name='Глеб',extra={}}={}) {
  const values={auth_date:String(date),query_id:'test-query',user:JSON.stringify({id,first_name:name}),...extra};
  const check=Object.keys(values).sort().map(key=>`${key}=${values[key]}`).join('\n');
  const secret=createHmac('sha256','WebAppData').update(TEST_TOKEN).digest();
  values.hash=createHmac('sha256',secret).update(check).digest('hex');
  return new URLSearchParams(values).toString();
}
