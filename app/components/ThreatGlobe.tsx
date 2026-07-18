"use client";

import { useEffect, useRef, useState } from "react";
import type ThreeGlobe from "three-globe";

export type GlobeNewsItem={id:string;title:string;lat:number;lng:number;originLat:number;originLng:number;country:string;countryLabel:string;severity:string;source:string};
export type RegionSelection={country:string;lat:number;lng:number};
type CountryFeature={type:"Feature";properties:{name?:string};geometry:object};
type GlobeLabel={lat:number;lng:number;label:string;kind:"country"|"region";country?:string;area?:number};
const REGION_LABELS:GlobeLabel[]=[
  {lat:49,lng:-108,label:"NORTH AMERICA",kind:"region"},{lat:-18,lng:-62,label:"SOUTH AMERICA",kind:"region"},
  {lat:54,lng:17,label:"EUROPE",kind:"region"},{lat:7,lng:20,label:"AFRICA",kind:"region"},
  {lat:27,lng:44,label:"MIDDLE EAST",kind:"region"},{lat:44,lng:70,label:"CENTRAL ASIA",kind:"region"},
  {lat:39,lng:114,label:"EAST ASIA",kind:"region"},{lat:8,lng:109,label:"SOUTHEAST ASIA",kind:"region"},
  {lat:-27,lng:135,label:"OCEANIA",kind:"region"}
];

