"use client";

import {
  ArrowRight, BookOpen, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Code2,
  Eye, FilePlus2, Filter, ImagePlus, LayoutGrid, LogIn, LogOut, Menu, Pencil, Plus, Search,
  Settings2, Share2, ShieldCheck, Upload, Users, X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { catalogCards, collections, members, recognitionXFeatIndex, type CatalogCard } from "@/modules/catalog";
import { getCatalogChronology } from "@/modules/catalog/chronology";
import { matchPhotoCard, type MatchResponse } from "@/modules/catalog/xfeat-matcher";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import LocalCardEditor from "@/components/local-card-editor";
import ProfileSetup, { type UserProfile } from "@/components/profile-setup";

type View = "catalog" | "recognize" | "collection" | "settings";
type AuthUser = { id: string; email: string | null; name: string; avatarUrl: string | null };
type CatalogSort = "release-asc" | "release-desc" | "owners-desc" | "owners-asc";
const albumCollectionNames = collections.filter((collection) => catalogCards.some((card) => card.collection === collection && card.category === "album"));
const eventCollectionNames = collections.filter((collection) => !albumCollectionNames.includes(collection));
const catalogReleaseOrder = new Map(catalogCards.map((card, index) => [card.id, index]));
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

function PhotoCard({ card, owned, revealed, ownerCount, onToggle, onOpen, globalBlur }: { card: CatalogCard; owned: boolean; revealed: boolean; ownerCount: number; onToggle: () => void; onOpen: () => void; globalBlur: boolean }) {
  return <article className="photo-card" role="button" tabIndex={0} aria-label={`${card.member} ${card.name} 상세보기`} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}>
    <CardArtwork card={card} blurred={(globalBlur && !revealed) || card.sensitive} />
    <div className="card-copy"><div><span className="member-chip">{card.member}</span>{card.rare && <span className="rare-chip">RARE</span>}</div>
      <h3>{card.name}</h3><p>{card.collection}</p>
      <div className="card-bottom"><span className="owned-count"><Users size={13} /> {(owned ? Math.max(1, ownerCount) : ownerCount).toLocaleString()}명 소장</span><button className={`own-button ${owned ? "owned" : ""}`} aria-label={owned ? "나의 포카에서 제거" : "나의 포카에 추가"} onClick={(event) => { event.stopPropagation(); onToggle(); }}>{owned ? <Check size={15} strokeWidth={3} /> : <Plus size={15} strokeWidth={2.5} />}</button></div>
    </div>
  </article>;
}

