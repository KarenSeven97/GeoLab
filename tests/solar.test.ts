import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Observer, Equator, Horizon, Body } from 'astronomy-engine';
import { Simulation, dayBounds, clockText } from '../src/simulation.ts';
import { solarPosition, solarDay, groundShadow, seasonDates } from '../src/solar.ts';

test('solar direction agrees with independent Astronomy Engine at three hemispheres and seasons',()=>{
  for(const [lat,lng,time] of [[40.7533,-73.9837,'2026-06-21T16:00:00Z'],[40.7533,-73.9837,'2026-12-21T17:00:00Z'],[-33.8688,151.2093,'2026-12-21T01:00:00Z'],[51.50745,-.12777,'2026-03-20T09:00:00Z'],[1.3521,103.8198,'2026-09-23T08:00:00Z']] as const) {
    const date=new Date(time),observer=new Observer(lat,lng,0);
    const eq=Equator(Body.Sun,date,observer,true,true);const reference=Horizon(date,observer,eq.ra,eq.dec,'normal');
    const p=solarPosition(date.getTime(),lat,lng);
    assert.ok(Math.abs(p.altitude-reference.altitude)<.3,`${time} altitude ${p.altitude} / ${reference.altitude}`);
    assert.ok(Math.abs(((p.azimuth-reference.azimuth+540)%360)-180)<.3,`${time} bearing`);
    assert.ok(Math.abs(Math.hypot(...p.direction)-1)<1e-10);
  }
});
test('New York summer is higher, and morning/evening shadows reverse east-west',()=>{
  const s=new Simulation(40.7533,-73.9837);
  const at=(date:string,time:string)=>{s.setDate(date);s.setTime(time);return solarPosition(s.instant,s.lat,s.lng);};
  const summer=at('2026-06-21','12:00'),winter=at('2026-12-21','12:00');
  assert.ok(summer.altitude>winter.altitude+40);
  const am=groundShadow(100,at('2026-06-21','09:00').direction)!;
  const pm=groundShadow(100,at('2026-06-21','17:00').direction)!;
  assert.ok(am[0]<0);assert.ok(pm[0]>0);
  assert.ok(Math.abs(Math.hypot(...groundShadow(100,winter.direction)!)-100/Math.tan(winter.altitude*Math.PI/180))<1e-8);
  assert.equal(groundShadow(100,at('2026-06-21','00:00').direction),null);
  const cardinal=groundShadow(100,[0,Math.SQRT1_2,Math.SQRT1_2])!;
  assert.ok(Math.abs(cardinal[0])<1e-9&&Math.abs(cardinal[1]+100)<1e-9);
});
test('editing local fields preserves the other field and changing zones preserves the instant',()=>{
  const s=new Simulation(40.7533,-73.9837,Date.parse('2026-01-26T19:09:00Z'));
  s.setDate('2026-06-21');assert.equal(clockText(s.instant,s.zone),'14:09');
  s.setTime('08:35');assert.equal(s.date,'2026-06-21');
  const instant=s.instant;s.setLocation(35.6762,139.6503);assert.equal(s.zone,'Asia/Tokyo');assert.equal(s.instant,instant);
  assert.equal(clockText(s.instant,s.zone),'21:35');
});
test('DST gaps resolve forward, repeated hours remain reachable with distinct offsets',()=>{
  const s=new Simulation(40.7533,-73.9837);
  s.setDate('2026-03-08');s.setTime('02:30');assert.equal(clockText(s.instant,s.zone),'03:30');assert.match(s.notice,/不存在/);assert.equal(s.bounds.minutes,1380);
  s.setDate('2026-11-01');s.setTime('01:30');const first=s.instant;assert.equal(s.local.offset,'-04:00');assert.equal(s.bounds.minutes,1500);
  s.setElapsed(150);assert.equal(clockText(s.instant,s.zone),'01:30');assert.equal(s.local.offset,'-05:00');assert.equal(s.instant-first,3600000);
});
test('leap years, fractional DST and the 24:00 endpoint use real local day bounds',()=>{
  const s=new Simulation(40.7533,-73.9837);s.setDate('2024-02-28');s.setTime('11:23');s.addDay();assert.equal(s.date,'2024-02-29');s.addDay();assert.equal(s.date,'2024-03-01');
  assert.equal(dayBounds('2026-10-04','Australia/Lord_Howe').minutes,1410);
  s.setDate('2026-03-08');s.setElapsed(1380);assert.equal(s.date,'2026-03-09');assert.equal(clockText(s.instant,s.zone),'00:00');
});
test('solar events use the selected civil date, including far eastern time zones and polar conditions',()=>{
  for(const [date,zone,lat,lng] of [['2026-06-21','America/New_York',40.7533,-73.9837],['2026-03-20','Pacific/Auckland',-36.85,174.76],['2026-03-08','America/New_York',40.7533,-73.9837]] as const){
    const d=solarDay(date,zone,lat,lng);assert.ok(d.sunrise!>=d.start&&d.sunset!<d.end);assert.ok(d.daylightMinutes>600&&d.daylightMinutes<1000);assert.ok(d.path.length>0);
  }
  const summer=solarDay('2026-06-21','Europe/Oslo',69.6492,18.9553),winter=solarDay('2026-12-21','Europe/Oslo',69.6492,18.9553);
  assert.equal(summer.polar,'极昼');assert.equal(summer.daylightMinutes,1440);assert.equal(winter.polar,'极夜');assert.equal(winter.daylightMinutes,0);assert.equal(winter.path.length,0);
  assert.deepEqual(seasonDates(2026,'America/New_York'),['2026-03-20','2026-06-21','2026-09-22','2026-12-21']);
  assert.notDeepEqual(seasonDates(2024,'America/New_York'),seasonDates(2026,'America/New_York').map(d=>d.replace('2026','2024')));
});
