# CLAUDE.md

이 문서는 Claude Code(및 협업하는 모든 에이전트)가 이 저장소에서 작업할 때 참고하는 컨텍스트입니다.

## 프로젝트 개요

"Cyber Atlas" — 실시간 사이버 보안 뉴스 + MITRE ATT&CK 등록 APT 그룹 데이터를
3D 지구본 위에 지정학적으로 매핑하는 OSINT 관측 웹앱. 현재는 데모/프로토타입 단계이며,
앞으로 **"글로벌 사이버 위협 분석 웹"**으로 발전시키는 것이 목표. 전체 UI는 한국어.

## 스택

- **런타임/빌드**: `vinext`(Next.js App Router 호환 레이어, `vinext dev/build/start`) on
  **Cloudflare Workers**. `vite.config.ts`가 `@cloudflare/vite-plugin`으로 바인딩을
  로컬 dev에도 연결하고, `worker/index.ts`가 실제 Workers `fetch` 진입점
  (이미지 최적화 프록시 `/​_vinext/image` + vinext 앱 라우터 핸들러).
  주의: `vinext`는 Next 래퍼가 **아니라** Vite/RSC 기반 App Router 재구현체다
  (peerDependencies에 `next`가 없음). `next` 의존성은 `app/layout.tsx`의
  `type { Metadata }` 타입 import에만 쓰인다.

## 배포 (self-hosted Cloudflare Workers)

OpenAI Sites 플랫폼 의존은 제거됨(`.openai/`, `build/sites-vite-plugin.ts`,
`app/chatgpt-auth.ts` 삭제). 이제 직접 배포한다.

```
wrangler login              # 최초 1회, 대화형 OAuth (에이전트가 대신 못 함)
npm run db:create           # D1 생성 → 출력된 database_id를 wrangler.jsonc에 기입
npm run db:migrate          # 원격 D1에 drizzle 마이그레이션 적용
npm run deploy              # build + wrangler deploy
```

- `wrangler.jsonc`가 바인딩·워커 이름의 **단일 원천**. 빌드 시
  `@cloudflare/vite-plugin`이 이를 `dist/server/wrangler.json`으로 복사하고,
  `npm run deploy`가 그 파일을 wrangler에 넘긴다(`main: index.js`,
  `assets: ../client`, `no_bundle: true`로 재번들 없이 업로드).
- `assets`는 플러그인이 `dist/client`로 주입하므로 `wrangler.jsonc`에 선언하지 않는다.
- `npm run deploy:dry`는 **인증 없이** 설정·번들·바인딩을 검증한다. 문제 진단 시 먼저 쓸 것.
- 워커 스크립트 크기: gzip 약 1.3MB로 무료 플랜 한도(3MB) 이내지만, `three`/`three-globe`가
  클라이언트 전용인데도 SSR 그래프에 포함돼 번들이 부풀어 있다(개선 여지).
- **UI**: React 19.2, App Router. `app/page.tsx`는 단일 `"use client"` 컴포넌트로 상태·필터·
  상세 패널 로직을 전부 보유(별도 상태관리 라이브러리 없음, `useState`/`useMemo`/`useCallback`만 사용).
- **3D 지구본**: `three` + `three-globe` + `topojson-client` + `d3-geo`. 전부 동적 `import()`로
  클라이언트에서만 로드(SSR 대상 아님).
- **RSS/XML 파싱**: `fast-xml-parser`(XMLParser)로 RSS 2.0/Atom 피드를 직접 파싱. 별도 RSS
  전용 라이브러리 없음.
- **DB**: `drizzle-orm` + `drizzle-kit`(dialect: sqlite, D1 타겟). 바인딩은 **`wrangler.jsonc`의
  `d1_databases`가 단일 원천**이고(`db/index.ts:getDb()`가 `env.DB`를 찾음),
  `db/schema.ts`에 `articles`/`source_status` 테이블이 정의돼 실제로 read/write에 사용됨.
  마이그레이션은 `drizzle/`에 생성되고 `migrations_dir: "drizzle"` 설정으로
  `wrangler d1 migrations apply`가 직접 적용한다(`meta/`는 무시하고 `.sql`만 읽음).
  (`examples/d1/`의 notes 예시는 여전히 마운트되지 않은 참고용)
