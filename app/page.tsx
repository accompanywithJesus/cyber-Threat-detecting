"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ThreatGlobe, type GlobeNewsItem } from "./components/ThreatGlobe";

type Severity = "critical"|"high"|"medium"|"low";
type NewsItem = GlobeNewsItem & { description:string; link:string; publishedAt:string; region:string; originCountry:string; geoConfidence:number; category:string };
type SourceStatus = { source:string; ok:boolean; count:number; error?:string };

const fallback:NewsItem[] = [
  {id:"fallback-1",title:"라이브 피드를 연결하는 중입니다",description:"공식 RSS 수집기가 최신 사이버 보안 기사를 불러오고 있습니다.",link:"https://thehackernews.com/",publishedAt:new Date().toISOString(),source:"Cyber Atlas",country:"Global",countryLabel:"글로벌",region:"글로벌",lat:20,lng:20,originLat:37.5,originLng:127,originCountry:"OSINT 소스",geoConfidence:40,severity:"medium",category:"Live sync"}
];
const sourceColors:Record<string,string>={"The Hacker News":"#43ddff","SecurityWeek":"#ffb64a","보안뉴스":"#b991ff","Cyber Atlas":"#6b8791"};

function relativeTime(date:string){const seconds=Math.max(0,(Date.now()-Date.parse(date))/1000);if(seconds<60)return "방금 전";if(seconds<3600)return `${Math.floor(seconds/60)}분 전`;if(seconds<86400)return `${Math.floor(seconds/3600)}시간 전`;return `${Math.floor(seconds/86400)}일 전`}
function severityLabel(value:Severity){return {critical:"CRITICAL",high:"HIGH",medium:"ELEVATED",low:"MONITOR"}[value]}