function CardDetailModal({ card, seriesCards, ownedIds, revealedIds, globalBlur, onToggle, onSelect, onEdit, onClose }: { card: CatalogCard; seriesCards: CatalogCard[]; ownedIds: string[]; revealedIds: string[]; globalBlur: boolean; onToggle: () => void; onSelect: (card: CatalogCard) => void; onEdit?: () => void; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);
  const owned = ownedIds.includes(card.id);
  const relatedCards = seriesCards.filter((item) => item.id !== card.id);
  const detailTags = card.tags.filter((tag) => tag !== card.member && tag !== card.source && tag !== card.name);
  return <div className="card-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="card-modal" role="dialog" aria-modal="true" aria-labelledby="card-modal-title">
      <button className="card-modal-close" aria-label="닫기" onClick={onClose}><X size={20} /></button>
      <div className="card-modal-main">
        <div className="card-modal-art"><CardArtwork card={card} blurred={(globalBlur && !revealedIds.includes(card.id)) || card.sensitive} priority /></div>
        <div className="card-modal-copy">
          <div><span className="member-chip">{card.member}</span><span className="detail-category">{card.category === "album" ? "앨범" : "이벤트"}</span></div>
          <h2 id="card-modal-title">{card.name}</h2>
          <p className="detail-collection">{card.collection}</p>
          <dl className="card-detail-list"><div><dt>출처</dt><dd>{card.source}</dd></div><div><dt>소장 현황</dt><dd>{owned ? "내가 소장한 포카" : "미소장 포카"}</dd></div><div><dt>같은 시리즈</dt><dd>{seriesCards.length}장</dd></div></dl>
          {detailTags.length > 0 && <div className="detail-tags">{detailTags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div>}
          <div className="detail-actions">{onEdit && <button className="detail-edit-button" onClick={onEdit}><Pencil size={16} /> 편집</button>}<button className={`detail-own-button ${owned ? "owned" : ""}`} onClick={onToggle}>{owned ? <><Check size={17} /> 나의 포카에서 제거</> : <><Plus size={17} /> 나의 포카에 추가</>}</button></div>
        </div>
      </div>
      <div className="series-section"><div><span className="section-kicker">SAME SERIES</span><h3>같은 시리즈의 다른 포카</h3><p>같은 콘셉트로 발매된 다른 멤버 포카예요.</p></div>
        {relatedCards.length > 0 ? <div className="series-card-list">{relatedCards.map((item) => <button key={item.id} onClick={() => onSelect(item)}><CardArtwork card={item} blurred={(globalBlur && !revealedIds.includes(item.id)) || item.sensitive} /><span>{item.member}</span><small>{item.name}</small></button>)}</div> : <div className="series-empty">이 시리즈에는 등록된 다른 멤버 포카가 없어요.</div>}
      </div>
    </section>
  </div>;
}

function Filters({ member, setMember, collection, setCollection }: { member: string; setMember: (v: string) => void; collection: string; setCollection: (v: string) => void }) {
  return <div className="filters" aria-label="포카 필터"><div className="member-filter-scroll"><button className={member === "전체" ? "active" : ""} onClick={() => setMember("전체")}>전체</button>
    {members.map((item) => <button key={item} className={member === item ? "active" : ""} onClick={() => setMember(item)}>{item}</button>)}</div>
    <span className="filter-divider" /><label className="select-wrap"><select value={collection} onChange={(e) => setCollection(e.target.value)}><option>모든 앨범 · 이벤트</option><optgroup label="앨범">{albumCollectionNames.map((item) => <option key={item}>{item}</option>)}</optgroup><optgroup label="이벤트 · 기타">{eventCollectionNames.map((item) => <option key={item}>{item}</option>)}</optgroup></select><ChevronDown size={15} /></label>
  </div>;
}

function CatalogView({ owned, revealedIds, ownerCounts, toggleOwned, globalBlur, setView, localAdminAccess }: { owned: string[]; revealedIds: string[]; ownerCounts: Record<string, number>; toggleOwned: (id: string) => void; globalBlur: boolean; setView: (v: View) => void; localAdminAccess: boolean }) {
  const [member, setMember] = useState("전체");
  const [collection, setCollection] = useState("모든 앨범 · 이벤트");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(40);
  const [columns, setColumns] = useState(4);
  const [sort, setSort] = useState<CatalogSort>("release-asc");
  const [selectedCard, setSelectedCard] = useState<CatalogCard | null>(null);
  const [editorCard, setEditorCard] = useState<CatalogCard | "new" | null>(null);
  const filtered = useMemo(() => {
    const cards = catalogCards.filter((card) =>
    (member === "전체" || card.member === member || (member === "단체" && card.kind === "group") || (member === "유닛" && card.kind === "unit")) &&
    (collection === "모든 앨범 · 이벤트" || card.collection === collection) && `${card.member} ${card.name} ${card.collection} ${card.source}`.toLowerCase().includes(query.toLowerCase())
    );
    return cards.sort((a, b) => {
      const releaseDifference = (catalogReleaseOrder.get(a.id) ?? 0) - (catalogReleaseOrder.get(b.id) ?? 0);
      const chronologyDifference = getCatalogChronology(a) - getCatalogChronology(b);
      if (sort === "release-desc") return -chronologyDifference || releaseDifference;
      if (sort === "owners-desc") return (ownerCounts[b.id] ?? 0) - (ownerCounts[a.id] ?? 0) || releaseDifference;
      if (sort === "owners-asc") return (ownerCounts[a.id] ?? 0) - (ownerCounts[b.id] ?? 0) || releaseDifference;
      return chronologyDifference || releaseDifference;
    });
  }, [member, collection, query, sort, ownerCounts]);
  useEffect(() => setVisibleCount(40), [member, collection, query, sort]);
  useEffect(() => {
    const saved = Number(window.localStorage.getItem("pocapocket.catalogColumns"));
    if (Number.isInteger(saved) && saved >= 2 && saved <= 8) setColumns(saved);
  }, []);
  const changeColumns = (value: number) => {
    setColumns(value);
    window.localStorage.setItem("pocapocket.catalogColumns", String(value));
  };
  return <>
    <section className="hero"><div><span className="eyebrow"><span /> RESCENE PHOTOCARD ARCHIVE</span><h1><span>리센느의 모든 순간을</span><br /><em>한 장씩, 차곡차곡.</em></h1><p>앨범부터 이벤트 특전까지. 포카를 찾고, 기록하고,<br className="desktop-only" /> 나만의 수집 앨범을 완성해 보세요.</p><div className="hero-actions"><button className="primary-button" onClick={() => setView("recognize")}><Camera size={18} /> 사진으로 포카 찾기</button><button className="text-button" onClick={() => document.getElementById("catalog-grid")?.scrollIntoView({ behavior: "smooth" })}>명부 둘러보기 <ArrowRight size={17} /></button></div></div>
      <div className="hero-deck" aria-label="포카 예시"><div className="deck-card deck-left"><CardArtwork card={catalogCards[2]} blurred={globalBlur && !revealedIds.includes(catalogCards[2].id)} /></div><div className="deck-card deck-center"><CardArtwork card={catalogCards[0]} blurred={globalBlur && !revealedIds.includes(catalogCards[0].id)} priority /></div><div className="deck-card deck-right"><CardArtwork card={catalogCards[4]} blurred={globalBlur && !revealedIds.includes(catalogCards[4].id)} /></div><span className="spark spark-one">✦</span><span className="spark spark-two">✦</span><span className="deck-note">현재 <strong>{catalogCards.length}</strong>장의 포카가<br />정리되어 있어요</span></div>
    </section>
    <section className="catalog-section" id="catalog-grid"><div className="section-heading"><div><span className="section-kicker">PHOTOCARD LIST</span><h2>포카 명부</h2><p>멤버와 앨범을 골라 원하는 포카를 찾아보세요.</p></div><div className="catalog-heading-actions"><label className="catalog-search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="포카명, 멤버, 출처 검색" /></label>{localAdminAccess && <button className="local-add-button" onClick={() => setEditorCard("new")}><FilePlus2 size={16} /> 새 포카 추가</button>}</div></div>
      <Filters member={member} setMember={setMember} collection={collection} setCollection={setCollection} /><div className="result-bar"><span><strong>{filtered.length}</strong>장의 포카</span><div className="result-controls"><label className="column-slider"><LayoutGrid size={14} /><span>한 줄 <strong>{columns}</strong>장</span><input type="range" min="2" max="8" step="1" value={columns} aria-label={`한 줄에 ${columns}장 표시`} onChange={(event) => changeColumns(Number(event.target.value))} /></label><label className="sort-wrap"><Filter size={14} /><select value={sort} aria-label="포카 정렬 순서" onChange={(event) => setSort(event.target.value as CatalogSort)}><option value="release-asc">발매 · 공개 순</option><option value="release-desc">최신순</option><option value="owners-desc">소장 많은 순</option><option value="owners-asc">소장 적은 순</option></select><ChevronDown size={13} /></label></div></div>
      <div className="card-grid" style={{ "--catalog-columns": columns, "--catalog-tablet-columns": Math.min(columns, 4) } as CSSProperties}>{filtered.slice(0, visibleCount).map((card) => <PhotoCard key={card.id} card={card} owned={owned.includes(card.id)} revealed={revealedIds.includes(card.id)} ownerCount={ownerCounts[card.id] ?? 0} onToggle={() => toggleOwned(card.id)} onOpen={() => setSelectedCard(card)} globalBlur={globalBlur} />)}</div>
      {visibleCount < filtered.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + 40)}>포카 더 보기 <span>{Math.min(visibleCount, filtered.length)} / {filtered.length}</span></button>}
      {filtered.length === 0 && <div className="empty-state"><Search size={32} /><h3>조건에 맞는 포카가 없어요</h3><p>필터나 검색어를 바꿔보세요.</p></div>}
      {selectedCard && <CardDetailModal card={selectedCard} seriesCards={catalogCards.filter((card) => card.idNumber === selectedCard.idNumber)} ownedIds={owned} revealedIds={revealedIds} globalBlur={globalBlur} onToggle={() => toggleOwned(selectedCard.id)} onSelect={setSelectedCard} onEdit={localAdminAccess ? () => { setEditorCard(selectedCard); setSelectedCard(null); } : undefined} onClose={() => setSelectedCard(null)} />}
      {editorCard && <LocalCardEditor card={editorCard === "new" ? undefined : editorCard} onClose={() => setEditorCard(null)} />}
    </section>
  </>;
}

type BatchRecognitionItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: "queued" | "scanning" | "matched" | "unmatched" | "error";
  progress: number;
  result: MatchResponse | null;
};

function RecognizeView({ addOwned, revealedIds, globalBlur }: { addOwned: (id: string, silent?: boolean) => Promise<void>; revealedIds: string[]; globalBlur: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const runIdRef = useRef(0);
  const [items, setItems] = useState<BatchRecognitionItem[]>([]);
  const [notice, setNotice] = useState("");
  const [addingAll, setAddingAll] = useState(false);
  const [addedIds, setAddedIds] = useState<string[]>([]);

  const matchedItems = items.filter((item) => item.status === "matched" && item.result);
  const uniqueMatches = Array.from(new Map(matchedItems.map((item) => [item.result!.match.card.id, item.result!.match])).values());
  const finishedCount = items.filter((item) => !["queued", "scanning"].includes(item.status)).length;
  const isProcessing = items.some((item) => item.status === "queued" || item.status === "scanning");

  useEffect(() => () => {
    runIdRef.current += 1;
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const updateItem = (id: string, patch: Partial<BatchRecognitionItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };
  const reset = () => {
    runIdRef.current += 1;
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
    setItems([]); setNotice(""); setAddedIds([]); setAddingAll(false);
  };
  const chooseFiles = async (selected?: FileList | File[]) => {
    if (!selected?.length) return;
    const files = Array.from(selected).slice(0, 10);
    const validFiles = files.filter((file) => file.size <= 15 * 1024 * 1024 && (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name)));
    if (!validFiles.length) { setNotice("15MB 이하 JPG, PNG, WEBP 사진을 선택해 주세요."); return; }
    runIdRef.current += 1;
    const thisRun = runIdRef.current;
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    const prepared = validFiles.map((file, index) => ({ id: `${thisRun}-${index}`, file, previewUrl: URL.createObjectURL(file), status: "queued" as const, progress: 0, result: null }));
    previewUrlsRef.current = prepared.map((item) => item.previewUrl);
    setItems(prepared); setAddedIds([]);
    setNotice(selected.length > 10 ? "한 번에 최대 10장까지 분석해요. 앞의 10장만 불러왔습니다." : validFiles.length < files.length ? "15MB를 넘거나 지원하지 않는 파일은 제외했습니다." : "");
    for (const item of prepared) {
      if (runIdRef.current !== thisRun) break;
      updateItem(item.id, { status: "scanning", progress: 0 });
      try {
        const result = await matchPhotoCard(item.file, catalogCards, recognitionXFeatIndex, (done, total) => {
          if (runIdRef.current === thisRun) updateItem(item.id, { progress: Math.round(done / total * 100) });
        });
        if (runIdRef.current !== thisRun) break;
        updateItem(item.id, { result, progress: 100, status: result ? "matched" : "unmatched" });
      } catch (error) {
        console.error(error);
        if (runIdRef.current === thisRun) updateItem(item.id, { status: "error", progress: 100 });
      }
    }
  };
  const addOne = async (id: string, silent = false) => {
    await addOwned(id, silent);
    setAddedIds((current) => [...new Set([...current, id])]);
  };
  const addAll = async () => {
    setAddingAll(true);
    for (const match of uniqueMatches) if (!addedIds.includes(match.card.id)) await addOne(match.card.id, true);
    setAddingAll(false);
    setNotice(`중복을 제외한 포카 ${uniqueMatches.length}장을 나의 포카에 추가했어요.`);
  };

  return <section className="tool-page"><div className="tool-intro"><span className="eyebrow"><span /> ON-DEVICE MATCHING</span><h1>여러 장도 한 번에 찾아요</h1><p>최대 10장의 포카 사진을 차례로 분석해 명부에서 찾아드려요.<br />사진은 서버로 전송되지 않고 내 기기에서만 분석됩니다.</p></div>
    <div className="recognizer-shell batch-recognizer"><div className="privacy-pill"><ShieldCheck size={15} /> 100% 기기 내 분석 · 업로드 비용 0원</div>
      {items.length === 0 ? <div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void chooseFiles(event.dataTransfer.files); }}><span className="upload-icon"><ImagePlus size={30} /></span><strong>포카 사진을 올려주세요</strong><span>여러 장을 한꺼번에 선택하면 순서대로 안전하게 분석해요.</span><div className="upload-actions"><button className="camera-button" onClick={() => cameraRef.current?.click()}><Camera size={17} /> 카메라로 촬영</button><button className="gallery-button" onClick={() => inputRef.current?.click()}><Upload size={17} /> 여러 장 선택</button></div><small>JPG, PNG, WEBP · 장당 최대 15MB · 한 번에 최대 10장</small></div> :
      <div className="batch-results"><div className="batch-toolbar"><div><strong>{isProcessing ? "포카를 분석하고 있어요" : "분석을 마쳤어요"}</strong><span>{finishedCount} / {items.length}장 완료 · {uniqueMatches.length}종 인식</span></div><div><button className="secondary-button" disabled={isProcessing} onClick={() => inputRef.current?.click()}><Upload size={15} /> 다시 선택</button><button className="batch-reset" aria-label="분석 닫기" onClick={reset}><X size={18} /></button></div></div><div className="batch-overall-progress"><span style={{ width: `${items.length ? Math.round(finishedCount / items.length * 100) : 0}%` }} /></div>
        {notice && <p className="batch-notice">{notice}</p>}
        <div className="batch-list">{items.map((item) => { const match = item.result?.match; const isDuplicate = Boolean(match && matchedItems.find((candidate) => candidate.result?.match.card.id === match.card.id)?.id !== item.id); const isAdded = Boolean(match && (addedIds.includes(match.card.id) || revealedIds.includes(match.card.id))); return <article className={`batch-item is-${item.status}`} key={item.id}><div className="batch-source-photo"><Image src={item.previewUrl} alt="분석할 포카 사진" fill unoptimized sizes="120px" />{item.status === "scanning" && <span className="scan-line" />}</div><div className="batch-item-copy"><div className="batch-status"><span>{item.status === "queued" ? "대기" : item.status === "scanning" ? `분석 ${item.progress}%` : item.status === "matched" ? isDuplicate ? "중복 인식" : "인식 완료" : item.status === "unmatched" ? "찾지 못함" : "분석 오류"}</span></div>{match ? <div className="batch-match"><CardArtwork card={match.card} blurred={globalBlur && !revealedIds.includes(match.card.id) && !addedIds.includes(match.card.id)} /><div><span>{match.card.member}</span><strong>{match.card.name}</strong><small>{match.card.collection}</small><em>{Math.round(match.confidence * 100)}% · 특징점 {match.goodMatches}개</em></div><button className={isAdded ? "batch-added" : "secondary-button"} disabled={isAdded || isDuplicate} onClick={() => void addOne(match.card.id)}>{isDuplicate ? "같은 포카" : isAdded ? <><Check size={14} /> 추가됨</> : <><Plus size={14} /> 추가</>}</button></div> : item.status === "scanning" || item.status === "queued" ? <div className="batch-item-progress"><span style={{ width: `${Math.max(item.status === "scanning" ? 6 : 0, item.progress)}%` }} /></div> : <p>{item.status === "unmatched" ? "확실하게 일치하는 포카를 찾지 못했어요." : "이 사진은 분석하지 못했어요. 다른 형식으로 다시 시도해 주세요."}</p>}</div></article>; })}</div>
        {!isProcessing && uniqueMatches.length > 0 && <div className="batch-add-bar"><div><strong>중복 제외 {uniqueMatches.length}장</strong><span>인식된 포카만 나의 포카에 저장합니다.</span></div><button className="primary-button" disabled={addingAll || uniqueMatches.every((match) => addedIds.includes(match.card.id) || revealedIds.includes(match.card.id))} onClick={() => void addAll()}><Plus size={17} /> {addingAll ? "추가하는 중…" : "인식된 포카 모두 추가"}</button></div>}
      </div>}<input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={(event) => { void chooseFiles(event.target.files ?? undefined); event.currentTarget.value = ""; }} /><input ref={inputRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => { void chooseFiles(event.target.files ?? undefined); event.currentTarget.value = ""; }} />
    </div><div className="recognize-tips"><div><b>01</b><span><strong>카드 전체가 보이게</strong><small>모서리 4개를 프레임 안에 담아주세요.</small></span></div><div><b>02</b><span><strong>반사를 피해 밝게</strong><small>부드러운 자연광이 좋아요.</small></span></div><div><b>03</b><span><strong>기울어져도 괜찮아요</strong><small>자동 원근 보정으로 바로잡아요.</small></span></div></div>
  </section>;
}

