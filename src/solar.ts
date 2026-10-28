import * as SunCalc from 'suncalc';
import { Seasons } from 'astronomy-engine';
import { Temporal } from '@js-temporal/polyfill';
import { dayBounds, zoned } from './simulation.ts';

export type SunVector=[number,number,number];
export function solarPosition(ms:number,lat:number,lng:number) {
  // SunCalc 2 uses DEGREES, clockwise from NORTH (unlike version 1).
  const p=SunCalc.getPosition(new Date(ms),lat,lng);
  const a=p.azimuth*Math.PI/180,h=p.altitude*Math.PI/180;
  const direction:SunVector=[Math.sin(a)*Math.cos(h),Math.cos(a)*Math.cos(h),Math.sin(h)];
  return {...p,direction,daylight:p.altitude>0};
}
export type SolarPosition=ReturnType<typeof solarPosition>;
export function groundShadow(height:number,direction:SunVector):[number,number]|null {
  if(direction[2]<=0)return null;
  return [-height*direction[0]/direction[2],-height*direction[1]/direction[2]];
}
export interface SolarDay {
  start:number;end:number;minutes:number;sunrise:number|null;sunset:number|null;noon:number|null;
  daylightMinutes:number;polar:'极昼'|'极夜'|null;path:SunVector[];
}
export function solarDay(date:string,zone:string,lat:number,lng:number):SolarDay {
  const b=dayBounds(date,zone);
  const noon=Temporal.PlainDate.from(date).toZonedDateTime({timeZone:zone,plainTime:'12:00'});
  const events:{sunrise:number[],sunset:number[],solarNoon:number[]}={sunrise:[],sunset:[],solarNoon:[]};
  // Adjacent civil days cover rare DST changes near midnight; filter by exact local bounds.
  for(const shift of [-1,0,1]) {
    const d=noon.add({days:shift});
    const times=SunCalc.getTimes(new Date(d.epochMilliseconds),lat,lng,0,d.offsetNanoseconds/60e9);
    for(const key of ['sunrise','sunset','solarNoon'] as const) {
      const ms=times[key]?.getTime();
      if(ms!=null&&Number.isFinite(ms)&&ms>=b.start&&ms<b.end&&!events[key].some(x=>Math.abs(x-ms)<1000))events[key].push(ms);
    }
  }
  const rise=events.sunrise.sort((a,b)=>a-b)[0]??null, set=events.sunset.sort((a,b)=>a-b)[0]??null;
  const transitions=[...events.sunrise.map(ms=>({ms,up:true})),...events.sunset.map(ms=>({ms,up:false}))].sort((a,b)=>a.ms-b.ms);
  let up=transitions.length?!transitions[0].up:solarPosition(b.start,lat,lng).altitude>-.267;
  let last=b.start,lit=0;
  for(const event of transitions){if(up)lit+=event.ms-last;up=event.up;last=event.ms;}
  if(up)lit+=b.end-last;
  const path:SunVector[]=[];
  // Independent line segments avoid connecting separate visible arcs across the horizon.
  let prev=solarPosition(b.start,lat,lng);
  for(let ms=b.start+5*60000;ms<=b.end;ms+=5*60000){const p=solarPosition(ms,lat,lng);if(prev.daylight&&p.daylight)path.push(prev.direction,p.direction);prev=p;}
  return {...b,sunrise:rise,sunset:set,noon:events.solarNoon[0]??null,daylightMinutes:lit/60000,polar:!transitions.length?(up?'极昼':'极夜'):null,path};
}
const seasonCache=new Map<number,number[]>();
export function seasonDates(year:number,zone:string) {
  if(!seasonCache.has(year)) {const s=Seasons(year);seasonCache.set(year,[s.mar_equinox,s.jun_solstice,s.sep_equinox,s.dec_solstice].map(t=>t.date.getTime()));if(seasonCache.size>8)seasonCache.delete(seasonCache.keys().next().value!);}
  return seasonCache.get(year)!.map(ms=>zoned(ms,zone).toPlainDate().toString());
}