- **스타일**: Tailwind CSS 4 + 커스텀 CSS 파일들(`globals.css`, `mitre.css`, `region.css`),
  className 기반 커스텀 디자인 시스템(임의의 dark/네온 "관측소" 톤).

## 실제 데이터 흐름

```
app/page.tsx (클라이언트 셸, 3분마다 폴링)
  │
  ├─ mount 시 + setInterval(180000ms) → GET /api/news
  │     └─ app/api/news/route.ts (force-dynamic, 매 요청 라이브 재수집)
  │           1. SOURCES 3곳(The Hacker News, SecurityWeek, 보안뉴스) RSS를
  │              Promise.all로 병렬 fetch, fast-xml-parser로 파싱
  │           2. 기사별로: severity 추론(inferSeverity, 키워드 정규식) /
  │              category 추론(inferCategory) / MITRE 그룹 매칭(matchMitreGroups,
  │              alias 문자열 포함 검사) / 지역 추론(inferLocation, LOCATIONS
  │              배열 매칭 hits[0]=target, hits[1]=origin)
  │           3. 결과를 최신순 정렬 + link 기준 중복 제거 + 상위 42개
  │           4. persist(): D1 articles에 link 기준 UPSERT + source_status 갱신.
  │              D1 실패는 try/catch로 삼켜서 라이브 응답에 영향 없음
  │           5. 라이브 수집이 0건이면 loadFallbackFromDb()로 D1 저장분을 대신 반환
  │              하고 응답에 degraded:true를 실어 보냄 (지도가 비지 않게 하는 핵심 경로)
  │           6. Cache-Control: s-maxage=180 (CDN 캐시)
  │
  ├─ GET /api/history?days=30&country=... (클라이언트에서 아직 호출하지 않는 조회용 계층)
  │     └─ app/api/history/route.ts (force-dynamic)
  │           - days는 1~3650으로 clamp, country는 region-intel과 같은 정규식으로 검증
  │           - COALESCE(publishedAt, ingestedAt) 기준 필터·최신순 정렬, LIMIT 200
  │           - 실패해도 500이 아니라 {items:[], ok:false, error} 200으로 soft-fail
  │
  ├─ 지구본 국가 클릭(ThreatGlobe → onRegionSelect) → 최근 30일 내 관련
  │  기사가 없을 때만 → GET /api/region-intel?country=...
  │     └─ app/api/region-intel/route.ts (force-dynamic)
  │           - Google News RSS 검색(when:10y 쿼리)으로 과거 기사 폴백 조회
  │           - COUNTRY_TERMS로 mitre-groups.json의 targetLabel과 매칭해
  │             관련 MITRE 그룹 케이스도 함께 반환
  │           - 결과는 DB에 저장되지 않고 응답만 함(Cache-Control s-maxage=21600)
  │
  └─ layer==="mitre"일 때는 네트워크 요청 없이 app/data/mitre-groups.json을
     그대로 필터링해서 렌더(정적 import, 빌드 타임에 번들)

ThreatGlobe.tsx
  - items(GlobeNewsItem[])를 props로 받아 point(공격 관측 지점)/arc(origin→target
    공격 경로 레이저)/label(국가·지역명) 데이터로 변환해 three-globe에 바인딩
  - "news" 레이어: /api/news 결과의 lat/lng(표적 추정)·originLat/originLng(발신 추정)
  - "mitre" 레이어: mitre-groups.json의 attackerLoc→targetLoc(및 c2Loc가 있으면
    attacker→C2→target으로 경로가 꺾임, 단 현재 렌더 로직은 attacker→target
    단일 arc만 그리고 c2Loc는 상세 패널 텍스트에만 노출됨)
  - 국가 클릭 시 raycasting으로 world-atlas topojson 폴리곤과 교차 판정 →
    onRegionSelect({country, lat, lng}) 콜백
```

핵심: 수집은 여전히 **요청 시점 라이브 재수집**이지만, `/api/news`는 그 결과를 D1에
적재하고 라이브가 전부 실패하면 적재분으로 응답한다. 즉 "수집 트리거"는 아직 요청 기반이고
(cron 적재 아님), "저장"만 그 위에 얹힌 상태. `/api/region-intel`은 여전히 저장 없이
매번 Google News를 재조회한다.

## `app/data/mitre-groups.json` 스키마

