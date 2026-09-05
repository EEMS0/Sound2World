import { WorldEngine } from '../src/world-engine.js?v=1.0.0';
const world=new WorldEngine(document.getElementById('world'));
world.loadDNA('SW1-MOSS-7F920A31');world.setQuality('HIGH');
let profile='AMBIENT',clock=0,last=performance.now(),lastUI=0,rebuildResult='';
function pose(x,z){world.rig.mode='explore';world.rig.enabled=false;world.camera.position.set(x,world.heightAt(x,z)+4.6,z);world.camera.lookAt(0,3.8,0);}
pose(0,21);
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{const a=+button.dataset.view*Math.PI/2;pose(Math.sin(a)*21,Math.cos(a)*21);});
document.getElementById('edge').onclick=()=>{const tree=world.colliders[0];if(tree)pose(tree.x+2,tree.z+2);};
document.getElementById('theme').onchange=e=>{world.setTheme(+e.target.value);pose(0,21);};
document.getElementById('profile').onchange=e=>{profile=e.target.value;};
document.getElementById('quality').onchange=e=>world.setQuality(e.target.value);
document.getElementById('rebuild').onclick=async e=>{
  e.target.disabled=true;const before={...world.renderer.info.memory};
  for(let i=0;i<12;i++){world.regenerate(false);pose(0,21);await new Promise(requestAnimationFrame);}
  const after=world.renderer.info.memory;
  rebuildResult='12 REBUILDS: geometries '+before.geometries+' → '+after.geometries+', textures '+before.textures+' → '+after.textures;
  e.target.disabled=false;
};
function animate(now){
  const frameDelta=Math.min(.5,(now-last)/1000),dt=Math.min(.05,frameDelta);last=now;clock+=dt;
  const bar=clock%24,beat=Math.pow(Math.max(0,Math.sin(clock*Math.PI*4)),16);
  const section=profile==='DANCE'?(bar<6?'BUILD':bar<16?'DROP':'BREAK'):profile==='SILENCE'?'BREAK':'FLOW';
  const energy=profile==='SILENCE'?0:profile==='DANCE'?(section==='BREAK'?.15:.7):.12;
  const features={bass:energy,mid:energy*.7,high:energy*.45,energy,beatStrength:profile==='DANCE'?beat:0,transient:beat*energy,kick:profile==='DANCE'&&beat>.92?1:0,centroid:.5,warmth:.6};
  world.update(dt,clock,features,section,{next:section==='BUILD'?'DROP':null,remaining:6-bar,frameDelta});
  if(now-lastUI>500){document.getElementById('result').textContent=world.theme.name+' · '+profile+' · '+world.fps+' FPS\n'+world.renderer.info.render.calls+' draw calls · '+world.renderer.info.memory.geometries+' geometries · '+world.renderer.info.memory.textures+' textures\n'+world.dna+'\n'+rebuildResult;lastUI=now;}
  requestAnimationFrame(animate);
}requestAnimationFrame(animate);
