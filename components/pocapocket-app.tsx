"use client";

import {
  ArrowRight, BookOpen, Camera, Check, ChevronDown, CircleHelp, Code2,
  Eye, Filter, Heart, ImagePlus, LayoutGrid, Menu, Plus, Search,
  Settings2, Share2, ShieldCheck, Sparkles, Upload, Users, X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { catalogCards, collections, members, recognitionXFeatIndex, type CatalogCard } from "@/modules/catalog";
import { matchPhotoCard, type MatchResponse } from "@/modules/catalog/xfeat-matcher";

type View = "catalog" | "recognize" | "collection" | "settings";
const albumCollectionNames = collections.filter((collection) => catalogCards.some((card) => card.collection === collection && card.category === "album"));
const eventCollectionNames = collections.filter((collection) => !albumCollectionNames.includes(collection));
const navItems = [
  { id: "catalog" as View, label: "포카 명부", icon: BookOpen },
  { id: "recognize" as View, label: "포카 찾기", icon: Camera },
  { id: "collection" as View, label: "나의 포카", icon: LayoutGrid },
];

function Logo() {
  return <span className="brand"><span className="brand-mark"><span>p</span></span><span className="brand-name">포카포켓</span><span className="beta">BETA</span></span>;
}

function CardArtwork({ card, blurred = false, priority = false }: { card: CatalogCard; blurred?: boolean; priority?: boolean }) {
  return <div className={`artwork ${blurred ? "is-blurred" : ""}`}>
    <Image src={card.image} alt={`${card.member} ${card.name}`} fill sizes="(max-width: 760px) 44vw, 220px" priority={priority} />
  </div>;
}

function PhotoCard({ card, owned, onToggle, globalBlur }: { card: CatalogCard; owned: boolean; onToggle: () => void; globalBlur: boolean }) {
  return <article className="photo-card">
    <CardArtwork card={card} blurred={(globalBlur && !owned) || card.sensitive} />
    <div className="card-copy"><div><span className="member-chip">{card.member}</span>{card.rare && <span className="rare-chip">RARE</span>}</div>
      <h3>{card.name}</h3><p>{card.collection}</p>
      <div className="card-bottom"><span className="owned-count"><Users size={13} /> {card.owners.toLocaleString()}명 소장</span><button className={`own-button ${owned ? "owned" : ""}`} onClick={onToggle}>{owned ? <Check size={15} strokeWidth={3} /> : <Plus size={15} strokeWidth={2.5} />}</button></div>
    </div>
  </article>;
}

function Filters({ member, setMember, collection, setCollection }: { member: string; setMember: (v: string) => void; collection: string; setCollection: (v: string) => void }) {
  return <div className="filters" aria-label="포카 필터"><button className={member === "전체" ? "active" : ""} onClick={() => setMember("전체")}>전체</button>
    {members.map((item) => <button key={item} className={member === item ? "active" : ""} onClick={() => setMember(item)}>{item}</button>)}
    <span className="filter-divider" /><label className="select-wrap"><select value={collection} onChange={(e) => setCollection(e.target.value)}><option>모든 앨범 · 이벤트</option><optgroup label="앨범">{albumCollectionNames.map((item) => <option key={item}>{item}</option>)}</optgroup><optgroup label="이벤트 · 기타">{eventCollectionNames.map((item) => <option key={item}>{item}</option>)}</optgroup></select><ChevronDown size={15} /></label>
  </div>;
}

function CatalogView({ owned, toggleOwned, globalBlur, setView }: { owned: string[]; toggleOwned: (id: string) => void; globalBlur: boolean; setView: (v: View) => void }) {
  const [member, setMember] = useState("전체");
  const [collection, setCollection] = useState("모든 앨범 · 이벤트");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(40);
  const filtered = useMemo(() => catalogCards.filter((card) =>
    (member === "전체" || card.member === member || (member === "단체" && card.kind === "group") || (member === "유닛" && card.kind === "unit")) &&
    (collection === "모든 앨범 · 이벤트" || card.collection === collection) && `${card.member} ${card.name} ${card.collection} ${card.source}`.toLowerCase().includes(query.toLowerCase())
  ), [member, collection, query]);
  useEffect(() => setVisibleCount(40), [member, collection, query]);
  return <>
    <section className="hero"><div><span className="eyebrow"><span /> RESCENE PHOTOCARD ARCHIVE</span><h1><span>리센느의 모든 순간을</span><br /><em>한 장씩, 차곡차곡.</em></h1><p>앨범부터 이벤트 특전까지. 포카를 찾고, 기록하고,<br className="desktop-only" /> 나만의 수집 앨범을 완성해 보세요.</p><div className="hero-actions"><button className="primary-button" onClick={() => setView("recognize")}><Camera size={18} /> 사진으로 포카 찾기</button><button className="text-button" onClick={() => document.getElementById("catalog-grid")?.scrollIntoView({ behavior: "smooth" })}>명부 둘러보기 <ArrowRight size={17} /></button></div></div>
      <div className="hero-deck" aria-label="포카 예시"><div className="deck-card deck-left"><CardArtwork card={catalogCards[2]} /></div><div className="deck-card deck-center"><CardArtwork card={catalogCards[0]} priority /></div><div className="deck-card deck-right"><CardArtwork card={catalogCards[4]} /></div><span className="spark spark-one">✦</span><span className="spark spark-two">✦</span><span className="deck-note">현재 <strong>{catalogCards.length}</strong>장의 포카가<br />정리되어 있어요</span></div>
    </section>
    <section className="catalog-section" id="catalog-grid"><div className="section-heading"><div><span className="section-kicker">PHOTOCARD LIST</span><h2>포카 명부</h2><p>멤버와 앨범을 골라 원하는 포카를 찾아보세요.</p></div><label className="catalog-search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="포카명, 멤버, 출처 검색" /></label></div>
      <Filters member={member} setMember={setMember} collection={collection} setCollection={setCollection} /><div className="result-bar"><span><strong>{filtered.length}</strong>장의 포카</span><button><Filter size={14} /> 발매 · 공개 순 <ChevronDown size={13} /></button></div>
      <div className="card-grid">{filtered.slice(0, visibleCount).map((card) => <PhotoCard key={card.id} card={card} owned={owned.includes(card.id)} onToggle={() => toggleOwned(card.id)} globalBlur={globalBlur} />)}</div>
      {visibleCount < filtered.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + 40)}>포카 더 보기 <span>{Math.min(visibleCount, filtered.length)} / {filtered.length}</span></button>}
      {filtered.length === 0 && <div className="empty-state"><Search size={32} /><h3>조건에 맞는 포카가 없어요</h3><p>필터나 검색어를 바꿔보세요.</p></div>}
    </section>
  </>;
}

