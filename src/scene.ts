import { MercatorCoordinate, type Map, type CustomLayerInterface, type CustomRenderMethodInput } from 'maplibre-gl';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Building } from './types';

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
  buildCount=0;triangles=0;renderCount=0;renderCpuMs=0;
  diagnostics() {return {buildCount:this.buildCount,triangles:this.triangles,renderCount:this.renderCount,geometries:this.renderer?.info.memory.geometries ?? 0,drawCalls:this.renderer?.info.render.calls ?? 0,renderCpuMs:Math.round(this.renderCpuMs*100)/100};}
  onAdd(map:Map,gl:WebGL2RenderingContext) {
    this.map=map;
    this.renderer=new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl,antialias:true});
    this.renderer.autoClear=false;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.scene.add(new THREE.AmbientLight(0xffffff,1.85));
    const light=new THREE.DirectionalLight(0xffffff,2.15);light.position.set(-700,-500,1200);this.scene.add(light);
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
      merged.setAttribute('color',new THREE.BufferAttribute(this.evidence?this.evidenceColors:this.normalColors,3));
      this.mesh=new THREE.Mesh(merged,this.material);this.mesh.frustumCulled=false;this.mesh.visible=this.visible;
      this.mesh.castShadow=true;this.mesh.receiveShadow=true;this.scene.add(this.mesh);
    }
    this.map.triggerRepaint();
  }
  showEvidence(value:boolean) {
    this.evidence=value;
    if(this.mesh&&this.normalColors&&this.evidenceColors) {
      this.mesh.geometry.setAttribute('color',new THREE.BufferAttribute(value?this.evidenceColors:this.normalColors,3));
      this.map.triggerRepaint();
    }
  }
  show(value:boolean) {this.visible=value;if(this.mesh)this.mesh.visible=value;this.map.triggerRepaint();}
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
  onRemove() {this.mesh?.geometry.dispose();this.material.dispose();this.renderer.dispose();this.scene.clear();}
}
