import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase:new URL("https://cyber-atlas-korea.accompanyoung.chatgpt.site"),
  title:"Cyber Atlas — 실시간 지정학 사이버 위협 지도",
  description:"The Hacker News, SecurityWeek, 보안뉴스를 실시간 수집해 국가·지역별로 매핑하는 3D OSINT 관측망",
  icons:{icon:"/favicon.svg"},
  openGraph:{title:"Cyber Atlas",description:"Live Geopolitical Threat Intelligence",images:[{url:"/og.png",width:1728,height:920,alt:"Cyber Atlas live threat intelligence globe"}]},
  twitter:{card:"summary_large_image",title:"Cyber Atlas",description:"Live Geopolitical Threat Intelligence",images:["/og.png"]},
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
