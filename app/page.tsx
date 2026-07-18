"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ThreatGlobe, type GlobeNewsItem } from "./components/ThreatGlobe";
import mitreData from "./data/mitre-groups.json";

type Severity = "critical"|"high"|"medium"|"low";
type MitreMatch = {id:string;key:string;mitreName:string;aliases:string[];mitreUrl:string;version:string};
type NewsItem = GlobeNewsItem & { description:string; link:string; publishedAt:string; region:string; originCountry:string; geoConfidence:number; category:string; mitreGroups:MitreMatch[] };
type SourceStatus = { source:string; ok:boolean; count:number; error?:string };
type MitreGroup = typeof mitreData.groups[number];

const fallback:NewsItem[] = [{id:"fallback-1",title:"라이브 피드를 연결하는 중입니다",description:"공식 RSS 수집기가 최신 사이버 보안 기사를 불러오고 있습니다.",link:"https://thehackernews.com/",publishedAt:new Date().toISOString(),source:"Cyber Atlas",country:"Global",countryLabel:"글로벌",region:"글로벌",lat:20,lng:20,originLat:37.5,originLng:127,originCountry:"OSINT 소스",geoConfidence:40,severity:"medium",category:"Live sync",mitreGroups:[]}];
const sourceColors:Record<string,string>={"The Hacker News":"#43ddff","SecurityWeek":"#ffb64a","보안뉴스":"#b991ff","Cyber Atlas":"#6b8791"};
const tacticLabels:Record<string,string>={"reconnaissance":"정찰","resource-development":"자원 개발","initial-access":"초기 접근","execution":"실행","persistence":"지속성","privilege-escalation":"권한 상승","defense-evasion":"방어 회피","credential-access":"자격증명 접근","discovery":"탐색","lateral-movement":"측면 이동","collection":"수집","command-and-control":"명령 및 제어","exfiltration":"유출","impact":"영향"};

function relativeTime(date:string){const seconds=Math.max(0,(Date.now()-Date.parse(date))/1000);if(seconds<60)return "방금 전";if(seconds<3600)return `${Math.floor(seconds/60)}분 전`;if(seconds<86400)return `${Math.floor(seconds/3600)}시간 전`;return `${Math.floor(seconds/86400)}일 전`}
function severityLabel(value:Severity){return {critical:"CRITICAL",high:"HIGH",medium:"ELEVATED",low:"MONITOR"}[value]}
function groupGlobeItem(group:MitreGroup):GlobeNewsItem{return{id:`apt-${group.id}`,title:group.key,lat:group.targetLoc[0],lng:group.targetLoc[1],originLat:group.attackerLoc[0],originLng:group.attackerLoc[1],country:group.targetLabel,countryLabel:group.key,severity:group.weight>=5?"critical":"high",source:"MITRE ATT&CK"}}