function CollectionView({ owned, revealedIds, ownerCounts, toggleOwned, globalBlur, user, onSignIn, onEditProfile }: { owned: string[]; revealedIds: string[]; ownerCounts: Record<string, number>; toggleOwned: (id: string) => void; globalBlur: boolean; user: AuthUser | null; onSignIn: () => void; onEditProfile?: () => void }) {
  const [page, setPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<CatalogCard | null>(null);
  if (!user) return <section className="collection-page auth-required"><div className="auth-card"><span className="brand-mark"><span>p</span></span><h1>나의 포카를 저장해 보세요</h1><p>Google 계정으로 로그인하면 어느 기기에서든 내 포카 앨범을 이어서 볼 수 있어요.</p><button className="google-login-button large" onClick={onSignIn}><LogIn size={18} /> Google로 로그인</button></div></section>;
  const ownedCards = catalogCards.filter((card) => owned.includes(card.id)); const total = catalogCards.length; const percent = Math.round((owned.length / total) * 100);
  const pageSize = 12; const pageCount = Math.max(1, Math.ceil(ownedCards.length / pageSize)); const currentPage = Math.min(page, pageCount); const pageCards = ownedCards.slice((currentPage - 1) * pageSize, currentPage * pageSize); const pageStart = Math.max(1, Math.min(currentPage - 2, pageCount - 4)); const visiblePages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => pageStart + index);
  const initial = (user.name || user.email || "P").trim().charAt(0).toLocaleUpperCase();
  return <section className="collection-page"><div className="album-header"><div className="profile-avatar">{user.avatarUrl ? <Image src={user.avatarUrl} alt={`${user.name} 프로필 사진`} fill unoptimized sizes="68px" /> : initial}<span>✦</span></div><div><span className="eyebrow"><span /> MY POCKET</span><h1>{user.name}의 포카 앨범</h1><p>좋아하는 순간을 한 장씩 모으는 중 · 공개 앨범</p></div><div className="album-header-actions">{onEditProfile && <button className="secondary-button" onClick={onEditProfile}><Pencil size={16} /> 프로필 수정</button>}<button className="secondary-button"><Share2 size={16} /> 공유하기</button></div></div>
    <div className="collection-stats"><div><strong>{owned.length}</strong><span>보유 포카</span></div><div><strong>{percent}%</strong><span>수집률</span></div><div className="completion"><span>전체 {total}장 중 {owned.length}장</span><div><i style={{ width: `${percent}%` }} /></div></div></div>
    <div className="binder collection-binder"><div className="binder-rings">{[1,2,3,4,5].map((n) => <i key={n} />)}</div><div className="binder-top"><div><span className="section-kicker">MY PHOTOCARD BINDER</span><h2>POCA POCKET</h2></div><span>{ownedCards.length} CARDS</span></div>{pageCards.length > 0 ? <div className="collection-card-grid">{pageCards.map((card) => <PhotoCard key={card.id} card={card} owned revealed={revealedIds.includes(card.id)} ownerCount={ownerCounts[card.id] ?? 1} onToggle={() => toggleOwned(card.id)} onOpen={() => setSelectedCard(card)} globalBlur={globalBlur} />)}</div> : <div className="collection-empty"><span className="brand-mark"><span>p</span></span><h3>아직 꽂아둔 포카가 없어요</h3><p>포카 명부에서 소장 버튼을 누르거나 사진으로 포카를 찾아 추가해 보세요.</p></div>}{ownedCards.length > pageSize && <nav className="binder-pagination" aria-label="나의 포카 페이지"><button aria-label="이전 페이지" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>{visiblePages.map((number) => <button key={number} className={number === currentPage ? "active" : ""} aria-current={number === currentPage ? "page" : undefined} onClick={() => setPage(number)}>{number}</button>)}<button aria-label="다음 페이지" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button></nav>}<span className="page-number">— {String(currentPage).padStart(2, "0")} / {String(pageCount).padStart(2, "0")} —</span></div>
    {selectedCard && <CardDetailModal card={selectedCard} seriesCards={catalogCards.filter((card) => card.idNumber === selectedCard.idNumber)} ownedIds={owned} revealedIds={revealedIds} globalBlur={globalBlur} onToggle={() => toggleOwned(selectedCard.id)} onSelect={setSelectedCard} onClose={() => setSelectedCard(null)} />}
  </section>;
}

