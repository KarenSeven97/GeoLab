import type { Feature, Polygon, MultiPolygon } from 'geojson';
export type HeightKind = 'tagged' | 'levels' | 'default';
export type Building = Feature<Polygon | MultiPolygon, {
  id: string; name: string; height: number; base: number; kind: HeightKind;
  part: boolean; tags: Record<string,string>;
}>;
export interface AreaData { buildings: Building[]; bbox: [number,number,number,number]; fetchedAt: string; source: string; snapshot: boolean; skipped: number; }
export interface Place { name: string; detail: string; lng: number; lat: number; }
