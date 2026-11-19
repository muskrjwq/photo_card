"use client";
import '@/app/draw.css';
import { useEffect, useState } from 'react';
import { catalogCards } from '@/modules/catalog';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useI18n } from '@/lib/i18n';

export default function DailyDraw() {
 const {t,memberLabel,collectionLabel}=useI18n();
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<{card_id:string;remaining:number;duplicate:boolean}|null>(null);
 const [remaining,setRemaining]=useState<number|null>(null);
 const [message,setMessage]=useState('');
 useEffect(()=>{let active=true; const client=getSupabaseBrowserClient();
 void client?.auth.getUser().then(async ({data})=>{if(!data.user)return;
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 const {count,error}=await client.from('card_draws').select('id',{count:'exact',head:true}).eq('user_id',data.user.id).eq('draw_day',day);
 if(active&&!error)setRemaining(Math.max(0,20-(count??0)));});return()=>{active=false;};},[]);
 const draw=async()=>{if(busy)return;setBusy(true);setResult(null);setMessage('');
 try {const client=getSupabaseBrowserClient();if(!client)throw new Error(t('로그인 연결을 확인해 주세요.','Please check the sign-in connection.'));
 const {data:user}=await client.auth.getUser();if(!user.user)throw new Error(t('Google 로그인 후 뽑을 수 있어요.','Sign in with Google to draw a card.'));
 const [response]=await Promise.all([client.rpc('draw_photocard'),new Promise(resolve=>setTimeout(resolve,1800))]);
 if(response.error)throw new Error(response.error.message.includes('daily_limit')?t('오늘의 20회를 모두 사용했어요. 한국 시간 자정에 다시 만나요.','You used all 20 draws today. Try again at midnight KST.'):t('뽑기를 완료하지 못했어요. 잠시 후 다시 확인해 주세요.','The draw could not be completed. Please try again later.'));
 setResult(response.data);setRemaining(response.data.remaining);window.dispatchEvent(new Event('pocapocket:collection-updated'));
 }catch(error){setMessage(error instanceof Error?error.message:t('다시 시도해 주세요.','Please try again.'));}finally{setBusy(false);}};
 const card=catalogCards.find(c=>c.id===result?.card_id);
 return <section className="daily-draw"><div className="tool-intro"><span className="eyebrow">DAILY POCKET</span><h1>{t('오늘의 작은 설렘','Your daily surprise')}</h1><p>{t('어떤 멤버가 찾아올까요? 하루 20번, 무료로 만나는 포카.','Which member will appear? Enjoy 20 free draws each day.')}</p></div>
 <div className={`draw-stage ${busy?'opening':''} ${result?'revealed':''}`} aria-busy={busy}>
 <div className="draw-orbit"/><div className="draw-sparkles" aria-hidden="true">✦　✧　✦　✧　✦</div>
 {card?<div className="draw-prize" key={result?.card_id}><img src={card.image} alt={`${memberLabel(card.member)} ${card.name}`}/><span>✦ {result?.duplicate?t('다시 만난 포카','Duplicate card'):t('새로운 만남','New card')}</span><h2>{memberLabel(card.member)} · {card.name}</h2><p>{collectionLabel(card.collection)}</p></div>:<div className="draw-pack"><span>RESCENE</span><b>p</b><small>YOUR DAILY POCKET</small></div>}
 </div><div className="draw-controls"><p aria-live="polite">{busy?t('빛나는 순간을 꺼내는 중…','Revealing your card…'):result?t('나의 포카에 저장했어요','Saved to My Cards'):remaining===null?t('로그인하면 오늘의 남은 횟수를 확인할 수 있어요','Sign in to check today’s remaining draws'):t(`오늘 ${remaining}회 남았어요`,`${remaining} draws left today`)}</p><button className="primary-button" disabled={busy} onClick={()=>void draw()}>{busy?t('포카를 여는 중…','Opening card…'):t('✦ 포카 한 장 뽑기','✦ Draw a card')}{remaining!==null&&!busy?` · ${remaining}/20`:''}</button><p role="status">{message}</p><small>{t('한국 시간 자정 초기화 · 모든 카드 동일 확률 · 중복도 1회 사용','Resets at midnight KST · Equal odds for all cards · Duplicates use one draw')}</small></div></section>;
}

export function AcquisitionBadge({cardId}:{cardId:string}) {
 const {t}=useI18n();
 const [tags,setTags]=useState({photo_verified:false,drawn:false});
 useEffect(()=>{let active=true; const refresh=async()=>{const client=getSupabaseBrowserClient();if(!client)return;const {data}=await client.auth.getUser();if(!data.user)return;
 // Shared request cache prevents one request per card.
 const key=data.user.id;
 if(!provenanceCache.has(key))provenanceCache.set(key,client.rpc('card_provenance',{owner_id:key}).then(r=>r.data??[]));
 const rows=await provenanceCache.get(key)!;if(active)setTags(rows.find(r=>r.card_id===cardId)??{photo_verified:false,drawn:false});};
 const update=()=>{provenanceCache.clear();void refresh();};void refresh();window.addEventListener('pocapocket:collection-updated',update);return()=>{active=false;window.removeEventListener('pocapocket:collection-updated',update);};},[cardId]);
 return tags.photo_verified||tags.drawn?<span className={`acquisition-badge ${tags.drawn?'drawn':''}`}>{tags.photo_verified?t('✓ 사진 인증 ','✓ Photo verified '):''}{tags.drawn?t('✦ 뽑기','✦ Draw'):''}</span>:null;
}
const provenanceCache=new Map<string,PromiseLike<Array<{card_id:string;photo_verified:boolean;drawn:boolean}>>>();