function SettingsView({ globalBlur, setGlobalBlur }: { globalBlur: boolean; setGlobalBlur: (v: boolean) => void }) {
  const [flags, setFlags] = useState({ recognition: true, collections: true, publicAlbums: true, requests: true }); const toggle = (key: keyof typeof flags) => setFlags((current) => ({ ...current, [key]: !current[key] }));
  const flagCopy = { recognition: ["사진 인식", "포카 사진 매칭과 촬영 추가"], collections: ["나의 포카", "개인 소장 앨범과 수집률"], publicAlbums: ["공개 앨범", "다른 유저의 앨범 열람"], requests: ["포카 추가 요청", "미인식 포카 관리자 검수 큐"] };
  return <section className="settings-page"><div className="settings-title"><span className="eyebrow"><span /> DEVELOPER CONTROL</span><h1>사이트 설정</h1><p>코드 수정 없이 팬사이트에 필요한 기능만 골라 켜고 끌 수 있어요.</p></div><div className="settings-grid">
    <div className="settings-card"><h2><Settings2 size={19} /> 기능 플래그</h2><p>모든 옵션은 <code>site.config.ts</code>에서도 관리할 수 있습니다.</p>{Object.entries(flagCopy).map(([key, value]) => <label className="setting-row" key={key}><span><strong>{value[0]}</strong><small>{value[1]}</small></span><input type="checkbox" checked={flags[key as keyof typeof flags]} onChange={() => toggle(key as keyof typeof flags)} /><i /></label>)}</div>
    <div className="settings-card"><h2><Eye size={19} /> 이미지 공개 설정</h2><p>저작권 정책에 맞게 명부 이미지를 일괄 제어합니다.</p><div className="radio-stack"><label><input type="radio" checked={!globalBlur} onChange={() => setGlobalBlur(false)} /><span><b>원본 이미지</b><small>모든 방문자에게 원본을 표시합니다.</small></span></label><label><input type="radio" checked={globalBlur} onChange={() => setGlobalBlur(true)} /><span><b>블러 이미지</b><small>사진 인식으로 확인되지 않은 포카를 흐리게 표시합니다.</small></span></label></div><div className="info-callout"><CircleHelp size={17} /><span>사진을 올려 인식한 뒤 나의 포카에 추가하면 해당 카드만 원본으로 보여요.</span></div></div>
    <div className="settings-card wide"><div><h2><Code2 size={19} /> 팬사이트에 명부 인용하기</h2><p>데이터와 명부 UI만 독립적으로 설치하거나, iframe으로 바로 삽입하세요.</p></div><div className="code-box"><span>npm</span><code>npm install @pocapocket/catalog-core</code><button onClick={() => navigator.clipboard?.writeText("npm install @pocapocket/catalog-core")}><Code2 size={15} /></button></div><div className="embed-features"><span><Check size={14} /> UI 테마 변경</span><span><Check size={14} /> JSON/CSV 가져오기</span><span><Check size={14} /> 프레임워크 독립 코어</span><span><Check size={14} /> 자체 호스팅</span></div></div>
  </div></section>;
}

