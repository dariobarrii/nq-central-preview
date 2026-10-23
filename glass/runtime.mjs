// Shared visual primitives only. No domain writes, auth decisions or additional API requests.
import {icon} from '../components.mjs';
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),values=new Map(),charts=new Map(),navPositions=new Map(),activeAnimations=new Set();
let context={portal:'',view:'',tenant:''},lastView='',queued=false,busy=0,installed=false;
const animate=(element,keyframes,options)=>{if(reduced.matches)return null;const animation=element.animate(keyframes,options);activeAnimations.add(animation);animation.finished.catch(()=>{}).finally(()=>{activeAnimations.delete(animation);});return animation;};
function number(element,key){
 const wrapper=element.querySelector('.gl-number');if(wrapper&&element.dataset.value===undefined)return;
 const text=element.dataset.value!==undefined?Number(element.dataset.value).toLocaleString('es-ES'):element.textContent.trim();
 if(!/^[+−-]?[\d.,\s]+%?$/.test(text))return;
 const previous=values.get(key);values.set(key,text);if(values.size>300)values.delete(values.keys().next().value);
 if(wrapper&&wrapper.dataset.value===text)return;
 element.replaceChildren();const visual=document.createElement('span');visual.className='gl-number';visual.dataset.value=text;visual.setAttribute('aria-hidden','true');
 const accessible=document.createElement('span');accessible.className='gl-sr-only';accessible.textContent=text;
 [...text].forEach((char,index)=>{
  if(!/\d/.test(char)){const separator=document.createElement('span');separator.textContent=char;visual.append(separator);return;}
  const window=document.createElement('span');window.className='gl-digit-window';const track=document.createElement('span');track.className='gl-digit-track';const before=document.createElement('span'),after=document.createElement('span');before.textContent=previous?.[index]??'0';after.textContent=char;
  if(reduced.matches||previous===text||previous?.[index]===char){track.append(after);}else{track.append(before,after);animate(track,[{transform:'translateY(0)'},{transform:'translateY(-50%)'}],{duration:600,easing:'cubic-bezier(.16,1,.3,1)',fill:'forwards'});}
  window.append(track);visual.append(window);
 });element.append(visual,accessible);
}
function indicator(nav){
 const active=nav.querySelector('button[aria-current=page],button.active');if(!active)return;
 let capsule=nav.querySelector('.gl-nav-indicator');if(!capsule){capsule=document.createElement('span');capsule.className='gl-nav-indicator';capsule.setAttribute('aria-hidden','true');nav.prepend(capsule);}
 const box=nav.getBoundingClientRect(),target=active.getBoundingClientRect(),x=target.left-box.left,y=target.top-box.top,key=context.portal,previous=navPositions.get(key);
 capsule.style.width=target.width+'px';capsule.style.height=target.height+'px';capsule.style.transform=`translate3d(${x}px,${y}px,0)`;
 if(previous&&Math.abs(previous.x-x)>1&&previous.width===Math.round(box.width))animate(capsule,[{transform:`translate3d(${previous.x}px,${y}px,0)`},{transform:`translate3d(${x+(x-previous.x)*.055}px,${y}px,0)`,offset:.72},{transform:`translate3d(${x}px,${y}px,0)`}],{duration:440,easing:'cubic-bezier(.2,.85,.3,1)'});
 navPositions.set(key,{x,width:Math.round(box.width)});
}
function release(){document.querySelectorAll('.gl-card.is-pressed').forEach(card=>{const start=getComputedStyle(card).transform;card.classList.remove('is-pressed');if(!reduced.matches)animate(card,[{transform:start==='none'?'translateY(3px) scale(.98)':start},{transform:'translateY(-1px) scale(1.003)',offset:.72},{transform:'none'}],{duration:360,easing:'cubic-bezier(.2,.8,.3,1)'});});}
function install(){
 if(installed)return;installed=true;
 const original=window.fetch.bind(window);window.fetch=async(...args)=>{busy++;updateBusy();try{return await original(...args);}finally{busy--;updateBusy();}};
 document.addEventListener('pointerdown',e=>{if(!reduced.matches)e.target.closest('.gl-card')?.classList.add('is-pressed');});
 document.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)&&e.target.matches('button,input,select,textarea')&&!reduced.matches)e.target.closest('.gl-card')?.classList.add('is-pressed');});
 for(const event of ['pointerup','pointercancel','keyup'])document.addEventListener(event,release);window.addEventListener('blur',release);
 window.addEventListener('resize',()=>document.querySelectorAll('.floating-nav,#nav').forEach(indicator));
 reduced.addEventListener('change',()=>{if(reduced.matches){activeAnimations.forEach(a=>a.finish());document.querySelectorAll('.is-pressed').forEach(e=>e.classList.remove('is-pressed'));}});
 new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(context.portal)glass.sync(null,context);});}).observe(document.body,{subtree:true,childList:true,characterData:true});
}
function updateBusy(){document.documentElement.classList.toggle('gl-loading',busy>0);const main=document.querySelector('main');main?.setAttribute('aria-busy',String(busy>0));let bar=document.querySelector('#gl-progress');if(!bar){bar=document.createElement('div');bar.id='gl-progress';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','Cargando datos locales');document.body.prepend(bar);}bar.hidden=busy===0;}
export const glass={
 sync(root,next){
  install();context=next;const viewKey=[next.portal,next.tenant,next.view].join(':'),entering=viewKey!==lastView;lastView=viewKey;
  const scope=root??document.querySelector(next.portal==='admin'?'#app':'main');if(!scope)return;
  const visible=element=>!element.closest('[hidden]')&&(!element.closest('.section')||element.closest('.section').classList.contains('active'));
  const cards=[...scope.querySelectorAll('.panel,.metric,.device,.card,.access-card')].filter(visible);
  cards.forEach((card,index)=>{card.classList.add('gl-card');if(entering)animate(card,[{opacity:0,transform:'translateY(16px)',filter:'blur(5px)'},{opacity:1,transform:'none',filter:'blur(0)'}],{duration:420,delay:Math.min(index,10)*24,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});});
  scope.querySelectorAll('[data-counter],.big,.value,#homeTotal,#statTotal,#pendingCount').forEach((element,index)=>{if(visible(element))number(element,viewKey+':'+(element.dataset.counter||element.id||'index-'+index));});
  scope.querySelectorAll('svg.chart').forEach((svg,index)=>{if(!visible(svg))return;const key=viewKey+':chart:'+(svg.id||index),fingerprint=[...svg.querySelectorAll('polyline,polygon,path[stroke]')].map(p=>p.getAttribute('points')??p.getAttribute('d')).join('|');if(charts.get(key)!==fingerprint){charts.set(key,fingerprint);animate(svg,[{opacity:.35,clipPath:'inset(0 100% 0 0)'},{opacity:1,clipPath:'inset(0 0 0 0)'}],{duration:520,easing:'cubic-bezier(.2,.8,.2,1)'});}});
  document.querySelectorAll('.floating-nav,#nav').forEach(indicator);
 },
 diagnostics:()=>({activeAnimations:activeAnimations.size,reducedMotion:reduced.matches,numberKeys:values.size})
};
export function restaurantPresentation(){
 const nav=document.getElementById('nav'),buttons=new Map([...nav.querySelectorAll('button')].map(b=>[b.dataset.page,b]));
 const settings=document.getElementById('ajustes'),cards=[...settings.children];
 const group=(id,title,nodes,open=false)=>{const details=document.createElement('details');details.className='gl-settings-group';details.id=id;details.open=open;const summary=document.createElement('summary');summary.textContent=title;details.append(summary,...nodes);settings.insertBefore(details,settings.querySelector('.logout-zone'));return details;};
 group('mi-cuenta','Mi cuenta',cards.filter(card=>card.classList.contains('hero')||card.querySelector('h2')?.textContent==='Mi perfil'),true);
 group('avisos','Notificaciones',cards.filter(card=>card.querySelector('h2')?.textContent==='Notificaciones'));
 group('acceso-permisos','Acceso y permisos',cards.filter(card=>card.querySelector('h2')?.textContent==='Mi restaurante'));
 const memberships=document.createElement('p');memberships.id='settingsMemberships';memberships.className='tiny';document.querySelector('#acceso-permisos .card').append(memberships);
 nav.replaceChildren(...['inicio','estadisticas','tarjetas','solicitudes','ajustes'].map(id=>buttons.get(id)));
 for(const [selector,channel] of [['#inicio > .grid > .card:first-child','nfc'],['#inicio > .grid > .card:last-child','qr'],['#statN','nfc'],['#statQ','qr']]){const target=document.querySelector(selector),card=target.closest('.card'),label=card.querySelector('.label');label.classList.add('gl-metric-label');const mark=document.createElement('span');mark.className='metric-icon gl-channel-icon gl-'+channel;mark.innerHTML=icon(channel);label.prepend(mark);}
 const reviews=[...document.querySelectorAll('#inicio > button')].find(b=>b.dataset.originalAction?.includes("go('resenas')"));if(reviews)document.getElementById('journeyCard').append(reviews);
 const count=document.querySelector('#inicio > .grid');count?.classList.add('gl-channel-metrics');
 document.getElementById('heading').setAttribute('tabindex','-1');
}
install();
