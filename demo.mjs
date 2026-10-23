// Public synthetic presentation only. This module must never be imported by staging/production.
const base=new URL('./',import.meta.url);window.__nqDemoBase=base;
const nativeFetch=window.fetch.bind(window),fixture=await (await nativeFetch(new URL('fixtures.json',base))).json();
const portal=location.pathname.includes('/restaurant/')?'restaurant':'admin',identity=portal==='admin'?'admin':'ana';let selected=identity;
const key=u=>{u.searchParams.sort();return u.pathname.slice(u.pathname.indexOf('/api/'))+u.search;};
window.fetch=async(input,init={})=>{const u=new URL(typeof input==='string'?input:input.url??input,location.href),method=(init.method??'GET').toUpperCase();
 if(!u.pathname.includes('/api/')){if(u.origin!==location.origin)return new Response('{}',{status:403});return nativeFetch(input,init);}
 let result,status=200;if(method==='GET'){const p=fixture.profiles[selected];if(!p&&u.pathname.endsWith('/api/session')){result={profile:null,users:Object.entries(fixture.profiles).map(([id,p])=>({id,name:p.session.profile.displayName,role:p.session.profile.role})),mode:'DEMO'};}else if(!p){result={error:'DEMO: elegí de nuevo el portal desde la página principal.'};status=401;}else{result=p.responses[key(u)];if(result===undefined){result={error:'DEMO: esta operación requiere un backend; no se ejecutó ninguna acción real.'};status=409;}}}
 else if(u.pathname.endsWith('/api/session')){const body=JSON.parse(init.body??'{}');if(!['admin','ana'].includes(body.user)){status=403;result={error:'DEMO: perfil no disponible.'};}else{selected=body.user;result=fixture.profiles[selected].session;}}
 else if(u.pathname.endsWith('/api/logout')){selected=null;result={demo:true,message:'Salida de la vista DEMO; no existe sesión Auth real.'};}
 else{status=409;result={error:'DEMO: operación deshabilitada, requiere integración auténtica.'};}
 return new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json'}});
};
const notice=document.createElement('div');notice.setAttribute('role','note');notice.textContent='DEMO · Datos sintéticos · Sin operaciones ni autenticación reales';notice.style.cssText='position:sticky;top:0;z-index:80;background:#101722;color:#e6ba7e;text-align:center;padding:7px;font:12px system-ui';document.body.prepend(notice);
const mark=()=>{for(const el of document.querySelectorAll('button[type="submit"],input[type="password"],input[type="email"]')){el.disabled=true;el.title='DEMO: sin backend ni credenciales reales';}for(const a of document.querySelectorAll('a[href]')){if(/^https?:/.test(a.getAttribute('href'))){a.removeAttribute('href');a.title='Enlace externo deshabilitado en DEMO';}}};new MutationObserver(mark).observe(document.body,{childList:true,subtree:true});mark();
await import(new URL(portal==='admin'?'app.mjs':'premium/app.mjs',base));
