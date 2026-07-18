import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"Cyber Atlas — 지정학 사이버 위협 지도", description:"국가·지역별 사이버 위협을 관측하고 예측하는 OSINT 시스템 지도", icons:{icon:"/favicon.svg"} };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