```
{
  "dataset": {
    "name": string,          // "Enterprise ATT&CK"
    "version": string,       // MITRE ATT&CK 버전, 예: "19.1"
    "modified": ISO8601,
    "source": URL            // MITRE STIX 데이터 원본
  },
  "groups": [                // 현재 9개, 전부 중국계 APT
    {
      "key": string,              // 화면 표시용 짧은 이름, 예: "APT1"
      "caseAlias": string|null,   // 사례 표기용 별칭(옵션, null 가능 — 예: APT30)
      "attackerLoc": [lat, lng],  // 공격 주체 추정 좌표
      "attackerLabel": string,    // 예: "중국 (상하이 푸동)"
      "c2Loc": [lat, lng] | undefined,   // C2 서버 좌표(있는 그룹만: APT1/10/41 등)
      "c2Label": string | undefined,
      "targetLoc": [lat, lng],    // 표적 국가·지역 추정 좌표
      "targetLabel": string,      // 예: "미국 방산·IT·통신"
      "operationType": string,    // 작전 성격 한 줄 요약(사용자 분석 기반)
      "color": string,            // hex, 지구본 레이저 색상
      "weight": number,           // 1~5, "CASE ENERGY" 게이지·severity 임계값에 사용
      "id": string,               // MITRE Group ID, 예: "G0006"
      "mitreName": string,        // MITRE 공식 그룹명(key와 다를 수 있음, 예: G0045→"menuPass")
      "aliases": string[],        // MITRE 공식 alias 전체 — /api/news의 matchMitreGroups가
                                  // 이 배열로 뉴스 본문 문자열 포함 매칭
      "description": string,      // MITRE 공식 description(마크다운 링크 포함, 그대로 STIX에서 옮김)
      "mitreUrl": URL,             // https://attack.mitre.org/groups/{id}
      "version": string,           // MITRE 그룹 객체 버전(dataset.version과 별개)
      "modified": ISO8601,
      "techniques": [
        { "tactic": string,  // ATT&CK tactic slug (14종 + 비공식 "stealth" 포함)
          "id": string,      // 예: "T1005", "T1566.001"
          "name": string,
          "url": URL,
          "use": string }    // 이 그룹이 해당 기법을 어떻게 썼는지, MITRE citation 포함 서술
      ],
      "software": [ { "id": string, "name": string, "url": URL } ],
      "references": [ { "title": string, "url": URL, "source": string } ]
    }
  ]
}
```

## `db/schema.ts` (D1)

```
articles                      // 수집된 기사의 영속 사본. link가 UPSERT 키
  id            integer PK autoincrement
  link          text UNIQUE   // 중복 판정 기준
  title, description, source  text
  publishedAt   text NULL     // 스키마는 nullable. 단 현재 news/route.ts가 항상 값을 채우므로
                              // 실제 null은 로드맵 B에서 날짜 파싱을 고친 뒤에야 들어옴
  severity, category          text
  country, countryLabel, region  text
  lat, lng                    real
  originCountry               text
  originLat, originLng        real
  geoConfidence integer
  mitreGroups   text mode:"json"   // matchMitreGroups() 결과를 그대로 직렬화
  ingestedAt    text default CURRENT_TIMESTAMP  // UPSERT 시 갱신하지 않음(최초 발견 시각 유지)
  index(published_at), index(country)

source_status                 // 소스별 "최신 스냅샷" 1행. 이력 로그가 아니라 매 수집마다 덮어씀
  source     text PK
  ok         integer mode:"boolean"
  count      integer
  error      text NULL
  checkedAt  text
```

지구본 렌더에 필요한 필드(countryLabel·originCountry·originLat·originLng)를 전부 저장하므로,
DB 폴백 경로에서 역조회나 값 보완 없이 그대로 `GlobeNewsItem`으로 복원된다.

**D1 파라미터 한도 주의**: 여러 행을 한 `INSERT ... VALUES (...),(...)` 문에 몰면
`D1_ERROR: too many SQL variables`로 통째로 실패한다(42행 × 17컬럼이면 초과). `persist()`가
기사당 개별 upsert 문을 만들어 `db.batch()`로 실행하는 이유가 이것이니, 벌크 삽입을
"최적화"하려다 되돌리지 말 것.

