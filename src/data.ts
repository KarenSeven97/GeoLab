import osmtogeojson from 'osmtogeojson';
import { normalizeBuildings, parseCoordinates } from './buildings.ts';
import type { AreaData, Place } from './types';

const env=import.meta.env || {};
export const endpoints={
  map:env.VITE_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron',
  geocoder:env.VITE_GEOCODER || 'https://photon.komoot.io/api/',
  overpass:env.VITE_OVERPASS || 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
};
export const initialPlace: Place={name:'Bryant Park',detail:'曼哈顿 · 纽约，美国',lng:-73.9837,lat:40.7533};
export class DataService {
  cache: AreaData[]=[];
  requests=0;
  private lastRequest=0;
  private searchCache=new Map<string,Place[]>();
  async search(query: string,signal: AbortSignal): Promise<Place[]> {
    const coords=parseCoordinates(query);
    if (coords) return [{lng:coords[0],lat:coords[1],name:'坐标位置',detail:`${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`}];
    const key=query.trim().toLowerCase();
    if (this.searchCache.has(key)) return this.searchCache.get(key)!;
    const url=new URL(endpoints.geocoder);url.searchParams.set('q',query);url.searchParams.set('limit','6');
    const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
    if (!response.ok) throw new Error(response.status===429?'搜索服务繁忙，请稍后重试。':'搜索暂时不可用，请重试或输入经纬度。');
    const data=await response.json();
    const places:Place[]=(data.features || []).filter((f:any)=>Array.isArray(f.geometry?.coordinates)).map((f:any)=>{
      const p=f.properties || {};
      return {lng:f.geometry.coordinates[0],lat:f.geometry.coordinates[1],name:p.name || p.street || '搜索位置',detail:[p.housenumber,p.street,p.city || p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ')};
    }).filter((p:Place)=>Number.isFinite(p.lng)&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=85&&Math.abs(p.lng)<=180);
    this.searchCache.set(key,places); if(this.searchCache.size>30) this.searchCache.delete(this.searchCache.keys().next().value!);
    return places;
  }
  cached(lng:number,lat:number) {
    return this.cache.find(a=>lng>a.bbox[0]+0.001 && lng<a.bbox[2]-0.001 && lat>a.bbox[1]+0.001 && lat<a.bbox[3]-0.001);
  }
  async snapshot():Promise<AreaData> {
    const response=await fetch('/data/bryant-park.json');
    if(!response.ok) throw new Error('默认地点数据未能加载，请重试。');
    const data=await response.json() as AreaData;
    this.cache.push(data); return data;
  }
  async buildings(lng:number,lat:number,signal:AbortSignal,force=false):Promise<AreaData> {
    const cached=this.cached(lng,lat);if(cached&&!force) return cached;
    const wait=Math.max(0,5000-(Date.now()-this.lastRequest));
    if(wait) await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},wait);
      const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
      if(signal.aborted) abort();else signal.addEventListener('abort',abort,{once:true});
    });
    signal.throwIfAborted();this.lastRequest=Date.now();this.requests++;
    const dy=450/111320, dx=dy/Math.cos(lat*Math.PI/180);
    // Queries crossing the antimeridian are deliberately rejected rather than requesting a global bbox.
    if(lng-dx< -180||lng+dx>180) throw new Error('此处跨越国际日期变更线，请稍向东或西移动后加载。');
    const bbox:[number,number,number,number]=[lng-dx,lat-dy,lng+dx,lat+dy];
    const box=[bbox[1],bbox[0],bbox[3],bbox[2]].map(n=>n.toFixed(6)).join(',');
    const query=`[out:json][timeout:25];(nwr["building"](${box});nwr["building:part"](${box}););out body geom;`;
    const url=new URL(endpoints.overpass); url.searchParams.set('data',query);
    const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(35000)])});
    if(!response.ok) {console.warn('Building service response',response.status);throw new Error(response.status===429?'建筑服务限流，请稍后点击重试。':'建筑服务暂时不可用，请重试。');}
    const raw=await response.json();
    if(raw.remark || !Array.isArray(raw.elements)) throw new Error('建筑查询未完整返回，请稍后重试。');
    const normalized=normalizeBuildings(osmtogeojson(raw));
    signal.throwIfAborted();
    const data:AreaData={...normalized,bbox,fetchedAt:new Date().toISOString(),source:'OpenStreetMap · Overpass',snapshot:false};
    this.cache.unshift(data);this.cache=this.cache.slice(0,8);return data;
  }
}
