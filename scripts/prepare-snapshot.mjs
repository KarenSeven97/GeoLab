import fs from 'node:fs';
import osmtogeojson from 'osmtogeojson';
import {normalizeBuildings} from '../src/buildings.ts';
const raw=JSON.parse(fs.readFileSync(process.argv[2] || '../bryant-park-osm.json','utf8'));
const normalized=normalizeBuildings(osmtogeojson(raw));
if(normalized.buildings.length<20) throw new Error('Expected real buildings in the sample area');
const data={...normalized,bbox:[-73.989,40.749,-73.979,40.757],fetchedAt:new Date().toISOString(),source:'OpenStreetMap API · Bryant Park 摘录',snapshot:true};
fs.writeFileSync('public/data/bryant-park.json',JSON.stringify(data));
console.log(JSON.stringify({buildings:data.buildings.length,skipped:data.skipped,byHeight:data.buildings.reduce((a,b)=>(a[b.properties.kind]=(a[b.properties.kind]||0)+1,a),{})}));