function RecognizeView({ addOwned }: { addOwned: (id: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null); const cameraRef = useRef<HTMLInputElement>(null); const [preview, setPreview] = useState<string | null>(null); const [status, setStatus] = useState<"idle" | "scanning" | "done" | "empty" | "error">("idle"); const [result, setResult] = useState<MatchResponse | null>(null); const [selectedCandidate, setSelectedCandidate] = useState(0); const [progress, setProgress] = useState(0); const match = result?.candidates[selectedCandidate] ?? null;
  const choose = async (file?: File) => {
    if (!file) return; if (file.size > 15 * 1024 * 1024) { setStatus("error"); return; }
    const objectUrl = URL.createObjectURL(file); setPreview(objectUrl); setStatus("scanning"); setResult(null); setSelectedCandidate(0); setProgress(0);
    try {
      const result = await matchPhotoCard(file, catalogCards, recognitionXFeatIndex, (done, total) => setProgress(Math.round(done / total * 100)));
      setResult(result); setStatus(result ? "done" : "empty");
    } catch (error) { console.error(error); setStatus("error"); }
  };
  const reset = () => { if (preview) URL.revokeObjectURL(preview); setPreview(null); setStatus("idle"); setResult(null); setSelectedCandidate(0); setProgress(0); };
  return <section className="tool-page"><div className="tool-intro"><span className="eyebrow"><span /> ON-DEVICE MATCHING</span><h1>이 포카, 어떤 포카일까요?</h1><p>사진 한 장이면 명부에서 가장 비슷한 포카를 찾아드려요.<br />사진은 서버로 전송되지 않고 내 기기에서만 분석됩니다.</p></div>
    <div className="recognizer-shell"><div className="privacy-pill"><ShieldCheck size={15} /> 100% 기기 내 분석 · 업로드 비용 0원</div>
      {!preview ? <div className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files[0]); }}><span className="upload-icon"><ImagePlus size={30} /></span><strong>포카 사진을 올려주세요</strong><span>정면에 가깝고, 카드 전체가 보이는 사진일수록 정확해요.</span><div className="upload-actions"><button className="camera-button" onClick={() => cameraRef.current?.click()}><Camera size={17} /> 카메라로 촬영</button><button className="gallery-button" onClick={() => inputRef.current?.click()}><Upload size={17} /> 앨범에서 선택</button></div><small>JPG, PNG, WEBP · 최대 15MB</small></div> :
      <div className="scan-layout"><div className="uploaded-photo"><Image src={preview} alt="업로드한 포카" fill unoptimized /><span className={status === "scanning" ? "scan-line" : ""} /><button onClick={reset}><X size={17} /></button></div><div className="scan-result">
        {status === "scanning" ? <><span className="pulse-logo">p</span><h3>특징을 비교하고 있어요</h3><p>XFeat 특징 추출 · 상호 매칭 · 기하 검증</p><div className="progress"><span style={{ width: `${Math.max(8, progress)}%` }} /></div><small>명부의 {catalogCards.length}장과 로컬에서 비교 중 · {progress}%</small></> : status === "done" && match && result ? <><span className={`match-label ${result.confident ? "is-confident" : "is-ambiguous"}`}><Sparkles size={14} /> {result.confident ? "가장 유력한 결과" : "비슷한 후보 중 골라주세요"}</span><div className="matched-card"><CardArtwork card={match.card} /><div><span>{match.card.member}</span><h3>{match.card.name}</h3><p>{match.card.collection}</p><strong>{Math.round(match.confidence * 100)}% 비교 점수 · 검증 특징점 {match.goodMatches}개</strong></div></div>{result.candidates.length > 1 && <div className="candidate-picker"><span>다른 후보</span><div>{result.candidates.map((candidate, index) => <button key={candidate.card.id} className={selectedCandidate === index ? "active" : ""} aria-pressed={selectedCandidate === index} onClick={() => setSelectedCandidate(index)}><CardArtwork card={candidate.card} /><b>{candidate.card.member}</b><small>{Math.round(candidate.confidence * 100)}%</small></button>)}</div></div>}<div className="match-actions"><button className="primary-button" onClick={() => addOwned(match.card.id)}><Plus size={17} /> 이 포카를 나의 포카에 추가</button><button className="secondary-button" onClick={reset}>다른 사진 찾기</button></div><button className="not-match">후보에 없나요? 포카 추가 요청하기</button></> : <><span className="empty-match-icon"><Search size={25} /></span><h3>{status === "error" ? "사진을 분석하지 못했어요" : "일치하는 포카가 없어요"}</h3><p>{status === "error" ? "15MB 이하 JPG, PNG, WEBP 파일로 다시 시도해 주세요." : "확신도가 낮아 임의로 매칭하지 않았어요. 비공개 감춤 상태로 추가를 요청할 수 있어요."}</p><div className="match-actions"><button className="primary-button">포카 추가 요청</button><button className="secondary-button" onClick={reset}>다른 사진 찾기</button></div></>}
      </div></div>}<input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { choose(e.target.files?.[0]); e.currentTarget.value = ""; }} /><input ref={inputRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => { choose(e.target.files?.[0]); e.currentTarget.value = ""; }} />
    </div><div className="recognize-tips"><div><b>01</b><span><strong>카드 전체가 보이게</strong><small>모서리 4개를 프레임 안에 담아주세요.</small></span></div><div><b>02</b><span><strong>반사를 피해 밝게</strong><small>부드러운 자연광이 좋아요.</small></span></div><div><b>03</b><span><strong>기울어져도 괜찮아요</strong><small>자동 원근 보정으로 바로잡아요.</small></span></div></div>
  </section>;
}