export default function Home(){
  const [items,setItems]=useState<NewsItem[]>(fallback);
  const [statuses,setStatuses]=useState<SourceStatus[]>([]);
  const [activeId,setActiveId]=useState(fallback[0].id);
  const [source,setSource]=useState("전체 소스");
  const [query,setQuery]=useState("");
  const [updatedAt,setUpdatedAt]=useState("");
  const [loading,setLoading]=useState(true);
  const [panel,setPanel]=useState(true);

  const loadNews=useCallback(async()=>{
    setLoading(true);
    try{const response=await fetch("/api/news",{cache:"no-store"});if(!response.ok)throw new Error("feed request failed");const data=await response.json() as {items:NewsItem[];sources:SourceStatus[];updatedAt:string};if(data.items.length){setItems(data.items);setActiveId(current=>data.items.some(item=>item.id===current)?current:data.items[0].id)}setStatuses(data.sources);setUpdatedAt(data.updatedAt)}catch{setStatuses(current=>current.length?current:[{source:"Live feeds",ok:false,count:0,error:"연결 재시도 중"}])}finally{setLoading(false)}
  },[]);
  useEffect(()=>{loadNews();const timer=window.setInterval(loadNews,180000);return()=>window.clearInterval(timer)},[loadNews]);

  const sources=["전체 소스","The Hacker News","SecurityWeek","보안뉴스"];
  const filtered=useMemo(()=>items.filter(item=>(source==="전체 소스"||item.source===source)&&(!query||`${item.title} ${item.description} ${item.countryLabel} ${item.category}`.toLowerCase().includes(query.toLowerCase()))),[items,source,query]);
  const selected=items.find(item=>item.id===activeId)??filtered[0]??items[0];
  const criticalCount=items.filter(item=>item.severity==="critical").length;
  const countries=new Set(items.map(item=>item.country).filter(country=>country!=="Global")).size;
  const healthy=statuses.filter(status=>status.ok).length;
  const risk=Math.min(96,42+criticalCount*3+Math.round(items.length/4));

  return <main className="atlas-shell">
    <header className="atlas-header">
      <div className="atlas-brand"><div className="signal-logo"><i/><i/><i/></div><div><b>CYBER<span>ATLAS</span></b><small>GEOPOLITICAL THREAT OBSERVATORY</small></div></div>
      <div className="live-status"><i className={healthy?"online":"offline"}/><div><b>{healthy?"LIVE INTELLIGENCE":"RECONNECTING"}</b><span>{updatedAt?`${new Date(updatedAt).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})} 동기화`:"공식 피드 연결 중"}</span></div></div>
      <div className="header-stats"><div><small>LIVE SIGNALS</small><b>{String(items.length).padStart(2,"0")}</b></div><div><small>REGIONS</small><b>{String(countries).padStart(2,"0")}</b></div><button onClick={loadNews} disabled={loading} aria-label="뉴스 새로고침">{loading?"SYNC":"↻"}</button></div>
    </header>

    <nav className="source-nav" aria-label="뉴스 출처 필터">
      <span className="nav-label">SOURCE LAYERS</span>
      {sources.map(name=><button key={name} onClick={()=>setSource(name)} className={source===name?"active":""}>{name!=="전체 소스"&&<i style={{background:sourceColors[name]}}/>}{name}<em>{name==="전체 소스"?items.length:items.filter(item=>item.source===name).length}</em></button>)}
      <div className="source-health">{statuses.map(status=><span key={status.source} title={status.error||`${status.count}건 수집`}><i className={status.ok?"ok":"bad"}/>{status.source}</span>)}</div>
    </nav>

    <section className="atlas-workspace">
      <aside className="intel-rail glass-panel">
        <div className="rail-heading"><div><small>REAL-TIME NEWS MAPPING</small><h1>위협 인텔리전스</h1></div><span>{filtered.length}</span></div>
        <label className="intel-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="행위자, 국가, CVE 검색" aria-label="뉴스 검색"/><kbd>⌘ K</kbd></label>
        <div className="feed-list">
          {filtered.map((item,index)=><button key={item.id} onClick={()=>{setActiveId(item.id);setPanel(true)}} className={`news-card ${item.id===selected?.id?"active":""}`}>
            <div className="news-meta"><span className={`severity ${item.severity}`}>{severityLabel(item.severity as Severity)}</span><time>{relativeTime(item.publishedAt)}</time></div>
            <h2>{item.title}</h2>
            <div className="news-route"><i style={{background:sourceColors[item.source]||"#6b8791"}}/><span>{item.source}</span><b>{item.countryLabel}</b></div>
            <div className="card-foot"><span>{item.category}</span><em>GEO {item.geoConfidence}%</em><small>{String(index+1).padStart(2,"0")}</small></div>
          </button>)}
          {!filtered.length&&<div className="empty-feed">검색 조건에 맞는 인텔리전스가 없습니다.</div>}
        </div>
      </aside>

      <section className="globe-stage">
        <div className="orbital-grid"/><div className="radar-sweep"/>
        <ThreatGlobe items={items} activeId={selected?.id}/>
        <div className="stage-title"><small>LIVE GEOSPATIAL LAYER / WGS84</small><h2>글로벌 사이버 위협 관측망</h2><p>드래그하여 회전 · 스크롤하여 확대</p></div>
        <div className="risk-index"><div className="risk-dial" style={{"--risk":`${risk*3.6}deg`} as React.CSSProperties}><span><b>{risk}</b><small>RISK INDEX</small></span></div><p><i/> {criticalCount} CRITICAL SIGNALS</p></div>
        <div className="globe-legend"><span><i className="critical"/>치명적</span><span><i className="high"/>높음</span><span><i className="medium"/>주의</span><span><i className="low"/>관찰</span><em>호: 뉴스 연관 지역 흐름</em></div>
        <div className="coordinate-readout"><span>LAT {selected?.lat.toFixed(3)}</span><span>LNG {selected?.lng.toFixed(3)}</span><b>WGS 84</b></div>
        <button className="detail-toggle" onClick={()=>setPanel(value=>!value)}>{panel?"패널 닫기":"인텔 보기"}</button>
      </section>

      <aside className={`detail-rail glass-panel ${panel?"open":""}`}>
        <button className="close-detail" onClick={()=>setPanel(false)} aria-label="상세 패널 닫기">×</button>
        {selected&&<>
          <div className="detail-kicker"><span className={`severity ${selected.severity}`}>{severityLabel(selected.severity as Severity)}</span><time>{relativeTime(selected.publishedAt)}</time></div>
          <small className="detail-source">{selected.source} / LIVE ARTICLE</small>
          <h2>{selected.title}</h2>
          <div className="geo-route"><div><small>INGEST POINT</small><b>{selected.originCountry}</b></div><i>→</i><div><small>OBSERVED REGION</small><b>{selected.countryLabel}</b></div></div>
          <section className="analysis-card"><div><small>자동 지역 분류 신뢰도</small><b>{selected.geoConfidence}%</b></div><progress value={selected.geoConfidence} max="100"/><p>기사 제목과 요약의 국가·지역 키워드를 기반으로 한 자동 분류입니다. 공격 주체의 귀속을 의미하지 않습니다.</p></section>
          <section className="article-brief"><small>ARTICLE ABSTRACT</small><p>{selected.description||"원문에서 최신 보안 인텔리전스를 확인하세요."}</p></section>
          <div className="intel-metrics"><div><small>CATEGORY</small><b>{selected.category}</b></div><div><small>REGION</small><b>{selected.region}</b></div><div><small>PUBLISHED</small><b>{new Date(selected.publishedAt).toLocaleDateString("ko-KR")}</b></div></div>
          <a className="read-source" href={selected.link} target="_blank" rel="noreferrer"><span>원문 인텔리전스 열기</span><b>↗</b></a>
          <section className="pipeline-card"><div className="pipeline-title"><small>INGESTION PIPELINE</small><b>{healthy}/{statuses.length||3} ONLINE</b></div><div className="pipeline-flow"><span>RSS</span><i/><span>NLP</span><i/><span>GEO</span><i/><span>GLOBE</span></div><p>3분 간격 자동 동기화 · 중복 URL 제거 · 국가 키워드 매핑</p></section>
        </>}
      </aside>
    </section>
    <footer className="atlas-footer"><span><i className={healthy?"online":"offline"}/> COLLECTION PIPELINE {healthy?"OPERATIONAL":"DEGRADED"}</span><p>공식 RSS 기반 · 분석 표시는 자동 추론이며 사실 귀속이 아님</p><b>CYBER ATLAS / LIVE OSINT</b></footer>
  </main>
}
