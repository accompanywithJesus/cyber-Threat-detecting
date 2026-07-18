"use client";

import { useMemo, useState } from "react";

type Event = { id:number; actor:string; origin:string; target:string; sector:string; title:string; time:string; severity:"critical"|"high"|"medium"; confidence:number; x:number; y:number; tx:number; ty:number; tags:string[] };

const events: Event[] = [
  {id:1,actor:"Lazarus Group",origin:"북한",target:"대한민국",sector:"금융",title:"가상자산 거래소 대상 공급망 침투 정황",time:"18분 전",severity:"critical",confidence:92,x:78,y:43,tx:81,ty:50,tags:["Supply Chain","Crypto"]},
  {id:2,actor:"APT29",origin:"러시아",target:"EU",sector:"정부",title:"외교기관 OAuth 토큰 탈취 캠페인",time:"1시간 전",severity:"high",confidence:87,x:59,y:33,tx:49,ty:45,tags:["Cloud","Identity"]},
  {id:3,actor:"Volt Typhoon",origin:"중국",target:"미국",sector:"핵심 인프라",title:"에너지·통신망 사전 배치 활동 증가",time:"3시간 전",severity:"critical",confidence:95,x:76,y:47,tx:18,ty:46,tags:["LOTL","Infrastructure"]},
  {id:4,actor:"Unknown",origin:"중동",target:"유럽",sector:"제조",title:"산업 제어 시스템 스캐닝 급증",time:"6시간 전",severity:"medium",confidence:68,x:57,y:55,tx:48,ty:48,tags:["ICS","Recon"]},
  {id:5,actor:"Sandworm",origin:"러시아",target:"우크라이나",sector:"에너지",title:"전력 운영사 대상 파괴형 악성코드 관측",time:"9시간 전",severity:"high",confidence:89,x:61,y:34,tx:56,ty:43,tags:["Wiper","OT"]},
];

const regions = ["전 세계","동아시아","유럽","북미","중동"];

