import { Temporal } from '@js-temporal/polyfill';
import lookup from '@photostructure/tz-lookup';

export const zoned=(ms:number,zone:string)=>Temporal.Instant.fromEpochMilliseconds(Math.round(ms)).toZonedDateTimeISO(zone);
export const clockText=(ms:number,zone:string)=>zoned(ms,zone).toPlainTime().toString({smallestUnit:'minute'});
export function dayBounds(date:string,zone:string) {
  const d=Temporal.PlainDate.from(date);
  const start=d.toZonedDateTime(zone).epochMilliseconds;
  const end=d.add({days:1}).toZonedDateTime(zone).epochMilliseconds;
  return {start,end,minutes:(end-start)/60000};
}

/** One UTC instant is authoritative; local calendar fields are always derived. */
export class Simulation {
  instant:number;lat:number;lng:number;zone:string;notice='';manualZone=false;
  constructor(lat:number,lng:number,instant=Date.now()) {
    this.lat=lat;this.lng=lng;this.zone=lookup(lat,lng);this.instant=Math.floor(instant/60000)*60000;
  }
  get local(){return zoned(this.instant,this.zone);}
  get date(){return this.local.toPlainDate().toString();}
  get bounds(){return dayBounds(this.date,this.zone);}
  get minute(){return (this.instant-this.bounds.start)/60000;}
  setLocation(lat:number,lng:number) {
    if(Math.abs(lat-this.lat)<1e-6&&Math.abs(lng-this.lng)<1e-6)return false;
    this.lat=lat;this.lng=lng;this.zone=lookup(lat,lng);this.manualZone=false;this.notice='';return true;
  }
  setZone(zone:string) {zoned(this.instant,zone);this.zone=zone;this.manualZone=true;this.notice='已使用手动时区；切换地点后恢复自动识别。';}
  resetZone(){this.zone=lookup(this.lat,this.lng);this.manualZone=false;this.notice='';}
  private setWall(date:string,time:string) {
    const wall=Temporal.PlainDate.from(date).toPlainDateTime(Temporal.PlainTime.from(time));
    const early=wall.toZonedDateTime(this.zone,{disambiguation:'earlier'});
    const late=wall.toZonedDateTime(this.zone,{disambiguation:'later'});
    const value=wall.toZonedDateTime(this.zone,{disambiguation:'compatible'});
    this.instant=value.epochMilliseconds;
    this.notice=early.epochMilliseconds===late.epochMilliseconds?'':value.toPlainDateTime().equals(wall)?'此时刻重复出现：采用第一次。时间轴可选择第二次，UTC 偏移可区分。':'此时刻因时区跳变不存在，已按跳变长度向后顺延。';
  }
  setDate(date:string){this.setWall(date,this.local.toPlainTime().toString());}
  setTime(time:string){this.setWall(this.date,time);}
  setElapsed(minutes:number,anchor=this.date) {
    const b=dayBounds(anchor,this.zone);this.instant=b.start+Math.max(0,Math.min(b.minutes,minutes))*60000;this.notice='';
  }
  addDay(){this.setDate(this.local.toPlainDate().add({days:1}).toString());}
  now(){this.instant=Math.floor(Date.now()/60000)*60000;this.notice='';}
}