function CollectionView({ owned, toggleOwned, globalBlur }: { owned: string[]; toggleOwned: (id: string) => void; globalBlur: boolean }) {
  const ownedCards = catalogCards.filter((card) => owned.includes(card.id)); const total = catalogCards.length; const percent = Math.round((owned.length / total) * 100);
  return <section className="collection-page"><div className="album-header"><div className="profile-avatar">M<span>✦</span></div><div><span className="eyebrow"><span /> MY POCKET</span><h1>모아의 포카 앨범</h1><p>좋아하는 순간을 한 장씩 모으는 중 · 공개 앨범</p></div><button className="secondary-button"><Share2 size={16} /> 공유하기</button></div>
    <div className="collection-stats"><div><strong>{owned.length}</strong><span>보유 포카</span></div><div><strong>{percent}%</strong><span>수집률</span></div><div><strong>{owned.reduce((sum, id) => sum + (catalogCards.find((c) => c.id === id)?.owners ?? 0), 0).toLocaleString()}</strong><span>함께 소장한 팬</span></div><div className="completion"><span>전체 {total}장 중 {owned.length}장</span><div><i style={{ width: `${percent}%` }} /></div></div></div>
    <div className="binder"><div className="binder-rings">{[1,2,3,4,5].map((n) => <i key={n} />)}</div><div className="binder-top"><div><span className="section-kicker">MY COLLECTION</span><h2>SCENEDROME</h2></div><span>{ownedCards.length} / {total}</span></div><div className="binder-grid">{Array.from({ length: 8 }).map((_, index) => { const card = ownedCards[index]; return card ? <div className="binder-slot filled" key={card.id}><CardArtwork card={card} blurred={globalBlur} /><button onClick={() => toggleOwned(card.id)}><X size={13} /></button></div> : <div className="binder-slot" key={index}><Plus size={21} /><span>비어 있음</span></div>; })}</div><span className="page-number">— 01 —</span></div>
  </section>;
}