export default function Home(){
  const [items,setItems]=useState<NewsItem[]>(fallback);
  const [statuses,setStatuses]=useState<SourceStatus[]>([]);
  const [activeId,setActiveId]=useState(fallback[0].id);
  const [activeGroupId,setActiveGroupId]=useState(mitreData.groups[0].id);
  const [layer,setLayer]=useState<"news"|"mitre">("news");
  const [source,setSource]=useState("전체 소스");
  const [query,setQuery]=useState("");
  const [updatedAt,setUpdatedAt]=useState("");
  const [loading,setLoading]=useState(true);
  const [panel,setPanel]=useState(true);

  const loadNews=useCallback(async()=>{setLoading(true);try{const response=await fetch("/api/news",{cache:"no-store"});if(!response.ok)throw new Error("feed request failed");const data=await response.json() as {items:NewsItem[];sources:SourceStatus[];updatedAt:string};if(data.items.length){setItems(data.items);setActiveId(current=>data.items.some(item=>item.id===current)?current:data.items[0].id)}setStatuses(data.sources);setUpdatedAt(data.updatedAt)}catch{setStatuses(current=>current.length?current:[{source:"Live feeds",ok:false,count:0,error:"연결 재시도 중"}])}finally{setLoading(false)}},[]);
  useEffect(()=>{loadNews();const timer=window.setInterval(loadNews,180000);return()=>window.clearInterval(timer)},[loadNews]);

  const sources=["전체 소스","The Hacker News","SecurityWeek","보안뉴스"];
  const filtered=useMemo(()=>items.filter(item=>(source==="전체 소스"||item.source===source)&&(!query||`${item.title} ${item.description} ${item.countryLabel} ${item.category} ${item.mitreGroups.map(group=>group.aliases.join(" ")).join(" ")}`.toLowerCase().includes(query.toLowerCase()))),[items,source,query]);
  const filteredGroups=useMemo(()=>mitreData.groups.filter(group=>!query||`${group.key} ${group.mitreName} ${group.aliases.join(" ")} ${group.operationType} ${group.targetLabel}`.toLowerCase().includes(query.toLowerCase())),[query]);
  const selected=items.find(item=>item.id===activeId)??filtered[0]??items[0];
  const selectedGroup=mitreData.groups.find(group=>group.id===activeGroupId)??mitreData.groups[0];
  const groupArticles=items.filter(item=>item.mitreGroups.some(group=>group.id===selectedGroup.id)).slice(0,4);
  const tacticGroups=Object.entries(selectedGroup.techniques.reduce<Record<string,MitreGroup["techniques"]>>((all,technique)=>{(all[technique.tactic]??=[]).push(technique);return all},{}));
  const criticalCount=items.filter(item=>item.severity==="critical").length;
  const countries=new Set(items.map(item=>item.country).filter(country=>country!=="Global")).size;
  const healthy=statuses.filter(status=>status.ok).length;
  const risk=Math.min(96,42+criticalCount*3+Math.round(items.length/4));
  const globeItems=layer==="news"?items:mitreData.groups.map(groupGlobeItem);
  const globeActiveId=layer==="news"?selected?.id:`apt-${selectedGroup.id}`;

  return <main className="atlas-shell">
    <header className="atlas-header">
      <div className="atlas-brand"><div className="signal-logo"><i/><i/><i/></div><div><b>CYBER<span>ATLAS</span></b><small>GEOPOLITICAL THREAT OBSERVATORY</small></div></div>
      <div className="live-status"><i className={healthy?"online":"offline"}/><div><b>{healthy?"LIVE INTELLIGENCE":"RECONNECTING"}</b><span>{updatedAt?`${new Date(updatedAt).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})} 동기화`:"공식 피드 연결 중"}</span></div></div>
      <div className="header-stats"><div><small>{layer==="news"?"LIVE SIGNALS":"ATT&CK GROUPS"}</small><b>{String(layer==="news"?items.length:mitreData.groups.length).padStart(2,"0")}</b></div><div><small>{layer==="news"?"REGIONS":"TECHNIQUES"}</small><b>{layer==="news"?String(countries).padStart(2,"0"):selectedGroup.techniques.length}</b></div><button onClick={loadNews} disabled={loading} aria-label="뉴스 새로고침">{loading?"SYNC":"↻"}</button></div>
    </header>

    <nav className="source-nav" aria-label="정보 레이어 선택">
      <div className="layer-switch"><button className={layer==="news"?"active":""} onClick={()=>{setLayer("news");setPanel(true)}}>LIVE NEWS</button><button className={layer==="mitre"?"active":""} onClick={()=>{setLayer("mitre");setPanel(true)}}>MITRE ATT&CK <em>v{mitreData.dataset.version}</em></button></div>
      {layer==="news"?<>{sources.map(name=><button key={name} onClick={()=>setSource(name)} className={source===name?"active":""}>{name!=="전체 소스"&&<i style={{background:sourceColors[name]}}/>}{name}<em>{name==="전체 소스"?items.length:items.filter(item=>item.source===name).length}</em></button>)}<div className="source-health">{statuses.map(status=><span key={status.source} title={status.error||`${status.count}건 수집`}><i className={status.ok?"ok":"bad"}/>{status.source}</span>)}</div></>:<div className="mitre-dataset"><i/> ENTERPRISE ATT&CK {mitreData.dataset.version}<span>{new Date(mitreData.dataset.modified).toLocaleDateString("ko-KR")} 데이터</span></div>}
    </nav>

    <section className="atlas-workspace">
      <aside className="intel-rail glass-panel">
        <div className="rail-heading"><div><small>{layer==="news"?"REAL-TIME NEWS MAPPING":"REGISTERED ADVERSARY LAYER"}</small><h1>{layer==="news"?"위협 인텔리전스":"ATT&CK 그룹 분석"}</h1></div><span>{layer==="news"?filtered.length:filteredGroups.length}</span></div>
        <label className="intel-search"><span>⌕</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={layer==="news"?"행위자, 국가, CVE 검색":"APT, 별칭, 표적 검색"} aria-label="인텔리전스 검색"/><kbd>⌘ K</kbd></label>
        <div className="feed-list">
          {layer==="news"?filtered.map((item,index)=><button key={item.id} onClick={()=>{setActiveId(item.id);setPanel(true)}} className={`news-card ${item.id===selected?.id?"active":""}`}><div className="news-meta"><span className={`severity ${item.severity}`}>{severityLabel(item.severity as Severity)}</span><time>{relativeTime(item.publishedAt)}</time></div><h2>{item.title}</h2><div className="news-route"><i style={{background:sourceColors[item.source]||"#6b8791"}}/><span>{item.source}</span><b>{item.countryLabel}</b></div><div className="card-foot"><span>{item.category}</span>{item.mitreGroups[0]?<em className="mitre-hit">ATT&CK {item.mitreGroups[0].id}</em>:<em>GEO {item.geoConfidence}%</em>}<small>{String(index+1).padStart(2,"0")}</small></div></button>):filteredGroups.map(group=><button key={group.id} onClick={()=>{setActiveGroupId(group.id);setPanel(true)}} className={`news-card apt-card ${group.id===selectedGroup.id?"active":""}`}><div className="news-meta"><span className="mitre-id">{group.id}</span><time>v{group.version}</time></div><h2>{group.key}<small>{group.mitreName!==group.key?group.mitreName:"MITRE REGISTERED"}</small></h2><p>{group.operationType}</p><div className="news-route"><i style={{background:group.color}}/><span>{group.attackerLabel}</span><b>{group.targetLabel}</b></div><div className="card-foot"><span>{group.techniques.length} TTP</span><em>{group.references.length} SOURCES</em><small>ATT&CK</small></div></button>)}
          {(layer==="news"?!filtered.length:!filteredGroups.length)&&<div className="empty-feed">검색 조건에 맞는 인텔리전스가 없습니다.</div>}
        </div>
      </aside>

      <section className="globe-stage">
        <div className="orbital-grid"/><div className="radar-sweep"/><ThreatGlobe items={globeItems} activeId={globeActiveId}/>
        <div className="stage-title"><small>{layer==="news"?"LIVE GEOSPATIAL LAYER / WGS84":`MITRE ATT&CK ${mitreData.dataset.version} / CASE OVERLAY`}</small><h2>{layer==="news"?"글로벌 사이버 위협 관측망":"등록 APT 작전 경로"}</h2><p>드래그하여 회전 · 스크롤하여 확대</p></div>
        <div className="risk-index"><div className="risk-dial" style={{"--risk":`${(layer==="news"?risk:selectedGroup.weight*18)*3.6}deg`} as React.CSSProperties}><span><b>{layer==="news"?risk:selectedGroup.weight*18}</b><small>{layer==="news"?"RISK INDEX":"CASE SCORE"}</small></span></div><p><i/> {layer==="news"?`${criticalCount} CRITICAL SIGNALS`:`${selectedGroup.techniques.length} MAPPED TTPs`}</p></div>
        <div className="globe-legend"><span><i className="critical"/>치명적</span><span><i className="high"/>높음</span><span><i className="medium"/>주의</span><span><i className="low"/>관찰</span><em>{layer==="news"?"호: 뉴스 연관 지역 흐름":"호: 사례 기반 공격지 → 표적"}</em></div>
        <div className="coordinate-readout"><span>LAT {(layer==="news"?selected?.lat:selectedGroup.targetLoc[0]).toFixed(3)}</span><span>LNG {(layer==="news"?selected?.lng:selectedGroup.targetLoc[1]).toFixed(3)}</span><b>WGS 84</b></div><button className="detail-toggle" onClick={()=>setPanel(value=>!value)}>{panel?"패널 닫기":"인텔 보기"}</button>
      </section>

      <aside className={`detail-rail glass-panel ${panel?"open":""}`}><button className="close-detail" onClick={()=>setPanel(false)} aria-label="상세 패널 닫기">×</button>
        {layer==="news"&&selected&&<><div className="detail-kicker"><span className={`severity ${selected.severity}`}>{severityLabel(selected.severity as Severity)}</span><time>{relativeTime(selected.publishedAt)}</time></div><small className="detail-source">{selected.source} / LIVE ARTICLE</small><h2>{selected.title}</h2><div className="geo-route"><div><small>INGEST POINT</small><b>{selected.originCountry}</b></div><i>→</i><div><small>OBSERVED REGION</small><b>{selected.countryLabel}</b></div></div>{selected.mitreGroups.length>0&&<section className="mitre-match"><div><small>MITRE ATT&CK MATCH</small><b>OFFICIAL</b></div>{selected.mitreGroups.map(group=><a key={group.id} href={group.mitreUrl} target="_blank" rel="noreferrer"><span>{group.id}</span><strong>{group.key}</strong><em>v{group.version} ↗</em></a>)}</section>}<section className="analysis-card"><div><small>자동 지역 분류 신뢰도</small><b>{selected.geoConfidence}%</b></div><progress value={selected.geoConfidence} max="100"/><p>기사 제목과 요약의 국가·지역·그룹 별칭을 기반으로 한 자동 분류입니다. 공격 주체 귀속은 MITRE 또는 원문 근거가 있을 때만 표시합니다.</p></section><section className="article-brief"><small>ARTICLE ABSTRACT</small><p>{selected.description||"원문에서 최신 보안 인텔리전스를 확인하세요."}</p></section><div className="intel-metrics"><div><small>CATEGORY</small><b>{selected.category}</b></div><div><small>REGION</small><b>{selected.region}</b></div><div><small>PUBLISHED</small><b>{new Date(selected.publishedAt).toLocaleDateString("ko-KR")}</b></div></div><a className="read-source" href={selected.link} target="_blank" rel="noreferrer"><span>원문 인텔리전스 열기</span><b>↗</b></a><section className="pipeline-card"><div className="pipeline-title"><small>INGESTION PIPELINE</small><b>{healthy}/{statuses.length||3} ONLINE</b></div><div className="pipeline-flow"><span>RSS</span><i/><span>NLP</span><i/><span>MITRE</span><i/><span>GEO</span></div><p>3분 자동 동기화 · 그룹 별칭 매칭 · ATT&CK ID 연결</p></section></>}
        {layer==="mitre"&&<><div className="detail-kicker"><span className="mitre-id">{selectedGroup.id}</span><time>ATT&CK v{selectedGroup.version}</time></div><small className="detail-source">MITRE REGISTERED GROUP / CASE OVERLAY</small><h2 className="apt-title">{selectedGroup.key}<small>{selectedGroup.mitreName}</small></h2><p className="apt-description">{selectedGroup.description}</p><div className="operation-route"><div><small>ORIGIN</small><b>{selectedGroup.attackerLabel}</b></div>{selectedGroup.c2Label&&<><i>→</i><div><small>INFRASTRUCTURE</small><b>{selectedGroup.c2Label}</b></div></>}<i>→</i><div><small>TARGET</small><b>{selectedGroup.targetLabel}</b></div></div><section className="alias-card"><div><small>MITRE 공식 연관 그룹명</small><span>{selectedGroup.aliases.length}</span></div><p>{selectedGroup.aliases.join(" · ")}</p>{selectedGroup.caseAlias&&<em>사례 표기: {selectedGroup.caseAlias}</em>}</section><section className="operation-card"><small>CASE ASSESSMENT</small><h3>{selectedGroup.operationType}</h3><div><span>ATT&CK techniques</span><b>{selectedGroup.techniques.length}</b><span>software</span><b>{selectedGroup.software.length}</b></div></section><section className="ttp-section"><div className="ttp-heading"><small>TACTICS & TECHNIQUES</small><span>{tacticGroups.length} TACTICS</span></div>{tacticGroups.map(([tactic,techniques])=><div className="tactic-row" key={tactic}><div><i/><b>{tacticLabels[tactic]||tactic}</b><small>{tactic.toUpperCase()}</small></div><ul>{techniques.slice(0,5).map(technique=><li key={`${tactic}-${technique.id}`}><a href={technique.url} target="_blank" rel="noreferrer"><span>{technique.id}</span>{technique.name}</a></li>)}{techniques.length>5&&<li className="more-techniques">+ {techniques.length-5} more</li>}</ul></div>)}</section><section className="evidence-section"><div className="ttp-heading"><small>RELATED INTELLIGENCE</small><span>{groupArticles.length} LIVE</span></div>{groupArticles.map(article=><a className="evidence-link live" key={article.id} href={article.link} target="_blank" rel="noreferrer"><i/><div><small>{article.source} · {relativeTime(article.publishedAt)}</small><b>{article.title}</b></div><span>↗</span></a>)}{selectedGroup.references.slice(0,4).map(reference=><a className="evidence-link" key={reference.url} href={reference.url} target="_blank" rel="noreferrer"><i/><div><small>MITRE REFERENCE · {reference.source}</small><b>{reference.title}</b></div><span>↗</span></a>)}</section><a className="read-source mitre-button" href={selectedGroup.mitreUrl} target="_blank" rel="noreferrer"><span>MITRE 공식 그룹 페이지</span><b>↗</b></a><p className="data-notice">지도 경로와 사례 평가는 첨부하신 분석안을 기반으로 하며, TTP·연관 그룹명·참조 링크는 MITRE ATT&CK {mitreData.dataset.version} 공식 STIX 데이터에서 생성했습니다.</p></>}
      </aside>
    </section>
    <footer className="atlas-footer"><span><i className={healthy?"online":"offline"}/> COLLECTION PIPELINE {healthy?"OPERATIONAL":"DEGRADED"}</span><p>{layer==="news"?"공식 RSS 기반 · 자동 추론은 사실 귀속이 아님":`MITRE ATT&CK ${mitreData.dataset.version} · 사례 좌표는 사용자 분석 기반`}</p><b>CYBER ATLAS / LIVE OSINT</b></footer>
  </main>
}
