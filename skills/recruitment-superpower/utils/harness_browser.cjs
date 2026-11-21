// MyFlicker's native CLI owns token storage and request construction. On managed
// macOS networks AccessProxy can require the existing browser login as well.
// Keep that session in Chrome: no cookies, tickets or passwords leave the tab.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const origin = 'https://myflicker.corp.kuaishou.com';
const nativeFetch = globalThis.fetch.bind(globalThis);

async function chrome(source) {
  const script = `tell application "Google Chrome"
repeat with w in windows
repeat with t in tabs of w
if URL of t starts with "${origin}/" then
return execute t javascript ${JSON.stringify(source)}
end if
end repeat
end repeat
error "Open MyFlicker in Chrome and sign in."
end tell`;
  const { stdout } = await run('/usr/bin/osascript', ['-e', script], { timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin !== origin || !url.pathname.startsWith('/budapest/api/v1/')) return nativeFetch(input, init);
  const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
  const options = { method: init.method || 'GET', headers, body: init.body, credentials: 'include', redirect: 'error' };
  const key = '__atsRequest_' + require('node:crypto').randomBytes(16).toString('hex');
  const guard = `if(location.origin!==${JSON.stringify(origin)})throw Error('MyFlicker origin changed');`;
  await chrome(`(()=>{${guard}window.${key}=null;
fetch(${JSON.stringify(url.href)},${JSON.stringify(options)}).then(async r=>{
window.${key}={status:r.status,headers:Object.fromEntries(r.headers.entries()),body:await r.text()};
}).catch(()=>{window.${key}={error:'MyFlicker browser request failed. Sign in again; check the session before repeating a send.'}});return 'started'})()`);
  try {
    for (let i = 0; i < 150; i++) {
      if (init.signal?.aborted) throw new Error('MyFlicker request cancelled; its outcome may be unknown.');
      const result = JSON.parse(await chrome(`(()=>{${guard}return JSON.stringify(window.${key}||null)})()`));
      if (result) {
        if (result.error) throw new Error(result.error);
        return new Response(result.body, { status: result.status, headers: result.headers });
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error('MyFlicker request timed out; check its session before repeating a send.');
  } finally {
    await chrome(`(()=>{${guard}delete window.${key};return 'cleared'})()`).catch(() => {});
  }
};