function SettingsView({ globalBlur, setGlobalBlur }: { globalBlur: boolean; setGlobalBlur: (v: boolean) => void }) {
  const [flags, setFlags] = useState({ recognition: true, collections: true, publicAlbums: true, requests: true }); const toggle = (key: keyof typeof flags) => setFlags((current) => ({ ...current, [key]: !current[key] }));
  const flagCopy = { recognition: ["사진 인식", "포카 사진 매칭과 촬영 추가"], collections: ["나의 포카", "개인 소장 앨범과 수집률"], publicAlbums: ["공개 앨범", "다른 유저의 앨범 열람"], requests: ["포카 추가 요청", "미인식 포카 관리자 검수 큐"] };
  return <section className="settings-page"><div className="settings-title"><span className="eyebrow"><span /> DEVELOPER CONTROL</span><h1>사이트 설정</h1><p>코드 수정 없이 팬사이트에 필요한 기능만 골라 켜고 끌 수 있어요.</p></div><div className="settings-grid">
    <div className="settings-card"><h2><Settings2 size={19} /> 기능 플래그</h2><p>모든 옵션은 <code>site.config.ts</code>에서도 관리할 수 있습니다.</p>{Object.entries(flagCopy).map(([key, value]) => <label className="setting-row" key={key}><span><strong>{value[0]}</strong><small>{value[1]}</small></span><input type="checkbox" checked={flags[key as keyof typeof flags]} onChange={() => toggle(key as keyof typeof flags)} /><i /></label>)}</div>
    <div className="settings-card"><h2><Eye size={19} /> 이미지 공개 설정</h2><p>저작권 정책에 맞게 명부 이미지를 일괄 제어합니다.</p><div className="radio-stack"><label><input type="radio" checked={!globalBlur} onChange={() => setGlobalBlur(false)} /><span><b>원본 이미지</b><small>모든 방문자에게 원본을 표시합니다.</small></span></label><label><input type="radio" checked={globalBlur} onChange={() => setGlobalBlur(true)} /><span><b>블러 이미지</b><small>미소장 포카 이미지를 흐리게 표시합니다.</small></span></label></div><div className="info-callout"><CircleHelp size={17} /><span>‘나의 포카’에서 소장 체크된 이미지만 원본으로 보여주는 방식도 지원합니다.</span></div></div>
    <div className="settings-card wide"><div><h2><Code2 size={19} /> 팬사이트에 명부 인용하기</h2><p>데이터와 명부 UI만 독립적으로 설치하거나, iframe으로 바로 삽입하세요.</p></div><div className="code-box"><span>npm</span><code>npm install @pocapocket/catalog-core</code><button onClick={() => navigator.clipboard?.writeText("npm install @pocapocket/catalog-core")}><Code2 size={15} /></button></div><div className="embed-features"><span><Check size={14} /> UI 테마 변경</span><span><Check size={14} /> JSON/CSV 가져오기</span><span><Check size={14} /> 프레임워크 독립 코어</span><span><Check size={14} /> 자체 호스팅</span></div></div>
  </div></section>;
}

