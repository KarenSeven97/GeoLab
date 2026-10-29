import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { BuildingLayer } from './scene';
import { Simulation } from './simulation';
import { createTimeline } from './timeline';
import { DataService, endpoints, initialPlace } from './data';
import type { AreaData, Place, Building } from './types';
maplibregl.setWorkerUrl(workerUrl);

const icons={search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',layers:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',arrow:'<path d="m7 17 10-10M7 7h10v10"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',home:'<path d="m3 11 9-8 9 8M5 9v12h14V9M9 21v-8h6v8"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',refresh:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>'};
const svg=(name:keyof typeof icons)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
document.querySelector('#app')!.innerHTML=`
  <main id="map" aria-label="真实城市三维地图"></main>
  <aside class="panel" aria-label="地点与建筑控制">
    <header class="brand"><span class="brandmark"><span></span></span><div><h1>GeoLab<span class="brand-dot">.</span></h1><p>城市光影实验室</p></div><span class="phase">MVP 02</span><button id="collapse" class="icon-button collapse" aria-label="收起面板" aria-expanded="true">−</button></header>
    <div id="panel-body">
      <form id="search-form" class="searchbox" role="search">${svg('search')}<input id="search" aria-label="搜索地点或坐标" placeholder="搜索城市、地址或纬度, 经度" autocomplete="off" maxlength="160"><button type="submit" aria-label="搜索">${svg('arrow')}</button></form>
      <p id="search-status" class="search-status" role="status" hidden></p><div id="results" class="results" aria-label="搜索结果" hidden></div>
      <div class="location"><div class="eyebrow">EXPLORING / 正在探索</div><h2 id="place-name">Bryant Park</h2><p id="place-detail">曼哈顿 · 纽约，美国</p><span id="coordinates" class="coordinates">40.75330° N &nbsp; 73.98370° W</span></div>
      <div class="metrics"><div><strong id="count">—</strong><span>建筑体块</span></div><div><strong id="tagged">—</strong><span>标注高度</span></div><div><strong id="estimated">—</strong><span>估算高度</span></div></div>
      <div class="status-row"><span id="status-dot" class="status-dot loading"></span><span id="status" role="status">正在打开城市…</span><button id="retry" class="text-button" hidden>重试</button></div>
      <div class="divider"></div>
      <div class="setting"><span>${svg('layers')}三维建筑</span><label class="switch"><input id="buildings-toggle" type="checkbox" checked aria-label="显示三维建筑"><i></i></label></div>
      <div class="setting"><span>区分高度来源</span><label class="switch"><input id="evidence-toggle" type="checkbox" aria-label="区分高度来源"><i></i></label></div>
      <div id="legend" class="legend" hidden><span><i class="tagged"></i>数据标注</span><span><i class="levels"></i>层数估算</span><span><i class="fallback"></i>默认估算</span></div>
      <p class="hint">点击建筑，查看高度与数据来源。</p>
      <button id="source-button" class="source-button">${svg('info')}数据与精度说明<span>↗</span></button>
    </div>
  </aside>
  <div class="top-label"><i></i>真实城市 · 几何观察</div>
  <div class="map-tools" aria-label="地图工具"><button id="north" class="north" title="朝向正北" aria-label="朝向正北"><span>N</span><b>↑</b></button><div class="tool-group"><button id="zoom-in" aria-label="放大">＋</button><button id="zoom-out" aria-label="缩小">−</button></div><div class="tool-group"><button id="reset" aria-label="重置当前地点视角" title="重置视角">${svg('home')}</button><button id="fullscreen" aria-label="全屏浏览" title="全屏">${svg('expand')}</button></div></div>
  <section id="building-card" class="building-card" aria-label="建筑详情" hidden><button id="close-building" class="icon-button" aria-label="关闭建筑详情">${svg('close')}</button><div class="eyebrow">BUILDING / 建筑档案</div><h3 id="building-name"></h3><div class="building-height"><strong id="building-height"></strong><span>米 · 顶部离地高度</span></div><p id="building-method"></p><p id="building-base"></p><a id="building-link" target="_blank" rel="noopener noreferrer">在 OpenStreetMap 查看 ↗</a></section>
  <footer class="view-dock"><div class="dock-title"><span class="mini-orbit">◎</span><div><strong>城市，换个角度。</strong><span>拖动平移 · 滚轮缩放 · 右键拖动旋转</span></div></div><div class="view-buttons" role="group" aria-label="观察角度"><button id="view-2d">俯视</button><button id="view-3d" class="active">透视 3D</button></div><span class="dock-separator"></span><label class="tilt-control">倾角 <input id="tilt" type="range" min="0" max="70" value="58" aria-label="地图倾角"><output id="tilt-value">58°</output></label></footer>
  <div class="bottom-note">阶段 2 · 太阳与阴影 <span>仅模拟已加载区域</span></div>
  <dialog id="sources"><div class="dialog-title"><span class="eyebrow">ABOUT THE DATA</span><button id="close-sources" class="icon-button" aria-label="关闭数据说明">${svg('close')}</button></div><h2>真实轮廓，透明精度。</h2><p>底图来自 <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> / OpenMapTiles；建筑轮廓和属性来自 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors · ODbL</a>。搜索由 <a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon</a> 提供。</p><dl><dt>数据标注</dt><dd>使用有效 height 属性；来源标注不等于实测认证。</dd><dt>按层数估算</dt><dd>building:levels × 3 米。层高统一假设。</dd><dt>默认估算</dt><dd>缺少高度和层数时采用 9 米，绝不伪装成真实高度。</dd></dl><p>建筑包含可用的分段体块、孔洞与离地高度。采用水平地面及简化屋顶。太阳使用 SunCalc 2 视位置（含标准折射），方向光和阴影由真实建筑几何计算；亮度与光色为随太阳高度变化的视觉近似，不代表实测照度。建筑数量按体块统计；未加载建筑不参与遮挡。</p><p id="source-current"></p><p>每次按中心附近约 900 × 900 米加载；远处仅显示底图，低太阳高度时长阴影会超出模拟范围。阴影贴图为 2048 像素，极低角度可能产生精度误差。公共服务可能限流或中断。时间使用地点 IANA 时区；时区边界可手动校正。日出日落为海平面无遮挡参考，不是建筑之间实际可见太阳的时刻。</p></dialog>
  <div id="toast" role="status" hidden></div>
`;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id)! as T;
const text=(id:string,value:string)=>{el(id).textContent=value;};
const service=new DataService();const layer=new BuildingLayer();
const simulation=new Simulation(initialPlace.lat,initialPlace.lng);
simulation.setTime('14:00');
const timeline=createTimeline(simulation,(sun,day,changed)=>{layer.updateSun(sun);if(changed)layer.setSunPath(day.path);});
el<HTMLInputElement>('sun-path').addEventListener('change',e=>layer.showSunPath((e.target as HTMLInputElement).checked));
let map:maplibregl.Map;let selected:Place={...initialPlace};let area:AreaData|null=null;
let loadAbort:AbortController|null=null;let searchAbort:AbortController|null=null;let generation=0;let moveTimer:ReturnType<typeof setTimeout>;let pending=false;let ready=false;
let lastCenter:[number,number]=[initialPlace.lng,initialPlace.lat];
const status=(message:string,kind='ready',retry=false)=>{text('status',message);el('status-dot').className=`status-dot ${kind}`;el('retry').hidden=!retry;};
const toast=(message:string)=>{text('toast',message);el('toast').hidden=false;setTimeout(()=>el('toast').hidden=true,4500);};
function coords(lng:number,lat:number) {return `${Math.abs(lat).toFixed(5)}° ${lat<0?'S':'N'}  ${Math.abs(lng).toFixed(5)}° ${lng<0?'W':'E'}`;}
function showArea(data:AreaData) {
  area=data;lastCenter=[(data.bbox[0]+data.bbox[2])/2,(data.bbox[1]+data.bbox[3])/2];
  layer.setBuildings(data.buildings,lastCenter);
  const tagged=data.buildings.filter(b=>b.properties.kind==='tagged').length;
  text('count',data.buildings.length.toLocaleString());text('tagged',tagged.toLocaleString());text('estimated',(data.buildings.length-tagged).toLocaleString());
  status(data.buildings.length?data.snapshot?'已载入真实数据摘录':'建筑已更新':'此区域暂无建筑数据',data.buildings.length?'ready':'empty');
  text('source-current',`当前来源：${data.source}。获取时间：${new Date(data.fetchedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}（UTC+8）。跳过 ${data.skipped} 个不完整几何。${data.snapshot?'这是随应用提供的真实区域摘录，可点击下方按钮在线更新。':''}`);
  el('building-card').hidden=true;
  const [w,s,e,n]=data.bbox;
  const source=map.getSource('area-outline') as maplibregl.GeoJSONSource;
  source.setData({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]}});
}
async function loadArea(force=false) {
  if(!ready)return;
  const id=++generation;loadAbort?.abort();loadAbort=new AbortController();pending=false;
  const center=map.getCenter();text('coordinates',coords(center.lng,center.lat));
  if(simulation.setLocation(center.lat,center.lng)){timeline.pause();timeline.refresh();}
  if(map.getZoom()<15) {status('放大至街区级别以加载建筑','empty');return;}
  const cached=!force&&service.cached(center.lng,center.lat);
  if(cached&&cached===area){status(!area!.buildings.length?'此区域暂无建筑数据':area!.snapshot?'已载入真实数据摘录':'建筑已更新',area!.buildings.length?'ready':'empty');return;}
  pending=true;
  status('正在获取周边建筑…','loading');
  if(!cached) {area=null;layer.setBuildings([],[center.lng,center.lat]);text('count','—');text('tagged','—');text('estimated','—');el('building-card').hidden=true;text('source-current','当前区域尚未完成建筑加载。');}
  try {
    const data=cached || await service.buildings(center.lng,center.lat,loadAbort.signal,force);
    if(id===generation)showArea(data);
  } catch(error) {if(id!==generation)return;status(error instanceof Error&&error.name==='TimeoutError'?'建筑请求超时，请重试。':error instanceof TypeError?'网络连接失败，请检查网络后重试。':error instanceof Error?error.message:'建筑加载失败，请重试。','error',true);}
  finally {if(id===generation)pending=false;}
}
function selectPlace(place:Place) {
  selected=place;generation++;loadAbort?.abort();pending=false;
  timeline.pause();simulation.setLocation(place.lat,place.lng);timeline.refresh();
  clearTimeout(moveTimer);el('results').hidden=true;el('search-status').hidden=true;el<HTMLInputElement>('search').value='';
  text('place-name',place.name);text('place-detail',place.detail);text('coordinates',coords(place.lng,place.lat));
  map.flyTo({center:[place.lng,place.lat],zoom:16.15,pitch:58,bearing:-25,duration:1200,essential:true});
}
function showBuilding(building:Building) {
  const p=building.properties;text('building-name',p.name);text('building-height',p.height.toFixed(1));
  text('building-method',p.kind==='tagged'?`数据源标注 · height = ${p.tags.height}`:p.kind==='levels'?`按层数估算 · ${p.tags['building:levels']} 层 × 3 米`:'默认估算 · 数据源未提供高度或层数');
  text('building-base',`底部离地 ${p.base.toFixed(1)} 米${p.part?' · 建筑分段':''}`);
  const link=el<HTMLAnchorElement>('building-link');link.href=`https://www.openstreetmap.org/${p.id.replace(/^(way|relation)\//,'$1/')}`;
  el('building-card').hidden=false;
}
async function init() {
  try {
    const probe=document.createElement('canvas');
    if(!probe.getContext('webgl2')) throw new Error('此浏览器无法启用 WebGL 2，请开启硬件加速或更换浏览器。');
    map=new maplibregl.Map({container:'map',style:endpoints.map,center:[selected.lng,selected.lat],zoom:16.15,pitch:58,bearing:-25,maxPitch:70,maxZoom:20,minZoom:2,renderWorldCopies:false,canvasContextAttributes:{antialias:true},attributionControl:false});
    map.addControl(new maplibregl.AttributionControl({compact:false,customAttribution:'<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>'}),'bottom-right');
    map.addControl(new maplibregl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');
    map.on('error',()=>{if(!ready)status('底图连接失败，请重试。','error',true);else toast('部分底图资源加载失败，网络恢复后可重试。');});
    map.on('load',async()=>{
      // Hide the base style's building fills/extrusions; keep roads and labels.
      for(const l of map.getStyle().layers) if(('source-layer' in l && l['source-layer']==='building') || l.type==='fill-extrusion') map.setLayoutProperty(l.id,'visibility','none');
      map.addSource('area-outline',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      map.addLayer({id:'area-boundary',type:'line',source:'area-outline',paint:{'line-color':'#819286','line-opacity':.45,'line-width':1,'line-dasharray':[3,4]}});
      map.addLayer(layer);ready=true;
      const initGeneration=generation;
      try {const sample=await service.snapshot();if(initGeneration===generation)showArea(sample);} catch {await loadArea();}
    });
    map.on('moveend',()=>{clearTimeout(moveTimer);moveTimer=setTimeout(()=>void loadArea(),750);});
    map.on('move',()=>{
      const p=Math.round(map.getPitch());el<HTMLInputElement>('tilt').value=String(p);text('tilt-value',`${p}°`);
      el('view-2d').classList.toggle('active',p<5);el('view-3d').classList.toggle('active',p>=5);
      el('north').style.setProperty('--bearing',`${-map.getBearing()}deg`);
      const c=map.getCenter();text('coordinates',coords(c.lng,c.lat));
    });
    map.on('click',e=>{const b=layer.pick(e.point.x,e.point.y);if(b)showBuilding(b);else el('building-card').hidden=true;});
    map.getCanvas().addEventListener('webglcontextlost',()=>status('图形上下文已中断，请重新加载页面。','error',true));
    // DOM diagnostics for repeatable browser QA; no hidden control surface or extra render loop.
    map.on('idle',()=>{document.documentElement.dataset.geolab=JSON.stringify({ready,pending,buildings:area?.buildings.length ?? 0,requests:service.requests,...layer.diagnostics(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),center:map.getCenter().toArray(),source:area?.source});});
  } catch(error){status(error instanceof Error?error.message:'无法启动三维地图','error');}
}
el('search-form').addEventListener('submit',async event=>{
  event.preventDefault();const query=el<HTMLInputElement>('search').value.trim();if(!query)return;
  searchAbort?.abort();const controller=new AbortController();searchAbort=controller;el('results').hidden=true;el('search-status').hidden=false;text('search-status','正在搜索…');
  try{
    const results=await service.search(query,controller.signal);if(controller!==searchAbort)return;
    el('results').replaceChildren();
    if(!results.length){text('search-status','没有找到匹配地点，试试城市名或纬度, 经度。');return;}
    el('search-status').hidden=true;
    if(results.length===1&&results[0].name==='坐标位置'){selectPlace(results[0]);return;}
    for(const place of results) {const button=document.createElement('button');const title=document.createElement('strong');const detail=document.createElement('span');title.textContent=place.name;detail.textContent=place.detail;button.append(title,detail);button.addEventListener('click',()=>selectPlace(place));el('results').append(button);}
    el('results').hidden=false;
  } catch(error){if(controller!==searchAbort)return;text('search-status',error instanceof Error&&error.name==='TimeoutError'?'搜索超时，请重试。':error instanceof TypeError?'搜索连接失败，请重试或输入纬度, 经度。':error instanceof Error?error.message:'搜索失败。');}
});
el('retry').addEventListener('click',()=>{if(!ready)location.reload();else void loadArea(true);});
el<HTMLInputElement>('buildings-toggle').addEventListener('change',e=>layer.show((e.target as HTMLInputElement).checked));
el<HTMLInputElement>('evidence-toggle').addEventListener('change',e=>{const checked=(e.target as HTMLInputElement).checked;layer.showEvidence(checked);el('legend').hidden=!checked;});
el('close-building').addEventListener('click',()=>el('building-card').hidden=true);
el('north').addEventListener('click',()=>map?.easeTo({bearing:0,duration:600}));
el('zoom-in').addEventListener('click',()=>map?.zoomIn());el('zoom-out').addEventListener('click',()=>map?.zoomOut());
el('reset').addEventListener('click',()=>map?.flyTo({center:[selected.lng,selected.lat],zoom:16.15,pitch:58,bearing:-25,duration:900}));
el('view-2d').addEventListener('click',()=>map?.easeTo({pitch:0,bearing:0,duration:650}));
el('view-3d').addEventListener('click',()=>map?.easeTo({pitch:58,bearing:-25,duration:650}));
el<HTMLInputElement>('tilt').addEventListener('input',e=>map?.setPitch(Number((e.target as HTMLInputElement).value)));
el('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前窗口不支持全屏，可以使用浏览器全屏模式。');}});
el('collapse').addEventListener('click',()=>{const hidden=!el('panel-body').hidden;el('panel-body').hidden=hidden;el('collapse').setAttribute('aria-expanded',String(!hidden));el('collapse').setAttribute('aria-label',hidden?'展开面板':'收起面板');text('collapse',hidden?'+':'−');});
const dialog=el<HTMLDialogElement>('sources');el('source-button').addEventListener('click',()=>dialog.showModal());el('close-sources').addEventListener('click',()=>dialog.close());
const refresh=document.createElement('button');refresh.textContent='在线更新当前区域';refresh.className='refresh-data';refresh.addEventListener('click',()=>{dialog.close();void loadArea(true);});dialog.append(refresh);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){el('results').hidden=true;el('building-card').hidden=true;}});
window.addEventListener('pagehide',()=>{loadAbort?.abort();searchAbort?.abort();clearTimeout(moveTimer);timeline.destroy();map?.remove();});
void init();
