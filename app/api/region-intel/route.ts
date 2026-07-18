import { XMLParser } from "fast-xml-parser";
import mitreData from "../../data/mitre-groups.json";

export const dynamic = "force-dynamic";

const parser = new XMLParser({ignoreAttributes:false,processEntities:true,trimValues:true});
const COUNTRY_TERMS:Record<string,string[]>={
  "United States of America":["미국"],"South Korea":["대한민국","한국"],"North Korea":["북한"],China:["중국"],Japan:["일본"],Germany:["독일"],France:["프랑스"],"United Kingdom":["영국"],Russia:["러시아"],Ukraine:["우크라이나"],Australia:["호주"],Canada:["캐나다"],Iran:["이란"],Israel:["이스라엘"],India:["인도"],Brazil:["브라질"],Malaysia:["말레이시아","동남아"],Indonesia:["인도네시아","동남아"],Singapore:["싱가포르"]
};

function asArray<T>(value:T|T[]|undefined):T[]{return value==null?[]:Array.isArray(value)?value:[value]}
function text(value:unknown):string{if(typeof value==="string"||typeof value==="number")return String(value);if(value&&typeof value==="object"){const record=value as Record<string,unknown>;return text(record["#text"]??record["__cdata"]??record["@_url"]??"")}return ""}
function category(title:string){if(/ransom/i.test(title))return "Ransomware";if(/breach|leak|stolen data/i.test(title))return "Data breach";if(/apt|state-sponsored|espionage|spy/i.test(title))return "Nation-state";if(/infrastructure|power|water|telecom/i.test(title))return "Infrastructure";if(/vulnerab|zero.day|exploit/i.test(title))return "Vulnerability";return "Cyber incident"}

export async function GET(request:Request){
  const {searchParams}=new URL(request.url);
  const country=(searchParams.get("country")||"").trim();
  if(!/^[\p{L} .'-]{2,80}$/u.test(country))return Response.json({error:"valid country is required"},{status:400});
  const query=`"${country}" ("cyber attack" OR cyberattack OR ransomware OR "data breach" OR "state-sponsored") when:10y`;
  const feedUrl=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  let articles:{title:string;link:string;publishedAt:string;source:string;category:string}[]=[];
  let searchOk=false;
  let searchError="";
  try{
    const response=await fetch(feedUrl,{headers:{"User-Agent":"CyberAtlas/1.0 (+private OSINT feed reader)",Accept:"application/rss+xml,text/xml"}});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const xml=await response.text();
    const parsed=parser.parse(xml) as {rss?:{channel?:{item?:Record<string,unknown>|Record<string,unknown>[]}}};
    const normalized=asArray(parsed.rss?.channel?.item).map(item=>({title:text(item.title),link:text(item.link),publishedAt:new Date(text(item.pubDate)||Date.now()).toISOString(),source:text(item.source)||"News publisher",category:category(text(item.title))})).filter(item=>item.title&&item.link);
    const older=normalized.filter(item=>Date.now()-Date.parse(item.publishedAt)>30*86400000);
    articles=(older.length>=4?older:normalized).slice(0,10);
    searchOk=true;
  }catch(error){searchError=error instanceof Error?error.message:String(error)}
  const terms=COUNTRY_TERMS[country]||[country];
  const mitreCases=mitreData.groups.filter(group=>terms.some(term=>group.targetLabel.toLowerCase().includes(term.toLowerCase()))).map(group=>({id:group.id,key:group.key,title:group.operationType,target:group.targetLabel,mitreUrl:group.mitreUrl,references:group.references.slice(0,2)}));
  const categories=Object.entries(articles.reduce<Record<string,number>>((counts,item)=>{counts[item.category]=(counts[item.category]||0)+1;return counts},{})).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
  return Response.json({country,mode:"historical",articles,mitreCases,categories,search:{ok:searchOk,provider:"Google News RSS",error:searchError},searchedAt:new Date().toISOString()},{headers:{"Cache-Control":"public, max-age=300, s-maxage=21600, stale-while-revalidate=86400"}});
}