export default function PocaPocketApp() {
  const [view, setView] = useState<View>("catalog"); const [owned, setOwned] = useState<string[]>(catalogCards.slice(0, 3).map((card) => card.id)); const [globalBlur, setGlobalBlur] = useState(false); const [mobileOpen, setMobileOpen] = useState(false); const [toast, setToast] = useState("");
  const toggleOwned = (id: string) => setOwned((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const addOwned = (id: string) => { setOwned((current) => current.includes(id) ? current : [...current, id]); setToast("나의 포카에 추가했어요"); window.setTimeout(() => setToast(""), 2400); };
  const navigate = (next: View) => { setView(next); setMobileOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return <main><header className="site-header"><button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <Menu />}</button><button className="logo-button" onClick={() => navigate("catalog")}><Logo /></button><nav className={mobileOpen ? "open" : ""}>{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><item.icon size={17} /> {item.label}</button>)}</nav><div className="header-actions"><button className="icon-button"><Heart size={18} /></button><button className="profile-button" onClick={() => navigate("collection")}>M</button><button className="icon-button desktop-settings" onClick={() => navigate("settings")}><Settings2 size={18} /></button></div></header>
    {view === "catalog" && <CatalogView owned={owned} toggleOwned={toggleOwned} globalBlur={globalBlur} setView={navigate} />}{view === "recognize" && <RecognizeView addOwned={addOwned} />}{view === "collection" && <CollectionView owned={owned} toggleOwned={toggleOwned} globalBlur={globalBlur} />}{view === "settings" && <SettingsView globalBlur={globalBlur} setGlobalBlur={setGlobalBlur} />}
    <footer><Logo /><p>팬이 만들고, 팬이 함께 채우는 오픈 포토카드 아카이브.</p><div><a href="https://github.com" target="_blank">GitHub</a><a href="https://rescene.stream/apps/photocards" target="_blank" rel="noreferrer">포카 자료 출처</a><button onClick={() => navigate("settings")}>개발자 설정</button><span>MIT License</span></div><small>포카 이미지·메타데이터: 리센느 음원총공팀 포카사전 · 인식: XFeat (Apache-2.0). RESCENE 및 포토카드 권리는 각 권리자에게 있습니다.</small></footer>{toast && <div className="toast"><Check size={16} /> {toast}</div>}
  </main>;
}
