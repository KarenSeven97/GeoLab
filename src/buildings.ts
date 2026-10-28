import type { FeatureCollection, Polygon, MultiPolygon, Position } from 'geojson';
import type { Building, HeightKind } from './types.ts';

// Only explicit lengths are accepted; semicolon lists and malformed units must not become measurements.
export function meters(value?: string): number | undefined {
  if (!value) return;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|')?$/i);
  if (!match) return;
  const n = Number(match[1]) * (/^(ft|feet|')$/i.test(match[2] || '') ? 0.3048 : 1);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : undefined;
}
export function resolveHeight(tags: Record<string,string>) {
  const explicit = meters(tags.height);
  const levels = /^\d+(\.\d+)?$/.test(tags['building:levels'] || '') ? Number(tags['building:levels']) : 0;
  const kind: HeightKind = explicit && explicit > 0 ? 'tagged' : levels > 0 && levels <= 200 ? 'levels' : 'default';
  const height = kind === 'tagged' ? explicit! : kind === 'levels' ? levels * 3 : 9;
  const minLevel = Number(tags['building:min_level']);
  const requestedBase = meters(tags.min_height) ?? (Number.isFinite(minLevel) && minLevel > 0 ? minLevel * 3 : 0);
  return { height, base: requestedBase < height ? requestedBase : 0, kind };
}
export function inRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i], b=ring[j];
    if ((a[1]>point[1]) !== (b[1]>point[1]) && point[0] < (b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
export function inGeometry(point: Position, geometry: Polygon | MultiPolygon) {
  const polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return polys.some(rings=>inRing(point,rings[0]) && !rings.slice(1).some(r=>inRing(point,r)));
}
export function normalizeBuildings(collection: FeatureCollection): {buildings: Building[]; skipped: number} {
  let skipped=0;
  const seen=new Set<string>();
  const all: Building[]=[];
  for (const f of collection.features) {
    const p=f.properties || {};
    const tags: Record<string,string>=p.tags || p;
    if ((!tags.building || tags.building==='no') && (!tags['building:part'] || tags['building:part']==='no')) continue;
    if (!f.geometry || !['Polygon','MultiPolygon'].includes(f.geometry.type) || p.tainted) {skipped++;continue;}
    const id=String(f.id ?? p.id ?? '');
    if (!id || seen.has(id)) continue;
    const geom=f.geometry as Polygon|MultiPolygon;
    const rings=geom.type==='Polygon'?geom.coordinates:geom.coordinates.flat();
    if (rings.some(r=>r.length<4 || r.some(c=>!Number.isFinite(c[0]) || !Number.isFinite(c[1]) || Math.abs(c[1])>85))) {skipped++;continue;}
    seen.add(id);
    all.push({type:'Feature',geometry:geom,properties:{id,name:tags.name || tags['addr:housename'] || '未命名建筑',...resolveHeight(tags),part:!!tags['building:part'] && tags['building:part']!=='no',tags}});
  }
  const parts=all.filter(b=>b.properties.part);
  // OSM's Simple 3D Buildings convention: use parts instead of the enclosing outline.
  const buildings=all.filter(b=>b.properties.part || !parts.some(p=>{
    const ring=p.geometry.type==='Polygon'?p.geometry.coordinates[0]:p.geometry.coordinates[0][0];
    const mid=ring.slice(0,-1).reduce((a,c)=>[a[0]+c[0]/(ring.length-1),a[1]+c[1]/(ring.length-1)],[0,0]);
    return inGeometry(mid,b.geometry);
  }));
  return {buildings,skipped};
}
export function parseCoordinates(text: string): [number,number] | null {
  const match=text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat=Number(match[1]), lng=Number(match[2]);
  if (Math.abs(lat)>85 || Math.abs(lng)>180) throw new Error('请输入有效的纬度、经度（纬度 −85～85，经度 −180～180）。');
  return [lng,lat];
}
