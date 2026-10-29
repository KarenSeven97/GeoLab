import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lightingForAltitude} from '../src/lighting.ts';
import {BuildingLayer} from '../src/scene.ts';

test('daylight gets brighter as the sun rises, with warm dim horizons and a readable night floor',()=>{
  const night=lightingForAltitude(-18),dawn=lightingForAltitude(2),morning=lightingForAltitude(15),noon=lightingForAltitude(65);
  assert.ok(night.mapBrightness>0&&night.ambientIntensity>0);
  assert.equal(night.sunIntensity,0);assert.equal(night.shadowOpacity,0);
  assert.ok(night.mapBrightness<dawn.mapBrightness&&dawn.mapBrightness<morning.mapBrightness&&morning.mapBrightness<noon.mapBrightness);
  assert.ok(dawn.sunIntensity<morning.sunIntensity&&morning.sunIntensity<noon.sunIntensity);
  assert.ok(dawn.sunNeutral<morning.sunNeutral&&morning.sunNeutral<noon.sunNeutral);
  let previous=lightingForAltitude(-90);
  for(let altitude=-89.5;altitude<=90;altitude+=.5){
    const next=lightingForAltitude(altitude);
    for(const key of ['sunIntensity','ambientIntensity','shadowOpacity','mapBrightness'] as const)assert.ok(next[key]>=previous[key],`${altitude} ${key}`);
    for(const value of Object.values(next))assert.ok(Number.isFinite(value)&&value>=0);
    previous=next;
  }
});
test('brightness, color and shadow strength stay continuous through the horizon and twilight boundaries',()=>{
  for(const boundary of [-12,0,3,10,18,35,45]){
    const before=lightingForAltitude(boundary-.0001),after=lightingForAltitude(boundary+.0001);
    for(const key of Object.keys(before) as (keyof typeof before)[])assert.ok(Math.abs(after[key]-before[key])<.0001,`${boundary} ${key}`);
  }
});
test('the real scene fades solar light and shadows to zero before disabling the night shadow pass',()=>{
  const layer=new BuildingLayer();
  const scene=layer as any;
  const apply=(altitude:number)=>layer.updateSun({altitude,azimuth:180,direction:[0,-Math.cos(altitude*Math.PI/180),Math.sin(altitude*Math.PI/180)],daylight:altitude>0});
  apply(.001);const justAbove={sun:scene.sun.intensity,shadow:scene.ground.material.opacity,ambient:scene.ambient.intensity,color:scene.ambient.color.clone()};
  assert.ok(justAbove.sun<.00001&&justAbove.shadow<.00001);assert.equal(scene.sun.castShadow,true);
  apply(-.001);assert.equal(scene.sun.intensity,0);assert.equal(scene.ground.material.opacity,0);assert.equal(scene.sun.castShadow,false);
  assert.ok(Math.abs(scene.ambient.intensity-justAbove.ambient)<.00001);
  for(const channel of ['r','g','b'])assert.ok(Math.abs(scene.ambient.color[channel]-justAbove.color[channel])<.00001);
  apply(5);const warm=scene.sun.color.clone();apply(60);assert.ok(warm.b/warm.r<scene.sun.color.b/scene.sun.color.r);
});
