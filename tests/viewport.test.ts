import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4} from 'three';
import {BuildingLayer} from '../src/scene.ts';

test('shadow rendering restores the current shared viewport through fullscreen, resize, day/night and DPR changes',()=>{
  const layer=new BuildingLayer();
  const canvas=Object.freeze({width:800,height:600,style:Object.freeze({width:'800px',height:'600px'})});
  let ratio=1,shadows=true,cached=[0,0,800,600],active=[...cached];
  const renderer={
    getPixelRatio:()=>ratio,
    resetState(){},
    setViewport(x:number,y:number,width:number,height:number){cached=[x,y,width,height].map(n=>Math.round(n*ratio));active=[...cached];},
    render(){if(shadows)active=[...cached];}, // Three restores its default viewport after the shadow FBO.
    setSize(){assert.fail('MapLibre owns the shared canvas size');},
  };
  (layer as any).renderer=renderer;
  const matrix=new Matrix4().toArray();
  const cases=[
    {width:800,height:600,ratio:1,shadows:true},
    {width:1920,height:1080,ratio:1,shadows:false},
    {width:1920,height:1080,ratio:1,shadows:true},
    {width:1280,height:720,ratio:1,shadows:true},
    {width:2560,height:1440,ratio:2,shadows:true},
    {width:800,height:600,ratio:2,shadows:true},
  ];
  for(const state of cases){
    ratio=state.ratio;shadows=state.shadows;
    active=[0,0,state.width,state.height]; // Viewport already set by MapLibre.
    const gl={drawingBufferWidth:state.width,drawingBufferHeight:state.height,canvas};
    layer.render(gl as any,{defaultProjectionData:{mainMatrix:matrix}} as any);
    assert.deepEqual(active,[0,0,state.width,state.height],JSON.stringify(state));
    assert.equal(canvas.width,800);assert.equal(canvas.style.width,'800px');
  }
});