export function ThreatGlobe({items,activeId,selectedRegion,onRegionSelect}:{items:GlobeNewsItem[];activeId?:string;selectedRegion?:RegionSelection|null;onRegionSelect?:(region:RegionSelection)=>void}){
  const mountRef=useRef<HTMLDivElement>(null);
  const globeRef=useRef<ThreeGlobe|null>(null);
  const labelDataRef=useRef<GlobeLabel[]>([]);
  const callbackRef=useRef(onRegionSelect);
  const [ready,setReady]=useState(false);
  useEffect(()=>{callbackRef.current=onRegionSelect},[onRegionSelect]);

  useEffect(()=>{
    let disposed=false;let cleanup=()=>{};
    (async()=>{
      const THREE=await import("three");
      const [{default:ThreeGlobeClass},{OrbitControls},topojson,geo]=await Promise.all([import("three-globe"),import("three/examples/jsm/controls/OrbitControls.js"),import("topojson-client"),import("d3-geo")]);
      const mount=mountRef.current;if(!mount||disposed)return;
      const world=await fetch("/geo/countries-110m.json").then(response=>response.json()) as {objects:{countries:Parameters<typeof topojson.feature>[1]}};if(disposed)return;
      const countries=(topojson.feature(world as never,world.objects.countries) as unknown as {features:CountryFeature[]}).features;
      const countryLabels=countries.flatMap(feature=>{const country=feature.properties?.name;if(!country)return[];const [lng,lat]=geo.geoCentroid(feature as never);if(!Number.isFinite(lat)||!Number.isFinite(lng))return[];return[{lat,lng,label:country.toUpperCase(),kind:"country" as const,country,area:geo.geoArea(feature as never)}]});
      labelDataRef.current=[...countryLabels,...REGION_LABELS];
      const globe=new ThreeGlobeClass({animateIn:true,waitForGlobeReady:true}).showAtmosphere(true).atmosphereColor("#35d8ff").atmosphereAltitude(.15).showGraticules(true).polygonsData(countries).polygonCapColor(()=>"rgba(8,31,43,.72)").polygonSideColor(()=>"rgba(4,17,24,.9)").polygonStrokeColor(()=>"rgba(59,173,207,.42)").polygonAltitude(.008);
      const material=globe.globeMaterial();material.color=new THREE.Color("#03131c");material.emissive=new THREE.Color("#061923");material.emissiveIntensity=.72;material.shininess=18;
      globeRef.current=globe;setReady(true);
      const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x020609,.0017);scene.add(globe);scene.add(new THREE.AmbientLight(0x68c9e8,1.7));
      const rim=new THREE.DirectionalLight(0x5ce6ff,4.2);rim.position.set(-180,90,160);scene.add(rim);const warm=new THREE.PointLight(0xff5b6d,2800,500);warm.position.set(170,-60,100);scene.add(warm);
      const camera=new THREE.PerspectiveCamera(42,1,.1,1600);camera.position.set(0,0,315);
      const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"high-performance"});renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;mount.appendChild(renderer.domElement);
      const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.055;controls.enablePan=false;controls.minDistance=185;controls.maxDistance=440;controls.autoRotate=true;controls.autoRotateSpeed=.32;
      const clickGeometry=new THREE.SphereGeometry(100.8,64,48);const clickMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});const clickTarget=new THREE.Mesh(clickGeometry,clickMaterial);scene.add(clickTarget);
      const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();let pointerStart={x:0,y:0};let rotateTimer=0;
      const onPointerDown=(event:PointerEvent)=>{pointerStart={x:event.clientX,y:event.clientY};controls.autoRotate=false;window.clearTimeout(rotateTimer)};
      const onPointerUp=(event:PointerEvent)=>{const moved=Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y);rotateTimer=window.setTimeout(()=>{controls.autoRotate=true},2600);if(moved>7)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(clickTarget,false)[0];if(!hit)return;const coords=globe.toGeoCoords(hit.point);const country=countries.find(feature=>geo.geoContains(feature as never,[coords.lng,coords.lat]));if(country?.properties?.name)callbackRef.current?.({country:country.properties.name,lat:coords.lat,lng:coords.lng})};
      renderer.domElement.addEventListener("pointerdown",onPointerDown);renderer.domElement.addEventListener("pointerup",onPointerUp);
      const stars=new THREE.BufferGeometry();const starCount=900;const positions=new Float32Array(starCount*3);for(let i=0;i<starCount;i++){const radius=390+Math.random()*500,theta=Math.random()*Math.PI*2,phi=Math.acos(2*Math.random()-1);positions[i*3]=radius*Math.sin(phi)*Math.cos(theta);positions[i*3+1]=radius*Math.cos(phi);positions[i*3+2]=radius*Math.sin(phi)*Math.sin(theta)}stars.setAttribute("position",new THREE.BufferAttribute(positions,3));const starMaterial=new THREE.PointsMaterial({color:0x558ca0,size:.75,transparent:true,opacity:.62,sizeAttenuation:true});scene.add(new THREE.Points(stars,starMaterial));
      const resize=()=>{const width=mount.clientWidth,height=mount.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix()};const observer=new ResizeObserver(resize);observer.observe(mount);resize();let frame=0;const animate=()=>{frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)};animate();
      cleanup=()=>{cancelAnimationFrame(frame);window.clearTimeout(rotateTimer);observer.disconnect();renderer.domElement.removeEventListener("pointerdown",onPointerDown);renderer.domElement.removeEventListener("pointerup",onPointerUp);controls.dispose();renderer.dispose();stars.dispose();starMaterial.dispose();clickGeometry.dispose();clickMaterial.dispose();if(renderer.domElement.parentNode===mount)mount.removeChild(renderer.domElement);globeRef.current=null;labelDataRef.current=[];setReady(false)};
    })();
    return()=>{disposed=true;cleanup()};
  },[]);

  useEffect(()=>{
    const globe=globeRef.current;if(!globe||!ready)return;const color=(severity:string)=>severity==="critical"?"#ff3f62":severity==="high"?"#ffb13b":severity==="medium"?"#25e9ff":"#698690";
    globe.polygonCapColor((data)=>((data as CountryFeature).properties?.name===selectedRegion?.country?"rgba(32,153,190,.72)":"rgba(8,31,43,.72)")).polygonStrokeColor((data)=>((data as CountryFeature).properties?.name===selectedRegion?.country?"#8cf4ff":"rgba(59,173,207,.42)")).polygonAltitude((data)=>((data as CountryFeature).properties?.name===selectedRegion?.country?0.022:0.008));
    const laserItems=items.filter(item=>Math.abs(item.originLat-item.lat)+Math.abs(item.originLng-item.lng)>5);const labels=labelDataRef.current;
    globe.pointsData(items).pointLat("lat").pointLng("lng").pointColor(data=>color((data as GlobeNewsItem).severity)).pointAltitude(data=>(data as GlobeNewsItem).id===activeId?0.1:0.045).pointRadius(data=>(data as GlobeNewsItem).id===activeId?0.68:0.34).pointsTransitionDuration(350)
      .arcsData(laserItems).arcStartLat("originLat").arcStartLng("originLng").arcEndLat("lat").arcEndLng("lng").arcColor(data=>["rgba(0,0,0,0)",color((data as GlobeNewsItem).severity),"#efffff"]).arcAltitudeAutoScale(.17).arcStroke(data=>(data as GlobeNewsItem).id===activeId?0.48:0.22).arcDashLength(data=>(data as GlobeNewsItem).id===activeId?0.16:0.075).arcDashGap(data=>(data as GlobeNewsItem).id===activeId?0.84:0.925).arcDashInitialGap(()=>Math.random()).arcDashAnimateTime(data=>(data as GlobeNewsItem).id===activeId?520:860).arcsTransitionDuration(250)
      .ringsData([]).labelsData(labels).labelLat("lat").labelLng("lng").labelText("label")
      .labelColor(data=>{const label=data as GlobeLabel;if(label.country===selectedRegion?.country)return"#efffff";return label.kind==="region"?"rgba(67,221,255,.94)":"rgba(174,211,221,.78)"})
      .labelSize(data=>{const label=data as GlobeLabel;if(label.country===selectedRegion?.country)return.76;if(label.kind==="region")return.64;if((label.area||0)>.025)return.43;if((label.area||0)>.004)return.34;return.25})
      .labelAltitude(data=>{const label=data as GlobeLabel;if(label.country===selectedRegion?.country)return.085;return label.kind==="region"?.052:.018})
      .labelIncludeDot(data=>(data as GlobeLabel).country===selectedRegion?.country).labelDotRadius(.14).labelResolution(3).labelsTransitionDuration(250);
  },[items,activeId,selectedRegion,ready]);
  return <div ref={mountRef} className="globe-canvas" aria-label="클릭 가능한 실시간 사이버 위협 3D 지구본"/>;
}
