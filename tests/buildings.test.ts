import {test} from 'node:test';
import assert from 'node:assert/strict';
import {meters,resolveHeight,parseCoordinates,normalizeBuildings} from '../src/buildings.ts';
test('height units and evidence survive missing or invalid OSM tags',()=>{
  assert.equal(meters('100 ft'),30.48);assert.equal(meters('15 m'),15);assert.equal(meters('12;30'),undefined);
  assert.deepEqual(resolveHeight({height:'60','min_height':'12'}),{height:60,base:12,kind:'tagged'});
  assert.deepEqual(resolveHeight({'building:levels':'5'}),{height:15,base:0,kind:'levels'});
  assert.deepEqual(resolveHeight({height:'bad'}),{height:9,base:0,kind:'default'});
  assert.equal(resolveHeight({height:'10',min_height:'20'}).base,0);
});
test('coordinates are explicitly latitude, longitude and range checked',()=>{
  assert.deepEqual(parseCoordinates('40.7533, -73.9837'),[-73.9837,40.7533]);
  assert.equal(parseCoordinates('New York'),null);assert.throws(()=>parseCoordinates('100,200'));
});
test('parts replace enclosing outlines; holes, multipolygons and unique ids are retained',()=>{
  const polygon=(a:number,b:number,c:number,d:number)=>[[[a,b],[c,b],[c,d],[a,d],[a,b]]];
  const collection:any={type:'FeatureCollection',features:[
    {type:'Feature',id:'way/1',properties:{building:'yes'},geometry:{type:'Polygon',coordinates:polygon(0,0,10,10)}},
    {type:'Feature',id:'way/2',properties:{'building:part':'yes',height:'20'},geometry:{type:'Polygon',coordinates:polygon(1,1,5,5)}},
    {type:'Feature',id:'relation/3',properties:{building:'yes'},geometry:{type:'MultiPolygon',coordinates:[[...polygon(20,20,30,30),...polygon(22,22,25,25)]]}},
  ]};
  const result=normalizeBuildings(collection);
  assert.deepEqual(result.buildings.map(b=>b.properties.id),['way/2','relation/3']);
  assert.equal(result.buildings[1].geometry.coordinates[0].length,2);
});
