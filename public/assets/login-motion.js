// Decorative motion stays independent of the authentication flow.
import {motionPreferenceKey,motionState} from './login-motion-policy.js?v=2.3.3';

export function initLoginMotion(){
  const canvas=document.querySelector('#entry-particles');
  if(!canvas)return;
  const ctx=canvas.getContext('2d'),page=document.body;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover: hover) and (pointer: fine)');
  let preference='auto';try{preference=motionState(localStorage.getItem(motionPreferenceKey),reduced.matches).preference;}catch{}
  let width=0,height=0,frame=0,last=0,elapsed=0,particles=[],bursts=[];
  const pointer={x:.3,y:.5,targetX:.3,targetY:.5};
  const enabled=()=>motionState(preference,reduced.matches).enabled;
  const stopped=()=>!enabled()||document.hidden;
  const point=(p,t)=>{const u=1-t;return{x:u*u*u*p[0].x+3*u*u*t*p[1].x+3*u*t*t*p[2].x+t*t*t*p[3].x,y:u*u*u*p[0].y+3*u*u*t*p[1].y+3*u*t*t*p[2].y+t*t*t*p[3].y};};
  function resize(){
    width=innerWidth;height=innerHeight;
    if(ctx){
      const ratio=Math.min(devicePixelRatio||1,1.75,Math.sqrt(3000000/(width*height)));
      canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
      const count=Math.min(width<800?26:64,Math.max(22,Math.round(width*height/24000)));
      particles=Array.from({length:count},()=>({x:Math.random()*width,y:Math.random()*height,vx:(Math.random()-.45)*7,vy:-(Math.random()*8+3),size:Math.random()*1.3+.5,phase:Math.random()*Math.PI*2}));
      draw(0);
    }
  }
  function flows(){
    ctx.lineWidth=.65;
    for(let n=0;n<4;n++){
      const offset=n*height*.13,drift=Math.sin(elapsed*.17+n)*height*.035;
      const p=[{x:-width*.12,y:height*.82+offset},{x:width*.25,y:height*.7-offset*.22+drift},{x:width*.48,y:height*.03+offset*.3},{x:width*1.12,y:height*.22+offset}];
      ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);ctx.bezierCurveTo(p[1].x,p[1].y,p[2].x,p[2].y,p[3].x,p[3].y);
      ctx.strokeStyle='rgba(221,119,40,.14)';ctx.stroke();
      if(!enabled())continue;
      const head=((elapsed*.027+n*.24)%1);
      for(let s=0;s<19;s++){
        const t=head-s*.0025;if(t<0)continue;const a=point(p,t),b=point(p,Math.max(0,t-.003));
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=`rgba(255,139,51,${(1-s/19)*.7})`;ctx.lineWidth=1.1;ctx.stroke();
      }
      const tip=point(p,head);ctx.beginPath();ctx.arc(tip.x,tip.y,1.8,0,Math.PI*2);ctx.fillStyle='#ff963f';ctx.fill();
    }
  }
  function draw(delta){
    if(!ctx)return;
    ctx.clearRect(0,0,width,height);flows();
    for(let i=0;i<particles.length;i++){
      const p=particles[i];p.x+=p.vx*delta;p.y+=p.vy*delta;
      if(p.y<-20)p.y=height+20;if(p.x<-20)p.x=width+20;if(p.x>width+20)p.x=-20;
      const dark=width<800?p.y<240:p.x<width*.5122;
      const alpha=(.4+Math.sin(elapsed*.7+p.phase)*.16)*(dark?1:.65);
      ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fillStyle=`rgba(${dark?'255,188,122':'161,98,47'},${alpha})`;ctx.fill();
      if(width<800)continue;
      let links=0;
      for(let j=i+1;j<particles.length&&links<2;j++){
        const q=particles[j],dist=Math.hypot(q.x-p.x,q.y-p.y);if(dist>115)continue;
        ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.lineWidth=.5;ctx.strokeStyle=`rgba(200,132,72,${(1-dist/115)*.2})`;ctx.stroke();links++;
      }
    }
    for(const burst of bursts){
      burst.age+=delta;const fade=1-burst.age/.9;if(fade<=0)continue;
      ctx.beginPath();ctx.arc(burst.x,burst.y,12+burst.age*88,0,Math.PI*2);ctx.strokeStyle=`rgba(226,131,59,${fade*.35})`;ctx.lineWidth=1;ctx.stroke();
      for(let i=0;i<8;i++){const angle=i*Math.PI/4;ctx.beginPath();ctx.arc(burst.x+Math.cos(angle)*burst.age*60,burst.y+Math.sin(angle)*burst.age*60,1.1,0,Math.PI*2);ctx.fillStyle=`rgba(244,163,85,${fade*.65})`;ctx.fill();}
    }
    bursts=bursts.filter(b=>b.age<.9);
  }
  function tick(now){
    if(stopped()){frame=0;return;}
    frame=requestAnimationFrame(tick);if(now-last<32)return;
    const delta=Math.min((now-last)/1000,.06);last=now;elapsed+=delta;
    pointer.x+=(pointer.targetX-pointer.x)*.13;pointer.y+=(pointer.targetY-pointer.y)*.13;
    if(fine.matches){page.style.setProperty('--pointer-x',String((pointer.x-.5)*2));page.style.setProperty('--pointer-y',String((pointer.y-.5)*2));page.style.setProperty('--cursor-x',`${pointer.x*width}px`);page.style.setProperty('--cursor-y',`${pointer.y*height}px`);}
    draw(delta);
  }
  function sync(){
    const active=enabled();
    page.dataset.motionMode=preference;page.dataset.motionPaused=String(!active);page.dataset.pageHidden=String(document.hidden);
    if(stopped()){cancelAnimationFrame(frame);frame=0;draw(0);}else if(!frame){last=performance.now();frame=requestAnimationFrame(tick);}
  }
  window.addEventListener('storage',event=>{if(event.key===motionPreferenceKey||event.key===null){preference=motionState(event.newValue,reduced.matches).preference;sync();}});
  document.addEventListener('visibilitychange',sync);
  reduced.addEventListener('change',sync);
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('pointermove',event=>{
    if(stopped()||!fine.matches||event.pointerType==='touch')return;
    pointer.targetX=event.clientX/width;pointer.targetY=event.clientY/height;page.dataset.pointerActive='true';
  },{passive:true});
  document.documentElement.addEventListener('pointerleave',()=>{pointer.targetX=.5;pointer.targetY=.5;page.dataset.pointerActive='false';});
  document.addEventListener('pointerdown',event=>{
    if(stopped())return;
    bursts.push({x:event.clientX,y:event.clientY,age:0});bursts=bursts.slice(-4);
    const button=event.target.closest('.entry-submit');if(!button||button.disabled)return;
    const bounds=button.getBoundingClientRect(),ripple=document.createElement('span');ripple.className='entry-ripple';ripple.setAttribute('aria-hidden','true');ripple.style.left=`${event.clientX-bounds.left}px`;ripple.style.top=`${event.clientY-bounds.top}px`;button.append(ripple);
    ripple.addEventListener('animationend',()=>ripple.remove(),{once:true});setTimeout(()=>ripple.remove(),1000);
  },{passive:true});
  resize();sync();
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;});
  window.addEventListener('pageshow',sync);
}
