"use client";

import { useEffect, useRef } from "react";
import type ThreeGlobe from "three-globe";

export type GlobeNewsItem = { id:string; title:string; lat:number; lng:number; originLat:number; originLng:number; country:string; countryLabel:string; severity:string; source:string };

export function ThreatGlobe({ items, activeId }:{ items:GlobeNewsItem[]; activeId?:string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<ThreeGlobe | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const [{ default: ThreeGlobeClass }, { OrbitControls }, topojson] = await Promise.all([
        import("three-globe"), import("three/examples/jsm/controls/OrbitControls.js"), import("topojson-client")
      ]);
      const mount = mountRef.current;
      if (!mount || disposed) return;
      const world = await fetch("/geo/countries-110m.json").then(r=>r.json()) as { objects:{ countries: Parameters<typeof topojson.feature>[1] } };
      if (disposed) return;
      const countries = (topojson.feature(world as never, world.objects.countries) as unknown as {features:object[]}).features;
      const globe = new ThreeGlobeClass({ animateIn:true, waitForGlobeReady:true })
        .showAtmosphere(true).atmosphereColor("#35d8ff").atmosphereAltitude(0.15).showGraticules(true)
        .polygonsData(countries).polygonCapColor(()=>"rgba(8,31,43,.72)").polygonSideColor(()=>"rgba(4,17,24,.9)")
        .polygonStrokeColor(()=>"rgba(59,173,207,.42)").polygonAltitude(0.008);
      const material = globe.globeMaterial();
      material.color = new THREE.Color("#03131c"); material.emissive = new THREE.Color("#061923"); material.emissiveIntensity = 0.72; material.shininess = 18;
      globeRef.current = globe;
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x020609, .0017);
      scene.add(globe);
      scene.add(new THREE.AmbientLight(0x68c9e8, 1.7));
      const rim = new THREE.DirectionalLight(0x5ce6ff, 4.2); rim.position.set(-180, 90, 160); scene.add(rim);
      const warm = new THREE.PointLight(0xff5b6d, 2800, 500); warm.position.set(170,-60,100); scene.add(warm);
      const camera = new THREE.PerspectiveCamera(42, 1, .1, 1600); camera.position.set(0, 0, 315);
      const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:"high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; mount.appendChild(renderer.domElement);
      const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping=true; controls.dampingFactor=.055; controls.enablePan=false; controls.minDistance=185; controls.maxDistance=440; controls.autoRotate=true; controls.autoRotateSpeed=.32;
      const stars = new THREE.BufferGeometry(); const starCount=900; const positions=new Float32Array(starCount*3);
      for(let i=0;i<starCount;i++){const r=390+Math.random()*500,theta=Math.random()*Math.PI*2,phi=Math.acos(2*Math.random()-1);positions[i*3]=r*Math.sin(phi)*Math.cos(theta);positions[i*3+1]=r*Math.cos(phi);positions[i*3+2]=r*Math.sin(phi)*Math.sin(theta)}
      stars.setAttribute("position",new THREE.BufferAttribute(positions,3)); scene.add(new THREE.Points(stars,new THREE.PointsMaterial({color:0x558ca0,size:.75,transparent:true,opacity:.62,sizeAttenuation:true})));
      const resize=()=>{const w=mount.clientWidth,h=mount.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix()}; const ro=new ResizeObserver(resize);ro.observe(mount);resize();
      let frame=0; const animate=()=>{frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)};animate();
      cleanup=()=>{cancelAnimationFrame(frame);ro.disconnect();controls.dispose();renderer.dispose();stars.dispose();mount.removeChild(renderer.domElement);globeRef.current=null};
    })();
    return()=>{disposed=true;cleanup()};
  },[]);

  useEffect(()=>{
    const globe=globeRef.current; if(!globe) return;
    const selected=items.find(item=>item.id===activeId);
    const color=(severity:string)=>severity==="critical"?"#ff536a":severity==="high"?"#ffb648":severity==="medium"?"#38d9df":"#5c7f8e";
    globe.pointsData(items).pointLat("lat").pointLng("lng").pointColor((d)=>color((d as GlobeNewsItem).severity)).pointAltitude((d)=>(d as GlobeNewsItem).id===activeId?.toString()?.trim()?0.09:0.045).pointRadius((d)=>(d as GlobeNewsItem).id===activeId?0.72:0.38).pointsTransitionDuration(500)
      .arcsData(items.filter(i=>Math.abs(i.originLat-i.lat)+Math.abs(i.originLng-i.lng)>5)).arcStartLat("originLat").arcStartLng("originLng").arcEndLat("lat").arcEndLng("lng").arcColor((d)=>["rgba(50,215,255,.08)",color((d as GlobeNewsItem).severity)]).arcAltitudeAutoScale(.42).arcStroke((d)=>(d as GlobeNewsItem).id===activeId?.toString()?.trim()?0.52:0.18).arcDashLength(.42).arcDashGap(.22).arcDashAnimateTime(1900).arcsTransitionDuration(500)
      .ringsData(items.slice(0,18)).ringLat("lat").ringLng("lng").ringColor((d)=>()=>color((d as GlobeNewsItem).severity)).ringMaxRadius((d)=>(d as GlobeNewsItem).id===activeId?5.5:2.5).ringPropagationSpeed(1.25).ringRepeatPeriod(1300)
      .labelsData(selected?[selected]:[]).labelLat("lat").labelLng("lng").labelText((d)=>(d as GlobeNewsItem).countryLabel).labelColor(()=>"#d8f8ff").labelSize(.9).labelAltitude(.12).labelDotRadius(.28);
  },[items,activeId]);
  return <div ref={mountRef} className="globe-canvas" aria-label="실시간 사이버 위협 3D 지구본"/>;
}
