import { MercatorCoordinate, type Map, type CustomLayerInterface, type CustomRenderMethodInput } from 'maplibre-gl';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Building } from './types';
import type { SolarPosition, SunVector } from './solar';

interface FaceRange { end:number; start:number; building:Building }
export class BuildingLayer implements CustomLayerInterface {
  id='geolab-buildings';type='custom' as const;renderingMode='3d' as const;
  private map!:Map;private renderer!:THREE.WebGLRenderer;
  private scene=new THREE.Scene();private camera=new THREE.Camera();
  private material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  private mesh:THREE.Mesh<THREE.BufferGeometry,THREE.MeshLambertMaterial>|null=null;
  private ranges:FaceRange[]=[];private model=new THREE.Matrix4();
  private normalColors:Float32Array|null=null;private evidenceColors:Float32Array|null=null;
  private evidence=false;private visible=true;
  private sun=new THREE.DirectionalLight(0xfff2db,3);
  private ambient=new THREE.AmbientLight(0xffffff,.65);
  private ground=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShadowMaterial({color:0x15252c,opacity:.52,depthWrite:false,side:THREE.DoubleSide}));
  private path=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xdca653,transparent:true,opacity:.8,depthTest:false}));
  private sunMarker=new THREE.Mesh(new THREE.SphereGeometry(13,16,12),new THREE.MeshBasicMaterial({color:0xffc34f,depthTest:false}));
  private sunRay=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xe8ad43,transparent:true,opacity:.6,depthTest:false}));
  private pathVectors:SunVector[]=[];private pathVisible=true;private radius=1000;private currentSun:SolarPosition|null=null;
  buildCount=0;triangles=0;renderCount=0;renderCpuMs=0;
  diagnostics() {return {buildCount:this.buildCount,triangles:this.triangles,renderCount:this.renderCount,geometries:this.renderer?.info.memory.geometries ?? 0,drawCalls:this.renderer?.info.render.calls ?? 0,renderCpuMs:Math.round(this.renderCpuMs*100)/100,shadowActive:this.sun.castShadow,shadowSize:2048,shadowRadius:this.radius};}
  onAdd(map:Map,gl:WebGL2RenderingContext) {
    this.map=map;
    this.renderer=new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl,antialias:true});
    this.renderer.autoClear=false;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    // MapLibre's combined projection changes raster winding. Closed buildings
    // must keep their outward ENU normals instead of flipping them via gl_FrontFacing.
    // Shadow depth passes retain the original geometry and standard Three shaders.
    this.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;',''));};
    this.material.customProgramCacheKey=()=> 'geolab-outward-enu-normals-v1';
    this.material.shadowSide=THREE.BackSide;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate=false;
    this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.bias=-.00008;this.sun.shadow.normalBias=.3;
    this.sun.shadow.camera.up.set(0,0,1);
    this.ground.receiveShadow=true;this.ground.position.z=.05;this.ground.frustumCulled=false;
    this.path.frustumCulled=false;this.sunRay.frustumCulled=false;this.path.renderOrder=2;this.sunRay.renderOrder=2;this.sunMarker.renderOrder=3;
    this.scene.add(this.ambient,this.sun,this.sun.target,this.ground,this.path,this.sunMarker,this.sunRay);
    this.applySun();
  }
  setBuildings(buildings:Building[],center:[number,number]) {
    const origin=MercatorCoordinate.fromLngLat(center);const scale=origin.meterInMercatorCoordinateUnits();
    this.model.makeTranslation(origin.x,origin.y,0).scale(new THREE.Vector3(scale,-scale,scale));
    const geometries:THREE.BufferGeometry[]=[];
    const ranges:FaceRange[]=[];const regular:number[]=[];const evidence:number[]=[];let faceCount=0;
    for(const building of buildings) {
      const polygons=building.geometry.type==='Polygon'?[building.geometry.coordinates]:building.geometry.coordinates;
      const p=building.properties;
      for(const rings of polygons) {
        const convert=(ring:number[][])=>ring.map(c=>{const m=MercatorCoordinate.fromLngLat([c[0],c[1]]);return new THREE.Vector2((m.x-origin.x)/scale,-(m.y-origin.y)/scale);});
        const shape=new THREE.Shape(convert(rings[0]));
        shape.holes=rings.slice(1).map(r=>new THREE.Path(convert(r)));
        const geometry=new THREE.ExtrudeGeometry(shape,{depth:p.height-p.base,bevelEnabled:false,steps:1,curveSegments:1});
        geometry.translate(0,0,p.base);
        const positions=geometry.getAttribute('position');
        const normals=geometry.getAttribute('normal');
        const color=new THREE.Color();
        for(let i=0;i<positions.count;i++) {
          const roof=normals.getZ(i)>.9;
          color.set(roof?'#eee9dd':'#e0d9c9');regular.push(color.r,color.g,color.b);
          color.set(p.kind==='tagged'?(roof?'#d8e2da':'#bccbbf'):p.kind==='levels'?(roof?'#f1ddba':'#d8bd92'):(roof?'#e9c9b9':'#cfa792'));
          evidence.push(color.r,color.g,color.b);
        }
        geometry.clearGroups();geometries.push(geometry);
        ranges.push({start:faceCount,end:faceCount+positions.count/3,building});faceCount+=positions.count/3;
      }
    }
    const merged=geometries.length?mergeGeometries(geometries,false):null;
    geometries.forEach(g=>g.dispose());
    if(this.mesh) {this.scene.remove(this.mesh);this.mesh.geometry.dispose();this.mesh=null;}
    this.ranges=ranges;this.triangles=faceCount;this.buildCount++;
    this.normalColors=new Float32Array(regular);this.evidenceColors=new Float32Array(evidence);
    if(merged) {
      merged.setAttribute('color',new THREE.BufferAttribute((this.evidence?this.evidenceColors:this.normalColors).slice(),3));
      this.mesh=new THREE.Mesh(merged,this.material);this.mesh.frustumCulled=false;this.mesh.visible=this.visible;
      this.mesh.castShadow=true;this.mesh.receiveShadow=true;
      // MapLibre compresses depthRange to reserve depth for map layers. Three's
      // shadow coordinates assume [0,1]; restore the map range after each depth pass.
      let mapDepthRange:Float32Array;
      this.mesh.onBeforeShadow=()=>{const gl=this.renderer.getContext();mapDepthRange=gl.getParameter(gl.DEPTH_RANGE);gl.depthRange(0,1);};
      this.mesh.onAfterShadow=()=>{this.renderer.getContext().depthRange(mapDepthRange[0],mapDepthRange[1]);};
      this.scene.add(this.mesh);
      merged.computeBoundingBox();const bounds=merged.boundingBox!;
      this.radius=Math.max(750,Math.hypot(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x)),Math.max(Math.abs(bounds.min.y),Math.abs(bounds.max.y))),bounds.max.z*1.5);
    }
    this.ground.scale.set(this.radius*2,this.radius*2,1);
    const camera=this.sun.shadow.camera;camera.left=-this.radius;camera.right=this.radius;camera.top=this.radius;camera.bottom=-this.radius;camera.near=1;camera.far=this.radius*8;camera.updateProjectionMatrix();
    this.setSunPath(this.pathVectors);this.applySun();
    this.map.triggerRepaint();
  }
  updateSun(position:SolarPosition){this.currentSun=position;this.applySun();}
  private applySun() {
    const p=this.currentSun;if(!p)return;
    this.sun.position.fromArray(p.direction).multiplyScalar(this.radius*3);
    this.sun.intensity=p.daylight?2.8:0;this.sun.castShadow=p.daylight&&this.visible;
    this.ambient.intensity=p.daylight?.7:.65;this.ambient.color.set(p.daylight?0xffffff:0xa7badd);
    this.ground.visible=p.daylight&&this.visible;
    this.sunMarker.position.fromArray(p.direction).multiplyScalar(Math.min(420,this.radius*.6));
    this.sunMarker.visible=p.daylight&&this.pathVisible;
    const ray=[0,0,.2,...this.sunMarker.position.toArray()];
    const attr=this.sunRay.geometry.getAttribute('position') as THREE.BufferAttribute|undefined;
    if(attr){attr.set(ray);attr.needsUpdate=true;}else this.sunRay.geometry.setAttribute('position',new THREE.Float32BufferAttribute(ray,3));
    this.sunRay.visible=p.daylight&&this.pathVisible;
    if(this.renderer)this.renderer.shadowMap.needsUpdate=true;
    this.map?.triggerRepaint();
  }
  setSunPath(vectors:SunVector[]) {
    this.pathVectors=vectors;
    this.path.geometry.dispose();this.path.geometry=new THREE.BufferGeometry().setFromPoints(vectors.map(v=>new THREE.Vector3(...v).multiplyScalar(Math.min(420,this.radius*.6))));
    this.map?.triggerRepaint();
  }
  showSunPath(value:boolean){this.pathVisible=value;this.path.visible=value;this.applySun();}
  showEvidence(value:boolean) {
    this.evidence=value;
    if(this.mesh&&this.normalColors&&this.evidenceColors) {
      const colors=this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
      colors.set(value?this.evidenceColors:this.normalColors);
      colors.needsUpdate=true;
      this.map.triggerRepaint();
    }
  }
  show(value:boolean) {this.visible=value;if(this.mesh)this.mesh.visible=value;this.applySun();}
  pick(x:number,y:number):Building|null {
    if(!this.mesh||!this.visible)return null;
    const canvas=this.map.getCanvas();const nx=x/canvas.clientWidth*2-1, ny=1-y/canvas.clientHeight*2;
    const near=new THREE.Vector3(nx,ny,-1).unproject(this.camera);const far=new THREE.Vector3(nx,ny,1).unproject(this.camera);
    const ray=new THREE.Raycaster(near,far.sub(near).normalize());
    const hit=ray.intersectObject(this.mesh,false)[0];
    if(hit?.faceIndex==null)return null;
    return this.ranges.find(r=>hit.faceIndex!>=r.start && hit.faceIndex!<r.end)?.building || null;
  }
  render(_gl:WebGL2RenderingContext,args:CustomRenderMethodInput) {
    this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix).multiply(this.model);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    const start=performance.now();this.renderer.resetState();this.renderer.render(this.scene,this.camera);this.renderer.resetState();this.renderCount++;this.renderCpuMs=performance.now()-start;
  }
  onRemove() {this.mesh?.geometry.dispose();this.material.dispose();for(const object of [this.ground,this.path,this.sunMarker,this.sunRay]){object.geometry.dispose();object.material.dispose();}this.sun.shadow.dispose();this.renderer.dispose();this.scene.clear();}
}