주의: `tactic` 값 중 `"stealth"`는 표준 MITRE 14 tactic에 없는 비공식 라벨로 보임
(표준은 defense-evasion). `app/page.tsx`의 `tacticLabels` 맵에도 `stealth`가 없어서
해당 그룹 상세 패널에서는 한글 라벨 없이 원문 slug가 그대로 노출됨.

## 확인된 강점

- **소스 격리** — `app/api/news/route.ts`의 `fetchSource()`는 소스별로 `urls` 배열(폴백 URL,
  예: SecurityWeek는 feedburner 실패 시 자체 도메인 `/feed/`로 재시도)을 순차 시도하고,
  `SOURCES.map(fetchSource)`를 `Promise.all`로 병렬 실행하면서 소스별 실패를 개별 `try/catch`로
  격리. 한 소스(예: 보안뉴스)가 완전히 죽어도 나머지 소스는 정상 반환되고, 실패한 소스는
  `sources` 상태 배열에 `{ok:false, error}`로만 표시되어 UI가 부분 저하로 우아하게 대응.
- **라이브 실패 시 지도가 비지 않음** — `/api/news`가 수집분을 D1에 UPSERT해두고, RSS 3곳이
  전부 죽으면 저장분으로 응답한다. D1 쓰기 실패는 삼켜지므로 마이그레이션 전이거나 D1이
  없는 환경에서도 라이브 응답 자체는 정상 동작한다(기능 저하만 발생, 장애 전파 없음).
- **mitre-groups.json은 핵심 데이터 자산** — 9개 중국계 APT(APT1, APT3, APT10, APT27, APT30,
  APT40, APT41, Salt Typhoon, Volt Typhoon) 각각에 대해 attacker→(C2)→target 좌표, MITRE 공식
  techniques/software/references를 사용자 분석 기반으로 정리해둔 큐레이션 데이터. 로드맵 D
  (TTP 킬체인)·E(GDELT 연동) 등 이후 확장의 기반이 되는 자산이므로 스키마 변경 시 신중히 다룰 것.

## 확인된 약점 (다음 단계에서 다뤄야 할 것)

1. ~~**영속성 없음**~~ → **부분 해결(로드맵 A 1단계 완료)**. `/api/news`가 수집분을 D1
   `articles`에 UPSERT하고, 라이브가 전부 실패하면 저장분으로 응답한다(`degraded:true`).
   `/api/history?days=&country=`로 시계열 조회도 가능. **남은 것**:
   - 수집이 여전히 요청 트리거 기반 — cron/스케줄 적재로 전환 필요(아무도 접속하지 않으면
     아무것도 쌓이지 않음).
   - UPSERT가 매번 enrichment 결과를 덮어쓰므로, 재수집 시점마다 동일 기사의
     severity/category/geo 값이 달라지는 문제는 그대로 남아 있음(추론 자체가 비결정적).
   - `/api/region-intel`은 여전히 저장 없이 매번 재조회.

2. **날짜 처리 취약** — `app/api/news/route.ts:102`의
   `new Date(publishedAt || Date.now()).toISOString()` 패턴이 두 가지 문제를 가짐:
   - RSS 항목에 `pubDate`가 없으면 "지금"으로 위조되어, 실제로는 오래된 기사가
     최신 기사처럼 정렬·표시됨.
   - `publishedAt` 문자열이 존재하지만 `Date.parse`가 실패하는 포맷이면 `Invalid Date`가
     되고 `.toISOString()`이 `RangeError`를 throw — 해당 소스 fetch 전체가 catch로
     떨어져 그 소스가 통째로 실패 처리됨. `/api/region-intel`도 동일 패턴(`route.ts:29`).

3. **지역 추론이 배열 순서 기반** — `inferLocation()`(`app/api/news/route.ts:66-82`)이
   `LOCATIONS` 배열을 순서대로 훑어 첫 매치를 `target`, 두 번째 매치를 `origin`으로
   고정 할당. 기사 본문에 국가가 언급된 순서와 실제 "공격자→피해자" 의미 관계가
   무관하므로 표적/발신지가 쉽게 뒤바뀜(오귀속). `geoConfidence`도 실제 신뢰도 계산이
   아니라 `target`/`origin` 존재 여부만으로 82/68/38 세 값 중 하나를 하드코딩해서 반환.