export default function PocaPocketApp() {
  const [view, setView] = useState<View>("catalog"); const [owned, setOwned] = useState<string[]>([]); const [revealedIds, setRevealedIds] = useState<string[]>([]); const [ownerCounts, setOwnerCounts] = useState<Record<string, number>>({}); const [globalBlur, setGlobalBlur] = useState(true); const [mobileOpen, setMobileOpen] = useState(false); const [toast, setToast] = useState(""); const [authUser, setAuthUser] = useState<AuthUser | null>(null); const [profile, setProfile] = useState<UserProfile | null>(null); const [profileFeatureReady, setProfileFeatureReady] = useState(false); const [profileEditorOpen, setProfileEditorOpen] = useState(false); const [isAdmin, setIsAdmin] = useState(false); const [authReady, setAuthReady] = useState(false);
  const localAdminAccess = process.env.NODE_ENV === "development" && isAdmin;
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setAuthReady(true); return; }
    let active = true;
    const applySession = async (accessToken?: string) => {
      if (!accessToken) { if (active) { setAuthUser(null); setProfile(null); setProfileFeatureReady(false); setProfileEditorOpen(false); setIsAdmin(false); setOwned([]); setRevealedIds([]); setAuthReady(true); } return; }
      const identityResponse = await fetch("/api/auth/identity", { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!identityResponse.ok) { if (active) setAuthReady(true); return; }
      const identity = await identityResponse.json() as { user: AuthUser; isAdmin: boolean };
      const [cardsResult, profileResult] = await Promise.all([
        supabase.from("user_cards").select("card_id, acquisition_method"),
        supabase.from("profiles").select("nickname, avatar_path").eq("id", identity.user.id).maybeSingle(),
      ]);
      let cardRows = cardsResult.data ?? [];
      if (cardsResult.error) cardRows = (await supabase.from("user_cards").select("card_id")).data ?? [];
      let loadedProfile: UserProfile | null = null;
      let loadedUser = identity.user;
      if (profileResult.data) {
        const { data: publicAvatar } = supabase.storage.from("avatars").getPublicUrl(profileResult.data.avatar_path);
        loadedProfile = { nickname: profileResult.data.nickname, avatarPath: profileResult.data.avatar_path, avatarUrl: publicAvatar.publicUrl };
        loadedUser = { ...identity.user, name: loadedProfile.nickname, avatarUrl: loadedProfile.avatarUrl };
      }
      if (active) { const ownedIds = cardRows.map((row) => row.card_id); const recognizedIds = cardRows.filter((row) => "acquisition_method" in row && row.acquisition_method === "recognized").map((row) => row.card_id); setAuthUser(loadedUser); setProfile(loadedProfile); setProfileFeatureReady(!profileResult.error); setIsAdmin(identity.isAdmin); setOwned(ownedIds); setRevealedIds(recognizedIds); setOwnerCounts((current) => { const next = { ...current }; for (const id of ownedIds) next[id] = Math.max(1, next[id] ?? 0); return next; }); setAuthReady(true); }
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session?.access_token));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void applySession(session?.access_token), 0);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    void supabase.rpc("get_card_owner_counts").then(({ data, error }) => {
      if (!active || error) return;
      const counts = Object.fromEntries((data ?? []).map((row) => [row.card_id, Number(row.owner_count)]));
      setOwnerCounts(counts);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => { if (view === "settings" && !localAdminAccess) setView("catalog"); }, [localAdminAccess, view]);

  const signIn = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { showToast("Supabase 연결 설정이 필요해요"); return; }
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) showToast("Google 로그인을 시작하지 못했어요");
  };
  const signOut = async () => { await getSupabaseBrowserClient()?.auth.signOut(); setProfile(null); setProfileFeatureReady(false); setProfileEditorOpen(false); setRevealedIds([]); setView("catalog"); };
  const toggleOwned = async (id: string, acquisitionMethod: "manual" | "recognized" = "manual") => {
    const supabase = getSupabaseBrowserClient();
    if (!authUser || !supabase) { await signIn(); return; }
    const removing = owned.includes(id);
    const wasRevealed = revealedIds.includes(id);
    setOwned((current) => removing ? current.filter((item) => item !== id) : [...current, id]);
    setRevealedIds((current) => removing ? current.filter((item) => item !== id) : acquisitionMethod === "recognized" ? [...new Set([...current, id])] : current);
    setOwnerCounts((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + (removing ? -1 : 1)) }));
    let result = removing
      ? await supabase.from("user_cards").delete().eq("user_id", authUser.id).eq("card_id", id)
      : await supabase.from("user_cards").insert({ user_id: authUser.id, card_id: id, ...(acquisitionMethod === "recognized" ? { acquisition_method: "recognized" } : {}) });
    if (result.error && !removing && acquisitionMethod === "recognized") result = await supabase.from("user_cards").insert({ user_id: authUser.id, card_id: id });
    if (result.error) { setOwned((current) => removing ? [...current, id] : current.filter((item) => item !== id)); setRevealedIds((current) => wasRevealed ? [...new Set([...current, id])] : current.filter((item) => item !== id)); setOwnerCounts((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + (removing ? 1 : -1)) })); showToast("저장하지 못했어요. 잠시 후 다시 시도해 주세요"); }
    else void supabase.rpc("get_card_owner_counts").then(({ data }) => { const row = data?.find((item) => item.card_id === id); setOwnerCounts((current) => ({ ...current, [id]: Number(row?.owner_count ?? (removing ? 0 : Math.max(1, current[id] ?? 1))) })); });
  };
  const addOwned = async (id: string, silent = false) => {
    const supabase = getSupabaseBrowserClient();
    if (!authUser || !supabase) { await signIn(); return; }
    if (!owned.includes(id)) await toggleOwned(id, "recognized");
    else {
      setRevealedIds((current) => [...new Set([...current, id])]);
      await supabase.from("user_cards").update({ acquisition_method: "recognized" }).eq("user_id", authUser.id).eq("card_id", id);
    }
    if (!silent) showToast("사진으로 확인한 포카를 원본으로 표시해요");
  };
  const navigate = (next: View) => { if (next === "settings" && !localAdminAccess) return; setView(next); setMobileOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const completeProfile = (nextProfile: UserProfile) => { setProfile(nextProfile); setProfileEditorOpen(false); setAuthUser((current) => current ? { ...current, name: nextProfile.nickname, avatarUrl: nextProfile.avatarUrl } : current); };
  const initial = (authUser?.name || authUser?.email || "P").trim().charAt(0).toLocaleUpperCase();
  return <main><header className="site-header"><button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <Menu />}</button><button className="logo-button" onClick={() => navigate("catalog")}><Logo /></button><nav className={mobileOpen ? "open" : ""}>{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><item.icon size={17} /> {item.label}</button>)}</nav><div className="header-actions">{authUser ? <><button className="profile-button" title={authUser.email ?? authUser.name} onClick={() => navigate("collection")}>{authUser.avatarUrl ? <Image src={authUser.avatarUrl} alt="프로필 사진" fill unoptimized sizes="36px" /> : initial}</button><button className="icon-button" aria-label="로그아웃" title="로그아웃" onClick={signOut}><LogOut size={17} /></button></> : <button className="google-login-button" disabled={!authReady} onClick={signIn}><LogIn size={16} /> Google 로그인</button>}{localAdminAccess && <button className="icon-button desktop-settings" aria-label="관리자 설정" onClick={() => navigate("settings")}><Settings2 size={18} /></button>}</div></header>
    {view === "catalog" && <CatalogView owned={owned} revealedIds={revealedIds} ownerCounts={ownerCounts} toggleOwned={toggleOwned} globalBlur={globalBlur} setView={navigate} localAdminAccess={localAdminAccess} />}{view === "recognize" && <RecognizeView addOwned={addOwned} revealedIds={revealedIds} globalBlur={globalBlur} />}{view === "collection" && <CollectionView owned={owned} revealedIds={revealedIds} ownerCounts={ownerCounts} toggleOwned={toggleOwned} globalBlur={globalBlur} user={authUser} onSignIn={signIn} onEditProfile={profileFeatureReady && profile ? () => setProfileEditorOpen(true) : undefined} />}{view === "settings" && localAdminAccess && <SettingsView globalBlur={globalBlur} setGlobalBlur={setGlobalBlur} />}
    <footer><Logo /><p>팬이 만들고, 팬이 함께 채우는 오픈 포토카드 아카이브.</p><small>자료 출처: 리센느 음원총공팀 포카사전 · 이벤트 포카 Scene Simulation · Lip Bomb 앨범 포카 @bemyzena_ · Pulse 포카 MaxKim. 인식: XFeat (Apache-2.0). RESCENE 및 포토카드 권리는 각 권리자에게 있습니다.</small></footer>{authUser && profileFeatureReady && (!profile || profileEditorOpen) && <ProfileSetup userId={authUser.id} currentProfile={profile} onComplete={completeProfile} onSignOut={signOut} onCancel={profile ? () => setProfileEditorOpen(false) : undefined} />}{toast && <div className="toast"><Check size={16} /> {toast}</div>}
  </main>;
}
