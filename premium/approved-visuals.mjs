// Approved visual helpers. Root scoped to main.shell to exclude local access screen.
// No demo data or demo business actions.
export function elegantArea(series, labels, width=320, height=160){
 const bottom=height-27,top=19,left=17,right=width-13;
 const all=series.flatMap(s=>s.values);const max=Math.max(1,...all)*1.17;
 const x=i=>left+(right-left)*i/Math.max(1,series[0].values.length-1);
 const y=v=>bottom-(v/max)*(bottom-top);
 const smooth=pts=>pts.length?'M '+pts.map(p=>`${p[0]} ${p[1]}`).join(' L '):''; // segmentos rectos, sin curvas Bézier
 let html=`<defs><linearGradient id="elegantGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e6ba7e" stop-opacity=".37"../><stop offset="100%" stop-color="#e6ba7e" stop-opacity="0"../></linearGradient><linearGradient id="elegantBrown" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#99714e" stop-opacity=".24"../><stop offset="100%" stop-color="#99714e" stop-opacity="0"../></linearGradient></defs>`;
 for(let i=0;i<4;i++){let yy=top+(bottom-top)*i/3;html+=`<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" stroke="#4a3829" stroke-opacity=".7" stroke-dasharray="3 5"../>`}
 for(const [idx,s] of [...series].reverse().entries()){
  const pts=s.values.map((v,i)=>[x(i),y(v)]);const path=smooth(pts);const color=s.color||'#e6ba7e';const gradient=s.gradient||'elegantGold';
  html+=`<path d="${path} L ${right} ${bottom} L ${left} ${bottom} Z" fill="url(#${gradient})"../>`;
  html+=`<path d="${path}" fill="none" stroke="${color}" stroke-width="${series.length===1?3.2:2.8}" stroke-linecap="round" stroke-linejoin="round"../>`;
  html+=pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="8" fill="transparent"><title>${labels[i]||i+1} · ${s.name}: ${s.values[i]}</title></circle>`).join('');
 }
 html+=labels.map((t,i)=>`<text x="${x(i)}" y="${height-7}" font-size="9" text-anchor="middle" fill="#bba68c">${t}</text>`).join('');
 return html;
}

export function installApprovedEffects(){
/* V10.11: efectos puramente visuales; no interceptan datos ni acciones de negocio. */
(()=>{
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const root=document.querySelector('main.shell');
 if(!root)return;
 // Pulsación 3D, incluida en tarjetas que se creen dinámicamente.
 root.addEventListener('pointerdown',e=>{
   if(reduced.matches)return;
   const card=e.target.closest('.card');
   if(card&&root.contains(card))card.classList.add('nq-pressed');
 });
 const release=()=>root.querySelectorAll('.card.nq-pressed').forEach(c=>c.classList.remove('nq-pressed'));
 ['pointerup','pointercancel','pointerleave'].forEach(type=>document.addEventListener(type,release));
 window.addEventListener('blur',release);
 // Resaltar números cuando cambia su contenido, sin modificar los valores originales.
 const numberIds=new Set(['homeTotal','homeNfc','homeQr','statTotal','statN','statQ','pendingCount','reviewTotalLive','reviewOpeningLive','reviewChangeLive','reviewGain','journeyStartCount','journeyEndCount']);
 const last=new WeakMap();
 const mark=(el)=>{
   const val=(el.textContent||'').trim();
   if(last.has(el)&&last.get(el)!==val&&!reduced.matches){
     el.classList.remove('nq-number-rolling');
     void el.offsetWidth;
     el.classList.add('nq-number-rolling');
   }
   last.set(el,val);
 };
 numberIds.forEach(id=>{const el=document.getElementById(id);if(el)mark(el)});
 const observer=new MutationObserver(records=>{
   const updated=new Set();
   for(const record of records){
     const el=record.target.nodeType===1?record.target:record.target.parentElement;
     if(!el)continue;
     const candidate=el.closest('[id]');
     if(candidate&&numberIds.has(candidate.id))updated.add(candidate);
   }
   updated.forEach(mark);
 });
 observer.observe(root,{subtree:true,childList:true,characterData:true});
})();



}