4. **배포 환경 egress 차단** → **완화됨**. RSS 3곳이 전부 실패해도 `/api/news`가 D1
   저장분을 반환하므로 지도가 비지 않고, 응답의 `degraded:true`를 받은 `app/page.tsx`가
   헤더·푸터 상태와 지구본 상단 `archive-banner`로 "저장된 관측 데이터 표시 중"을 명시한다.
   **단 D1이 비어 있는 최초 배포에서는 여전히 `fallback` 더미 1건으로 주저앉는다** —
   최소 한 번은 egress가 열린 상태에서 수집이 성공해야 폴백이 의미를 가짐.
   **실제로 라이브 배포(chatgpt.site)에서 지도가 통째로 비었던 사례는 코드 버그가 아니라
   배포 환경의 아웃바운드(egress) 차단으로 RSS fetch 3곳이 전부 실패한 것이 원인이었음.**
   수집 로직은 전부 서버 측(API 라우트) 실행이라 브라우저 CORS 문제는 아니며, egress가
   열린 환경에서는 정상 동작함 — 원인 진단 시 코드보다 배포 환경의 네트워크 정책부터 확인할 것.

## 발전 로드맵

- **A. 영속성** — (진행 중) D1 schema 정의·기사 UPSERT 적재·`/api/history` 조회까지 완료.
  **남은 작업**: RSS 수집을 cron/스케줄 기반 적재로 전환(현재는 요청이 와야만 쌓임),
  `/api/region-intel` 결과 캐시 테이블 추가, `/api/history`를 실제로 쓰는 UI(시계열 뷰).
- **B. 견고화** — 날짜 파싱을 안전한 헬퍼로 교체(파싱 실패 시 throw 대신 null/원본 유지),
  소스별 fetch 실패를 개별 격리해 부분 장애가 전체 UI에 전파되지 않게 함.
  RSS 피드 재시도/타임아웃 정책 도입.
- **C. 귀속 개선** — 배열 순서 기반 target/origin 추론을 근접 문맥(문장 내 위치, 서술 구조)
  기반으로 교체하고, geoConfidence를 실제 신호(매치 개수, 문맥 근접도 등) 기반 계산으로 전환.
- **D. TTP 킬체인** — MITRE ATT&CK tactic 순서(reconnaissance → impact)를 따라 그룹별
  techniques를 킬체인 타임라인으로 시각화, `c2Loc`가 있는 그룹은 attacker→C2→target
  다단 경로를 지구본에 실제로 그리도록 ThreatGlobe 확장.
  ("stealth" 같은 비표준 tactic 라벨 정리도 포함)
- **E. GDELT 연동** — Google News RSS 단발 검색을 GDELT(GKG/이벤트 DB) 기반 대규모
  과거·글로벌 사건 검색으로 확장해 region-intel의 커버리지·정확도 향상.
- **F. 배포 하드닝** — (일부 완료) D1 저장분으로의 graceful degradation과 `degraded` 상태
  UI(`archive-banner`)는 구현됨. **남은 작업**: `source_status` 테이블을 읽는 소스 상태
  대시보드/알림, D1까지 비었을 때의 안내 문구 개선, 피드 재시도·타임아웃 정책.

## 개발 환경 주의사항

- ~~npm 스크립트가 Windows에서 실행되지 않음~~ → **해결**. 유닉스식
  `WRANGLER_LOG_PATH=... vinext ...` 접두사를 제거했다. `vite.config.ts`가 같은 env를
  이미 기본값으로 설정하므로 접두사는 애초에 중복이었고, 제거로 cmd.exe에서도 동작한다.
  (`cross-env` 의존성 불필요)
- **로컬 D1에 마이그레이션 적용** — `npm run db:generate`는 SQL 파일만 만들고 실행하지 않음.
  로컬 반영은 `npm run db:migrate:local`(= `wrangler d1 migrations apply --local`).
  `wrangler.jsonc`의 `database_id`를 바꾸면 miniflare의 로컬 저장소 키가 바뀌어
  **로컬 데이터가 초기화**되므로, 그 뒤에는 위 명령을 다시 돌려야 한다.
- **`tests/rendered-html.test.mjs`는 현재 앱과 맞지 않음** — 원본 스타터 템플릿의 로딩
  스켈레톤을 검사하는 테스트라 Cyber Atlas 코드에서는 통과할 수 없음. `npm test`를 살리려면
  이 테스트부터 현재 앱 기준으로 다시 써야 함.