export default function Home() {
  const [active, setActive] = useState(1);
  const [region, setRegion] = useState("전 세계");
  const [mode, setMode] = useState<"observed"|"forecast">("observed");
  const selected = events.find(e=>e.id===active)!;
  const risk = useMemo(()=> mode === "observed" ? 78 : 84, [mode]);
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">C</span><div><b>CYBER ATLAS</b><small>GEOPOLITICAL THREAT INTELLIGENCE</small></div></div>
        <div className="pulse"><i/> LIVE INTELLIGENCE <span>마지막 동기화 14:32 KST</span></div>
        <div className="top-actions"><button aria-label="검색">⌕</button><button aria-label="알림">◌<em>3</em></button><div className="avatar">JK</div></div>
      </header>

      <section className="toolbar">
        <div className="mode-switch"><button className={mode==="observed"?"active":""} onClick={()=>setMode("observed")}>관측된 위협</button><button className={mode==="forecast"?"active":""} onClick={()=>setMode("forecast")}>예측 시나리오 <span>BETA</span></button></div>
        <div className="filters">{regions.map(r=><button key={r} className={region===r?"active":""} onClick={()=>setRegion(r)}>{r}</button>)}</div>
        <button className="date">최근 24시간⌄</button>
      </section>

      <section className="workspace">
        <aside className="left-panel panel">
          <div className="panel-head"><div><small>GLOBAL THREAT FEED</small><h2>활성 인텔리전스</h2></div><span>{events.length}</span></div>
          <div className="search">⌕ <input aria-label="위협 검색" placeholder="국가, 행위자, CVE 검색"/></div>
          <div className="feed">
            {events.map(e=><button key={e.id} onClick={()=>setActive(e.id)} className={`feed-card ${active===e.id?"selected":""}`}>
              <div className="feed-meta"><span className={e.severity}>{e.severity.toUpperCase()}</span><time>{e.time}</time></div>
              <h3>{e.title}</h3><p>{e.origin} → {e.target} · {e.sector}</p>
              <div className="tag-row">{e.tags.map(t=><i key={t}>{t}</i>)}</div>
            </button>)}
          </div>
        </aside>

        <section className="map-area">
          <div className="map-grid"/><div className="scanline"/>
          <div className="map-title"><span>GLOBAL CYBERSPACE</span><b>{mode==="observed"?"실시간 위협 흐름":"72시간 예측 모델"}</b></div>
          <div className="world" aria-label="사이버 위협 세계 지도">
            <div className="continent na"/><div className="continent sa"/><div className="continent eu"/><div className="continent af"/><div className="continent as"/><div className="continent au"/>
            {events.map(e=><div key={`line${e.id}`} className={`attack-line ${active===e.id?"hot":""}`} style={{left:`${Math.min(e.x,e.tx)}%`,top:`${Math.min(e.y,e.ty)}%`,width:`${Math.abs(e.x-e.tx)}%`,transform:`rotate(${Math.atan2(e.ty-e.y,e.tx-e.x)*180/Math.PI}deg)`,transformOrigin:"left"}}/>) }
            {events.map(e=><button key={e.id} aria-label={`${e.actor} 위협`} onClick={()=>setActive(e.id)} className={`map-node ${e.severity} ${active===e.id?"active":""}`} style={{left:`${e.tx}%`,top:`${e.ty}%`}}><i/><span>{e.target}</span></button>)}
          </div>
          <div className="risk-ring"><div style={{"--score":`${risk*3.6}deg`} as React.CSSProperties}><b>{risk}</b><small>GLOBAL RISK</small></div><p>{mode==="observed"?"상승 중 ↑ 12%":"고위험 예상"}</p></div>
          <div className="legend"><span><i className="critical"/>치명적</span><span><i className="high"/>높음</span><span><i className="medium"/>주의</span><span className="dash">— 공격 흐름</span></div>
          <div className="zoom"><button>＋</button><button>−</button><button>◎</button></div>
        </section>

        <aside className="right-panel panel">
          <div className="detail-top"><span className={selected.severity}>{selected.severity.toUpperCase()}</span><button>•••</button></div>
          <small className="eyebrow">THREAT ACTOR PROFILE</small><h1>{selected.actor}</h1><p className="route"><b>{selected.origin}</b><i>→</i>{selected.target}</p>
          <div className="confidence"><div><span>분석 신뢰도</span><b>{selected.confidence}%</b></div><progress value={selected.confidence} max="100"/></div>
          <section className="brief"><small>INTELLIGENCE BRIEF</small><h3>{selected.title}</h3><p>다수의 독립 소스에서 유사한 전술·기술·절차가 확인되었습니다. 현재 표적 산업의 노출 자산과 계정 활동을 우선 점검해야 합니다.</p></section>
          <div className="metrics"><div><small>관측 이벤트</small><b>127</b><em>+23%</em></div><div><small>영향 국가</small><b>08</b><em>24H</em></div><div><small>활성 CVE</small><b>14</b><em>6 KEV</em></div></div>
          <section className="forecast"><div><small>NEXT 72H FORECAST</small><span>AI 분석</span></div><p>동일 산업군으로의 수평 확산 가능성</p><strong>높음 · 76%</strong><div className="forecast-bars"><i/><i/><i/><i/><i/></div></section>
          <section className="sources"><small>SOURCES</small><a href="https://thehackernews.com/" target="_blank">The Hacker News <span>↗</span></a><a href="https://www.cisa.gov/news-events/cybersecurity-advisories" target="_blank">CISA Advisories <span>↗</span></a><p>원문 기사와 공식 권고를 교차 검증한 데모 데이터입니다.</p></section>
        </aside>
      </section>
      <footer><span><i/> 수집 파이프라인 정상</span><p>NEWS 34 · ADVISORIES 12 · IOC 2,841</p><b>CYBER ATLAS / OSINT PROTOTYPE</b></footer>
    </main>
  );
}
