import {setupPlan,loadPlan,renderPlan,clearPlan} from '../plan/ui.mjs';
import {setupReviewsGroups,renderReviewsGroups,loadReviewsGroups,showReviewsGroups} from '../rg/ui.mjs';
import {glass,restaurantPresentation} from '../glass/runtime.mjs';
import {elegantArea,installApprovedEffects} from './approved-visuals.mjs';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pages=['inicio','estadisticas','resenas','tarjetas','solicitudes','cuenta','groups','ajustes'],periods={'Hoy':'1','7 días':'7','30 días':'30','90 días':'90'};
let session=null,data=null,home=null,tenant=null,period='Hoy',homePeriod='Hoy',channel='Ambos',kind='Todos',reviewDays=0,loadVersion=0;
let requestCommand=null,dayCommand=null,orderCommand=null;
let loadedAt=Date.now();
const n=v=>v==null?'—':Number(v).toLocaleString('es-ES',{maximumFractionDigits:2});
const date=stamp=>stamp?new Date(stamp).toLocaleString('es-ES',{timeZone:data.analytics.zone}):'Sin registros';
const feedback=message=>{$('feedback').textContent=message;};
const errors={pending_request:'Ya existe una solicitud abierta para este dispositivo.',already_in_state:'El dispositivo ya tiene ese estado. No se creó una solicitud.',read_only:'Tu membresía permite consultar; no permite solicitar cambios.',close_after_20:'El cierre se habilita desde las 20:00 en la zona del restaurante.',invalid_rating:'Valoración inválida: 1 a 5; si no hay reseñas, debe ser 0.',invalid_total:'El total debe ser un entero no negativo.',duplicate_snapshot:'Ya existe un registro de esta fase para hoy.',reason_required:'Indicá un motivo de entre 3 y 500 caracteres.',tenant_forbidden:'No tenés acceso a este restaurante.',unauthorized:'La sesión local ya no está disponible. Volvé a abrir el acceso de prueba.',timeout:'La respuesta tardó demasiado. Reintentá la misma operación; se conservará su clave.'};
async function api(path,body){
 let res;try{res=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-NQ-CSRF':session?.csrf??''}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000)});}catch(e){throw Error(e.name==='TimeoutError'?'timeout':'network_error');}
 const value=await res.json();if(!res.ok){if(['unauthorized','no_memberships','tenant_forbidden'].includes(value.error)){++loadVersion;data=home=session=null;document.querySelector('main').hidden=true;$('nav').hidden=true;history.replaceState(null,'',new URL('restaurant/',window.__nqDemoBase).href);location.reload();}throw Error(value.error??'local_operation_failed');}return value;
}
function fail(e){feedback(errors[e.message]??'No se pudo completar la operación local ('+e.message+'). Podés volver a intentarlo.');}
function canWrite(){return data.profile.memberships.some(m=>m.tenant===tenant&&['owner','manager'].includes(m.role));}
function greeting(){const stamp=new Date(Date.parse(data.updatedAt)+Date.now()-loadedAt),hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:data.analytics.zone}).format(stamp));const name=data.profile.displayName.split(/\s+/)[0];return '¡'+(hour>=5&&hour<12?'Buenos días':hour>=12&&hour<20?'Buenas tardes':'Buenas noches')+', '+name+'!';}
function go(page,{scroll=true}={}){
 if(page==='mi-plan'||page==='ajustes/mi-plan'){page='ajustes';document.getElementById('mi-plan').open=true;}if(['cuenta','mi-cuenta','ajustes/mi-cuenta'].includes(page)){page='ajustes';document.getElementById('mi-cuenta').open=true;}if(page==='groups'&&!data?.rgAvailability?.enabled)page='inicio';if(!pages.includes(page))page='inicio';document.querySelectorAll('.section').forEach(el=>el.classList.toggle('active',el.id===page));
 document.querySelectorAll('#nav button').forEach(el=>{el.classList.toggle('active',el.dataset.page===(page));el.setAttribute('aria-current',el.dataset.page===(page)?'page':'false');});
 $('heading').textContent=page==='inicio'?greeting():{estadisticas:'Estadísticas',resenas:'Reseñas',groups:'NQ Groups',tarjetas:'Mis tarjetas',solicitudes:'Solicitudes',ajustes:'Ajustes',cuenta:'Mi cuenta'}[page];
 showReviewsGroups(page);if(page==='ajustes/mi-plan'){page='ajustes';}history.replaceState(null,'','#'+page);glass.sync(document.querySelector('main'),{portal:'restaurant',view:page,tenant:tenant??'all'});if(scroll)window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
function state(kind,value){const s=data.states[kind]?.[value];if(!s)return '<span class="state-pill state-neutral">Estado pendiente de contrato</span>';return '<span class="state-pill state-'+({green:'active',sky:'pending',red:'denied',neutral:'neutral'}[s.color])+'">'+esc(s.label)+'</span>';}
function chart(id,rows,channels=['NFC','QR']){
 const series=channels.map(c=>({name:c,values:rows.map(r=>r[c]),color:c==='NFC'?'#e6ba7e':'#99714e',gradient:id+c}));
 $(id).innerHTML=rows.length?elegantArea(series,rows.map((r,i)=>i%Math.max(1,Math.ceil(rows.length/7))===0?(r.label??r.day.slice(5)):''),320,id==='homeChart'?170:160).replaceAll('id="elegantGold"','id="'+id+'NFC"').replaceAll('id="elegantBrown"','id="'+id+'QR"'):'';
 $(id).setAttribute('aria-label','Actividad local ficticia: '+channels.join(' y '));
}
function activityRows(snapshot,selectedPeriod){
 if(selectedPeriod!=='Hoy')return snapshot.analytics.chart;
 const format=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:snapshot.analytics.zone}),hour=Number(format.format(new Date(snapshot.updatedAt)));
 return Array.from({length:hour+1},(_,i)=>{const rows=snapshot.analytics.events.filter(e=>Number(format.format(new Date(e.at)))===i);return {label:i+'h',NFC:rows.filter(e=>e.channel==='NFC').length,QR:rows.filter(e=>e.channel==='QR').length};});
}
async function refresh(){
 const version=++loadVersion,selected=tenant;clearPlan();
 $('refresh').disabled=true;$('updated').textContent='Cargando datos locales…';
 try{
  // Separate snapshots avoid relabelling 30-day values as today's totals.
  const values=await Promise.all([api('../api/state?tenant='+encodeURIComponent(selected)+'&period='+periods[period]),api('../api/state?tenant='+encodeURIComponent(selected)+'&period='+periods[homePeriod])]);
  if(version!==loadVersion)return;[data,home]=values;await loadReviewsGroups({tenant:selected,api,version,valid:()=>version===loadVersion});if(version!==loadVersion)return;data.rgAvailability=renderReviewsGroups({data,session,api,go,feedback});await loadPlan({tenant:selected,valid:()=>version===loadVersion});if(version!==loadVersion)return;renderPlan({data,session,go,feedback});loadedAt=Date.now();render();
 }catch(e){if(version!==loadVersion)return;document.querySelector('main').hidden=true;$('nav').hidden=true;$('access').hidden=false;$('accessError').textContent=errors[e.message]??'No se pudieron cargar los datos locales. Reintentá desde este acceso.';throw e;}
 finally{if(version===loadVersion)$('refresh').disabled=false;}
}
function render(){
 $('access').hidden=true;document.querySelector('main').hidden=false;$('nav').hidden=false;
 $('tenant').innerHTML=data.businesses.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('');$('tenant').value=tenant;
 document.querySelector('header .label').textContent=data.business.name+' · Perfil local de prueba';
 $('updated').textContent='Actualizado: '+date(data.updatedAt)+' · '+data.analytics.zone;
 const today=home.analytics.windows[1],cmp=home.analytics.comparisons.total;
 $('homeTotal').textContent=n(today.total);document.querySelector('#inicio .hero .pill').textContent='● Local ficticio';
 document.querySelector('#inicio .hero .green').textContent=cmp.arrow+' '+(cmp.percent==null?'Sin base previa':n(cmp.percent)+'%')+' frente a ayer a la misma hora';
 const parts=document.querySelectorAll('#inicio .hero .tiny span');parts[0].textContent=n(today.NFC)+' NFC';parts[1].textContent=n(today.QR)+' QR';document.querySelector('#inicio .hero .fill').style.width=(today.total?100*today.NFC/today.total:0)+'%';
 const values=document.querySelectorAll('#inicio > .grid .value');values[0].textContent=n(today.NFC);values[1].textContent=n(today.QR);
 $('homeNfc').textContent=n(home.analytics.selected.NFC);$('homeQr').textContent=n(home.analytics.selected.QR);chart('homeChart',activityRows(home,homePeriod));
 const recent=document.querySelector('#inicio > .card:last-of-type');recent.innerHTML='<h2>Actividad reciente</h2>'+home.analytics.events.slice(0,5).map(e=>'<div class="item row"><span>'+esc(home.analytics.cards.find(c=>c.id===e.cardId)?.name)+' · '+esc(e.channel)+'</span><span class="muted tiny">'+esc(date(e.at))+'</span></div>').join('');if(!home.analytics.events.length)recent.innerHTML+='<p>Sin interacciones en este período.</p>';
 const a=data.analytics;$('statN').textContent=n(a.selected.NFC);$('statQ').textContent=n(a.selected.QR);$('statTotal').textContent=n(channel==='Ambos'?a.selected.total:a.selected[channel]);$('periodLabel').textContent=period;
 $('statChange').textContent=period==='Hoy'?(a.comparisons.total.percent==null?'Sin base previa':n(a.comparisons.total.percent)+'%'):'—';$('comparison').textContent=period==='Hoy'?'Frente a ayer a la misma hora · zona del restaurante':'Comparación con período anterior pendiente de contrato; no se estima.';
 chart('chart',activityRows(data,period),channel==='Ambos'?['NFC','QR']:[channel]);$('ranking').innerHTML=a.cards.filter(c=>channel==='Ambos'||c.channel===channel).map((c,i)=>'<div class="item row"><span>'+n(i+1)+'. '+esc(c.name)+' · '+esc(c.channel)+'</span><strong>'+n(c.count)+'</strong></div>').join('')||'<p>Sin dispositivos.</p>';
 document.querySelector('#estadisticas .badge').textContent='Local ficticio';document.querySelector('#inicio .card .badge')?.replaceChildren(document.createTextNode('Local ficticio'));
 renderDay();renderDevices();renderRequests();renderProfile();go(location.hash.slice(1)||'inicio',{scroll:false});
}
function renderDay(){
 const d=data.day,opening=d.opening,closing=d.closing,latest=d.latest;
 $('journeyStatus').className='';$('journeyStatus').innerHTML=state('day',closing?'closed':opening?'open':'missing');$('journeySubtitle').textContent='Registro manual · '+d.day+' · '+d.zone;
 $('journeySummary').classList.toggle('hide',!opening);$('journeyStartCount').textContent=n(opening?.total);$('journeyStartRating').textContent='Valoración: '+n(opening?.rating);$('journeyEndCount').textContent=n(closing?.total);$('journeyEndRating').textContent='Valoración: '+n(closing?.rating);$('journeyResult').classList.toggle('hide',!closing);$('journeyDelta').textContent=n(d.net);$('journeyRatingDelta').textContent=closing?n(closing.rating-opening.rating):'—';
 $('journeyAction').textContent=closing?'Jornada cerrada':opening?'Cerrar jornada':'✳ Iniciar jornada';$('journeyAction').disabled=!canWrite()||!!closing||!!opening&&!d.canClose;
 $('journeyHint').textContent='Hora del servidor local: '+d.serverLocalTime+'. Cierre desde las 20:00 en '+d.zone+'. Fuente manual; no se verifica Google.';
 $('reviewTotalLive').textContent=n(latest?.total);$('reviewRatingLive').textContent=n(latest?.rating);$('reviewOpeningLive').textContent=n(opening?.total);$('reviewOpeningRating').textContent='Valoración: '+n(opening?.rating);$('reviewChangeLive').textContent=n(d.net);$('reviewClosingRating').textContent=closing?'Variación: '+n(d.percent)+'% · Valoración: '+n(closing.rating):'Pendiente de cierre';
 $('reviewSourceNotice').textContent=latest?'Fuente manual local ficticia · '+date(latest.at)+' · Usuario: '+latest.actor:'Sin datos manuales registrados. Iniciá una jornada desde Inicio.';
 $('reviewStartDetail').textContent=date(opening?.at);$('reviewEndDetail').textContent=date(closing?.at);$('reviewStartRatingDetail').textContent=n(opening?.rating);$('reviewEndRatingDetail').textContent=n(closing?.rating);$('reviewRatingChangeDetail').textContent=closing?n(closing.rating-opening.rating):'—';
 const cutoff=new Date(data.updatedAt);cutoff.setUTCDate(cutoff.getUTCDate()-reviewDays);
 const rows=d.history.filter(r=>reviewDays?Date.parse(r.at)>=+cutoff:r.day===d.day).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 $('reviewPeriodLabel').textContent=reviewDays?reviewDays+' días':'Hoy';$('reviewGain').textContent=rows.some(r=>r.phase==='close')?n(rows.filter(r=>r.phase==='close').reduce((sum,r)=>sum+r.net,0)):'—';
 $('reviewChart').innerHTML=rows.length>1?elegantArea([{name:'Reseñas manuales',values:rows.map(r=>r.total),gradient:'reviewManual',color:'#e6ba7e'}],rows.map(r=>r.day.slice(5)),320,160).replaceAll('id="elegantGold"','id="reviewManual"'):'';
 $('reviewChartHint').textContent=rows.length>1?'Solo puntos manuales registrados; no son reseñas verificadas ni interacciones NFC/QR.':'Sin registros suficientes. No se inventan puntos intermedios.';
 $('reviewHistory').innerHTML='<h2>Historial manual</h2>'+([...d.history].reverse().map(r=>'<div class="item"><strong>'+esc(r.phase==='open'?'Inicio':'Cierre')+' · '+n(r.total)+'</strong><p>'+esc(date(r.at))+' · '+esc(r.actor)+' · '+esc(r.zone)+'</p><div class="tiny">Valoración '+n(r.rating)+' · Fuente manual local</div></div>').join('')||'<p>Todavía no hay jornadas.</p>');
}
function renderDevices(){
 const cards=data.analytics.cards;$('deviceTotal').textContent=n(cards.length);$('deviceSummary').textContent=n(cards.filter(c=>c.channel==='NFC').length)+' NFC · '+n(cards.filter(c=>c.channel==='QR').length)+' QR';
 $('devices').innerHTML=cards.filter(c=>kind==='Todos'||c.channel===kind).map(c=>{const request=data.requests.filter(r=>r.cardId===c.id).at(-1);return '<div class="card"><div class="row"><div><div class="card-name">'+esc(c.name)+' · '+esc(c.channel)+'</div><p class="tiny">ID: '+esc(c.id)+' · '+n(c.count)+' interacciones · '+esc(period)+'</p></div>'+state('card',c.state)+'</div><p class="tiny">Última utilización: '+esc(date(c.last))+'</p>'+(request?'<div class="device-request-line"><span class="tiny muted">Estado de solicitud</span>'+state('request',request.state)+'</div>':'')+(canWrite()&&!['replaced','revoked'].includes(c.state)?'<button class="btn secondary full" data-card="'+esc(c.id)+'">Solicitar cambio</button>':'')+'</div>';}).join('')||'<p>Sin dispositivos en este filtro.</p>';
 $('reqDevice').innerHTML=cards.filter(c=>!['replaced','revoked'].includes(c.state)).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+' · '+esc(c.channel)+'</option>').join('');
 document.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>{go('solicitudes');$('reqDevice').value=b.dataset.card;$('newRequest').classList.remove('hide');requestCommand=null;});
}
function renderRequests(){
 const rows=[...data.requests,...data.orders];$('pendingCount').textContent=n(rows.filter(r=>['pending','review','approved'].includes(r.state)).length);
 $('requests').innerHTML=rows.map(r=>'<div class="item"><div class="row"><strong>'+esc(r.kind==='additional'?'Nuevos '+r.channel+' · '+r.quantity:{activate:'Activación',deactivate:'Desactivación',replace:'Reemplazo'}[r.action])+'</strong>'+state('request',r.state)+'</div><p>'+esc(data.analytics.cards.find(c=>c.id===r.cardId)?.name??'Nuevos dispositivos')+'</p><div class="tiny muted">'+esc(r.reason)+'<br>ID: '+esc(r.id)+'<br>'+esc(date(r.requestedAt??r.at))+'</div></div>').join('')||'<p>No hay solicitudes registradas.</p>';
 $('newRequestToggle').disabled=!canWrite();$('additionalToggle').disabled=!canWrite();$('sendRequest').disabled=!canWrite()||!$('reqDevice').options.length;
}
function renderProfile(){
 const p=data.profile;$('settingsMemberships').textContent='Estado local: '+p.status+' · Restaurantes y permisos: '+p.memberships.map(m=>(data.businesses.find(b=>b.id===m.tenant)?.name??m.tenant)+' ('+m.role+')').join(' · ');$('profileDisplay').textContent=p.displayName;$('profileName').value=p.displayName;$('profileEmail').value=p.email;$('profileEmailDisplay').textContent=p.email;$('profileSymbol').textContent=p.displayName.split(/\s+/).slice(0,2).map(s=>s[0]).join('');
 $('businessName').textContent=data.business.name;$('businessDevices').textContent=n(data.analytics.cards.length);$('businessRole').textContent=p.memberships.find(m=>m.tenant===tenant)?.role??'Sin membresía';
 document.querySelectorAll('.switch').forEach(box=>box.checked=p.notifications);$('notificationHint').textContent='Preferencia global guardada localmente. La separación por categoría y el envío externo siguen pendientes.';
}
async function command(button,body,onSuccess){
 button.disabled=true;feedback('Guardando en el laboratorio local…');
 try{await api('../api/action',body);await refresh();onSuccess?.();feedback('Guardado en la base local de datos ficticios.');}catch(e){fail(e);}finally{button.disabled=false;}
}
function bind(){
 // The approved inline demo handlers are metadata only; none are evaluated.
 document.querySelectorAll('[data-original-action]').forEach(b=>{const action=b.dataset.originalAction;if(action.startsWith("go('")){const page=action.match(/go\('([^']+)'\)/)?.[1];b.onclick=()=>go(page);}});
 document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));
 $('tenant').onchange=async()=>{tenant=$('tenant').value;requestCommand=dayCommand=orderCommand=null;$('newRequest').classList.add('hide');$('journeyForm').classList.add('hide');$('additionalForm').classList.add('hide');try{await refresh();feedback('Restaurante local actualizado.');}catch(e){fail(e);}};
 $('refresh').onclick=()=>refresh().then(()=>feedback('Datos locales actualizados.')).catch(fail);
 for(const [selector,fn] of [['[data-period]',async b=>{period=b.dataset.period;await refresh();}],['[data-home-period]',async b=>{homePeriod=b.dataset.homePeriod;await refresh();}],['[data-channel]',b=>{channel=b.dataset.channel;render();}],['[data-kind]',b=>{kind=b.dataset.kind;renderDevices();}],['[data-review]',b=>{reviewDays=Number(b.dataset.review);renderDay();}]])document.querySelectorAll(selector).forEach(b=>b.onclick=async()=>{document.querySelectorAll(selector).forEach(x=>x.classList.toggle('active',x===b));try{await fn(b);}catch(e){fail(e);}});
 $('customToggle').onclick=()=>$('custom').classList.toggle('hide');$('custom').innerHTML='<div class="notice">El contrato actual admite Hoy, 7, 30 y 90 días. La consulta por fechas personalizadas está pendiente; no se mostrarán cifras inventadas.</div>';
 $('copyReport').onclick=async()=>{try{await navigator.clipboard.writeText('NQ · Datos ficticios locales\n'+data.business.name+' · '+period+'\nNFC: '+data.analytics.selected.NFC+'\nQR: '+data.analytics.selected.QR);feedback('Resumen local copiado.');}catch{feedback('El navegador no permitió copiar. NFC '+data.analytics.selected.NFC+' · QR '+data.analytics.selected.QR);}};
 $('newRequestToggle').onclick=()=>$('newRequest').classList.toggle('hide');
 $('sendRequest').onclick=()=>{const raw={op:'request',tenant,cardId:$('reqDevice').value,action:$('reqType').value,reason:$('reqReason').value.trim()};if(raw.reason.length<3)return feedback('Indicá un motivo de entre 3 y 500 caracteres.');const fingerprint=JSON.stringify(raw);if(requestCommand?.fingerprint!==fingerprint)requestCommand={fingerprint,key:crypto.randomUUID()};command($('sendRequest'),{...raw,key:requestCommand.key},()=>{$('newRequest').classList.add('hide');$('reqReason').value='';requestCommand=null;});};
 $('journeyAction').onclick=()=>{dayCommand=null;$('journeyForm').classList.remove('hide');$('journeyFormTitle').textContent=data.day.opening?'Cerrar jornada':'Iniciar jornada';$('journeyCountInput').value='';$('journeyRatingInput').value='';};$('journeyCancel').onclick=()=>$('journeyForm').classList.add('hide');
 $('journeySave').onclick=()=>{const totalText=$('journeyCountInput').value.trim(),ratingText=$('journeyRatingInput').value.trim().replace(',','.');if(!/^\d+$/.test(totalText)||!/^\d+(\.\d+)?$/.test(ratingText))return feedback('Completá total entero y valoración numérica. Si hay cero reseñas, la valoración es 0.');const raw={op:data.day.opening?'day_close':'day_open',tenant,total:Number(totalText),rating:Number(ratingText)};const fingerprint=JSON.stringify(raw);if(dayCommand?.fingerprint!==fingerprint)dayCommand={fingerprint,key:crypto.randomUUID()};command($('journeySave'),{...raw,key:dayCommand.key},()=>{$('journeyForm').classList.add('hide');dayCommand=null;});};
 $('saveProfile').onclick=()=>command($('saveProfile'),{op:'profile',name:$('profileName').value.trim(),key:crypto.randomUUID()});
 document.querySelectorAll('.switch').forEach(box=>box.onchange=()=>command(box,{op:'notifications',enabled:box.checked,key:crypto.randomUUID()}));
 $('logoutButton').onclick=()=>$('pendingLogout').showModal();$('closeLogout').onclick=()=>$('pendingLogout').close();
 $('additionalToggle').onclick=()=>$('additionalForm').classList.toggle('hide');$('sendOrder').onclick=()=>{const raw={op:'order',tenant,channel:$('orderChannel').value,quantity:Number($('orderQuantity').value),reason:$('orderReason').value.trim()};if(raw.reason.length<3)return feedback('Indicá un motivo para los nuevos dispositivos.');const fingerprint=JSON.stringify(raw);if(orderCommand?.fingerprint!==fingerprint)orderCommand={fingerprint,key:crypto.randomUUID()};command($('sendOrder'),{...raw,key:orderCommand.key},()=>{$('additionalForm').classList.add('hide');orderCommand=null;});};
 document.querySelector('main').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&!matchMedia('(prefers-reduced-motion: reduce)').matches)e.target.closest('.card')?.classList.add('nq-pressed');});document.addEventListener('keyup',()=>document.querySelectorAll('.nq-pressed').forEach(e=>e.classList.remove('nq-pressed')));
 window.addEventListener('hashchange',()=>{if(data)go(location.hash.slice(1));});
}
function enhanceMarkup(){
 // Keep approved layout; identify previously hardcoded display fields.
 const cards=document.querySelector('#tarjetas .hero');cards.querySelector('.big').id='deviceTotal';cards.querySelector('.badge').id='deviceSummary';
 const settings=$('ajustes');settings.querySelector('.symbol').id='profileSymbol';settings.querySelector('.hero p').id='profileEmailDisplay';settings.querySelector('input[disabled]').id='profileEmail';
 const business=Array.from(settings.querySelectorAll('.card')).find(c=>c.querySelector('h2')?.textContent==='Mi restaurante');business.querySelector('.item span').id='businessName';business.querySelectorAll('strong')[0].id='businessDevices';business.querySelectorAll('strong')[1].id='businessRole';settings.querySelector('.switch').closest('.card').querySelector('p').id='notificationHint';
 $('reviewHistory')?.remove();$('resenas').insertAdjacentHTML('beforeend','<div class="card" id="reviewHistory"></div>');
 const actionButtons=Array.from(document.querySelectorAll('[data-original-action]'));const identify=(id,part)=>{const b=actionButtons.find(b=>b.dataset.originalAction.includes(part));if(b)b.id=id;};
 identify('customToggle',"getElementById('custom')");identify('copyReport','copyReport()');identify('newRequestToggle',"getElementById('newRequest')");identify('sendRequest','createRequest()');identify('saveProfile','saveProfile()');
 $('reqType').innerHTML='<option value="activate">Activación</option><option value="deactivate">Desactivación</option><option value="replace">Reemplazo</option>';$('reqReason').maxLength=500;
 $('solicitudes').insertAdjacentHTML('beforeend','<button class="btn secondary full" id="additionalToggle">Solicitar nuevos dispositivos</button><div class="card hide" id="additionalForm"><h2>Nuevos dispositivos</h2><label for="orderChannel">Tipo</label><select id="orderChannel"><option>NFC</option><option>QR</option></select><label for="orderQuantity">Cantidad (1 a 20)</label><input id="orderQuantity" type="number" min="1" max="20" step="1" value="1"><label for="orderReason">Motivo</label><textarea id="orderReason" maxlength="500"></textarea><p class="tiny">Solo NQ Central puede aprobar y ejecutar la entrega. No emite credenciales reales.</p><button class="btn full" id="sendOrder">Enviar solicitud local</button></div>');
 // Associate approved labels with fields without changing their visual presentation.
 document.querySelectorAll('label').forEach((label,i)=>{if(label.htmlFor)return;const field=label.nextElementSibling;if(field?.matches('input,select,textarea')){field.id ||= 'field-'+i;label.htmlFor=field.id;}});
 document.querySelectorAll('.switch').forEach((box,i)=>box.setAttribute('aria-label',['Actividad NFC/QR','Informes de rendimiento','Estado de solicitudes'][i]));
}
async function access(){
 session=await api('../api/session');
 if(session.profile?.role==='restaurant'){
  tenant=session.profile.memberships[0]?.tenant;if(!tenant)throw Error('tenant_forbidden');await refresh();return;
 }
 if(session.profile?.role==='admin'){$('profiles').innerHTML='<p>Hay un perfil administrativo local abierto. Esta pantalla está reservada a restaurantes.</p><a href="../admin/">Abrir NQ Central Admin local</a>';return;}
 $('profiles').innerHTML=session.users.filter(u=>u.role==='restaurant').map(u=>'<button class="btn full profile-choice" data-user="'+esc(u.id)+'">Abrir perfil ficticio · '+esc(u.name)+'</button>').join('')+'<p><a href="../admin/">NQ Central Admin · laboratorio existente</a></p>';
 document.querySelectorAll('[data-user]').forEach(b=>b.onclick=async()=>{try{session=await api('../api/session',{user:b.dataset.user});tenant=session.profile.memberships[0]?.tenant;await refresh();}catch(e){$('accessError').textContent=errors[e.message]??e.message;}});
}
enhanceMarkup();restaurantPresentation();setupReviewsGroups();setupPlan();bind();access().catch(e=>{$('accessError').textContent=errors[e.message]??e.message;});
setInterval(()=>{if(data&&$('inicio').classList.contains('active'))$('heading').textContent=greeting();},60000);

const switchFixture=document.createElement('button');switchFixture.id='switch-fixture';switchFixture.className='btn secondary full';switchFixture.textContent='Cambiar perfil de laboratorio';document.getElementById('localMode').append(switchFixture);switchFixture.onclick=async()=>{try{await api('../api/logout',{});data=home=session=null;++loadVersion;document.querySelector('main').hidden=true;document.getElementById('nav').hidden=true;history.replaceState(null,'',new URL('admin/',window.__nqDemoBase).href);location.reload();}catch(e){fail(e);}};
