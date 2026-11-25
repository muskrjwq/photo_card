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
import { I18nProvider, tr, useI18n, type Locale } from "@/lib/i18n";
import LocalCardEditor from "@/components/local-card-editor";
import CardRequestQueue from "@/components/card-request-queue";
import DailyDraw, { AcquisitionBadge } from "@/components/daily-draw";
import ProfileSetup, { type UserProfile } from "@/components/profile-setup";

type View = "catalog" | "recognize" | "collection" | "settings" | "draw";
type AuthUser = { id: string; email: string | null; name: string; avatarUrl: string | null };
type CatalogSort = "release-asc" | "release-desc" | "owners-desc" | "owners-asc";
const albumCollectionNames = collections.filter((collection) => catalogCards.some((card) => card.collection === collection && card.category === "album"));
const eventCollectionNames = collections.filter((collection) => !albumCollectionNames.includes(collection));
const catalogReleaseOrder = new Map(catalogCards.map((card, index) => [card.id, index]));
const navItems = [
  { id: "draw" as View, ko: "포카 뽑기", en: "Daily Draw", icon: Plus },
  { id: "catalog" as View, ko: "포카도감", en: "Catalog", icon: BookOpen },
  { id: "recognize" as View, ko: "포카 찾기", en: "Find a Card", icon: Camera },
  { id: "collection" as View, ko: "나의 포카", en: "My Cards", icon: LayoutGrid },
];

function Logo() {
  const { t } = useI18n();
  return <span className="brand"><span className="brand-mark"><span>p</span></span><span className="brand-name">{t("리센느 포카도감", "RESCENE Photocard Catalog")}</span><span className="beta">BETA</span></span>;
}

function CardArtwork({ card, blurred = false, priority = false }: { card: CatalogCard; blurred?: boolean; priority?: boolean }) {
  const { memberLabel } = useI18n();
  return <div className={`artwork ${blurred ? "is-blurred" : ""}`}>
    <Image src={card.image} alt={`${memberLabel(card.member)} ${card.name}`} fill sizes="(max-width: 760px) 44vw, 220px" priority={priority} />
  </div>;
}

function PhotoCard({ card, owned, revealed, ownerCount, onToggle, onOpen, globalBlur }: { card: CatalogCard; owned: boolean; revealed: boolean; ownerCount: number; onToggle: () => void; onOpen: () => void; globalBlur: boolean }) {
  const { t, memberLabel, collectionLabel } = useI18n();
  const displayOwnerCount = (owned ? Math.max(1, ownerCount) : ownerCount).toLocaleString();
  return <article className="photo-card" role="button" tabIndex={0} aria-label={`${memberLabel(card.member)} ${card.name} ${t("상세보기", "details")}`} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}>
    <CardArtwork card={card} blurred={(globalBlur && !revealed) || card.sensitive} />
    {owned && <AcquisitionBadge cardId={card.id} />}
    <div className="card-copy"><div><span className="member-chip">{memberLabel(card.member)}</span>{card.rare && <span className="rare-chip">RARE</span>}</div>
      <h3>{card.name}</h3><p>{collectionLabel(card.collection)}</p>
      <div className="card-bottom"><span className="owned-count"><Users size={13} /> {t(`${displayOwnerCount}명 소장`, `${displayOwnerCount} owners`)}</span>{owned && <button className="own-button owned" aria-label={t("나의 포카에서 제거", "Remove from my cards")} onClick={(event) => { event.stopPropagation(); onToggle(); }}><Check size={15} strokeWidth={3} /></button>}</div>
    </div>
  </article>;
}

function CardDetailModal({ card, seriesCards, ownedIds, revealedIds, globalBlur, onToggle, onSelect, onEdit, onClose }: { card: CatalogCard; seriesCards: CatalogCard[]; ownedIds: string[]; revealedIds: string[]; globalBlur: boolean; onToggle: () => void; onSelect: (card: CatalogCard) => void; onEdit?: () => void; onClose: () => void }) {
  const { t, memberLabel, collectionLabel } = useI18n();
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
      <button className="card-modal-close" aria-label={t("닫기", "Close")} onClick={onClose}><X size={20} /></button>
      <div className="card-modal-main">
        <div className="card-modal-art"><CardArtwork card={card} blurred={(globalBlur && !revealedIds.includes(card.id)) || card.sensitive} priority /></div>
        <div className="card-modal-copy">
          <div><span className="member-chip">{memberLabel(card.member)}</span><span className="detail-category">{card.category === "album" ? t("앨범", "Album") : t("이벤트", "Event")}</span></div>
          <h2 id="card-modal-title">{card.name}</h2>
          <p className="detail-collection">{collectionLabel(card.collection)}</p>
          <dl className="card-detail-list"><div><dt>{t("출처", "Source")}</dt><dd>{card.source}</dd></div><div><dt>{t("소장 현황", "Ownership")}</dt><dd>{owned ? t("내가 소장한 포카", "In my collection") : t("미소장 포카", "Not owned")}</dd></div><div><dt>{t("같은 시리즈", "Same series")}</dt><dd>{t(`${seriesCards.length}장`, `${seriesCards.length} cards`)}</dd></div></dl>
          {detailTags.length > 0 && <div className="detail-tags">{detailTags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div>}
          <div className="detail-actions">{onEdit && <button className="detail-edit-button" onClick={onEdit}><Pencil size={16} /> {t("편집", "Edit")}</button>}{owned && <button className="detail-own-button owned" onClick={onToggle}><Check size={17} /> {t("나의 포카에서 제거", "Remove from my cards")}</button>}</div>
        </div>
      </div>
      <div className="series-section"><div><span className="section-kicker">SAME SERIES</span><h3>{t("같은 시리즈의 다른 포카", "Other cards in this series")}</h3><p>{t("같은 콘셉트로 발매된 다른 멤버 포카예요.", "Cards of other members from the same concept.")}</p></div>
        {relatedCards.length > 0 ? <div className="series-card-list">{relatedCards.map((item) => <button key={item.id} onClick={() => onSelect(item)}><CardArtwork card={item} blurred={(globalBlur && !revealedIds.includes(item.id)) || item.sensitive} /><span>{memberLabel(item.member)}</span><small>{item.name}</small></button>)}</div> : <div className="series-empty">{t("이 시리즈에는 등록된 다른 멤버 포카가 없어요.", "No other member cards are registered in this series.")}</div>}
      </div>
    </section>
  </div>;
}

function Filters({ member, setMember, collection, setCollection, cards = catalogCards }: { member: string; setMember: (v: string) => void; collection: string; setCollection: (v: string) => void; cards?: CatalogCard[] }) {
  const { t, memberLabel, collectionLabel } = useI18n();
  const availableMembers = members.filter((item) => cards.some((card) => card.member === item || (item === "단체" && card.kind === "group") || (item === "유닛" && card.kind === "unit")));
  const availableAlbums = albumCollectionNames.filter((item) => cards.some((card) => card.collection === item));
  const availableEvents = eventCollectionNames.filter((item) => cards.some((card) => card.collection === item));
  return <div className="filters" aria-label={t("포카 필터", "Photocard filters")}><div className="member-filter-scroll"><button className={member === "전체" ? "active" : ""} onClick={() => setMember("전체")}>{t("전체", "All")}</button>
    {availableMembers.map((item) => <button key={item} className={member === item ? "active" : ""} onClick={() => setMember(item)}>{memberLabel(item)}</button>)}</div>
    <span className="filter-divider" /><label className="select-wrap"><select value={collection} onChange={(e) => setCollection(e.target.value)}><option>{t("모든 앨범 · 이벤트", "All albums & events")}</option>{availableAlbums.length > 0 && <optgroup label={t("앨범", "Albums")}>{availableAlbums.map((item) => <option key={item} value={item}>{collectionLabel(item)}</option>)}</optgroup>}{availableEvents.length > 0 && <optgroup label={t("이벤트 · 기타", "Events & more")}>{availableEvents.map((item) => <option key={item} value={item}>{collectionLabel(item)}</option>)}</optgroup>}</select><ChevronDown size={15} /></label>
  </div>;
}

function CatalogView({ owned, revealedIds, ownerCounts, toggleOwned, globalBlur, setView, localAdminAccess }: { owned: string[]; revealedIds: string[]; ownerCounts: Record<string, number>; toggleOwned: (id: string) => void; globalBlur: boolean; setView: (v: View) => void; localAdminAccess: boolean }) {
  const { t } = useI18n();
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
      if (a.collection === b.collection && (sort === "release-asc" || sort === "release-desc")) {
        const additionDifference = (a.addedOrder ?? 0) - (b.addedOrder ?? 0);
        if (additionDifference) return sort === "release-desc" ? -additionDifference : additionDifference;
      }
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
    const preserved = window.sessionStorage.getItem("pocapocket.catalogEditorState");
    if (preserved) try {
      const state = JSON.parse(preserved) as { member?: string; collection?: string; query?: string; visibleCount?: number; sort?: CatalogSort; scrollY?: number };
      if (state.member) setMember(state.member);
      if (state.collection) setCollection(state.collection);
      if (typeof state.query === "string") setQuery(state.query);
      if (state.sort) setSort(state.sort);
      window.setTimeout(() => {
        if (Number.isFinite(state.visibleCount)) setVisibleCount(Math.max(40, Number(state.visibleCount)));
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.scrollTo({ top: Number(state.scrollY) || 0 })));
      }, 0);
    } catch { window.sessionStorage.removeItem("pocapocket.catalogEditorState"); }
  }, []);
  const preserveEditorState = () => window.sessionStorage.setItem("pocapocket.catalogEditorState", JSON.stringify({ member, collection, query, visibleCount, sort, scrollY: window.scrollY }));
  const changeColumns = (value: number) => {
    setColumns(value);
    window.localStorage.setItem("pocapocket.catalogColumns", String(value));
  };
  return <>
    <section className="hero"><div><span className="eyebrow"><span /> RESCENE PHOTOCARD ARCHIVE</span><h1><span>{t("리센느의 모든 순간을", "Every RESCENE moment")}</span><br /><em>{t("한 장씩, 차곡차곡.", "collected one card at a time.")}</em></h1><p>{t("앨범부터 이벤트 특전까지. 포카를 찾고, 기록하고,", "From albums to event benefits. Find and track your cards,")}<br className="desktop-only" /> {t("나만의 수집 앨범을 완성해 보세요.", "and complete your own collection.")}</p><div className="hero-actions"><button className="primary-button" onClick={() => setView("recognize")}><Camera size={18} /> {t("사진으로 포카 찾기", "Find from a photo")}</button><button className="text-button" onClick={() => document.getElementById("catalog-grid")?.scrollIntoView({ behavior: "smooth" })}>{t("도감 둘러보기", "Browse catalog")} <ArrowRight size={17} /></button></div></div>
      <div className="hero-deck" aria-label={t("포카 예시", "Photocard examples")}><div className="deck-card deck-left"><CardArtwork card={catalogCards[2]} blurred={globalBlur && !revealedIds.includes(catalogCards[2].id)} /></div><div className="deck-card deck-center"><CardArtwork card={catalogCards[0]} blurred={globalBlur && !revealedIds.includes(catalogCards[0].id)} priority /></div><div className="deck-card deck-right"><CardArtwork card={catalogCards[4]} blurred={globalBlur && !revealedIds.includes(catalogCards[4].id)} /></div><span className="spark spark-one">✦</span><span className="spark spark-two">✦</span><span className="deck-note">{t("현재", "Now")} <strong>{catalogCards.length}</strong>{t("장의 포카가", " photocards")}<br />{t("정리되어 있어요", "in the catalog")}</span></div>
    </section>
    <section className="catalog-section" id="catalog-grid"><div className="section-heading"><div><span className="section-kicker">PHOTOCARD LIST</span><h2>{t("포카도감", "Photocard Catalog")}</h2><p>{t("멤버와 앨범을 골라 원하는 포카를 찾아보세요.", "Choose a member and collection to find a photocard.")}</p></div><div className="catalog-heading-actions"><label className="catalog-search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("포카명, 멤버, 출처 검색", "Search card, member or source")} /></label>{localAdminAccess && <button className="local-add-button" onClick={() => { preserveEditorState(); setEditorCard("new"); }}><FilePlus2 size={16} /> {t("새 포카 추가", "Add card")}</button>}</div></div>
      <Filters member={member} setMember={setMember} collection={collection} setCollection={setCollection} /><div className="result-bar"><span><strong>{filtered.length}</strong>{t("장의 포카", " photocards")}</span><div className="result-controls"><label className="column-slider"><LayoutGrid size={14} /><span>{t("한 줄", "Columns")} <strong>{columns}</strong>{t("장", "")}</span><input type="range" min="2" max="8" step="1" value={columns} aria-label={t(`한 줄에 ${columns}장 표시`, `${columns} columns`)} onChange={(event) => changeColumns(Number(event.target.value))} /></label><label className="sort-wrap"><Filter size={14} /><select value={sort} aria-label={t("포카 정렬 순서", "Card sort order")} onChange={(event) => setSort(event.target.value as CatalogSort)}><option value="release-asc">{t("발매 · 공개 순", "Oldest first")}</option><option value="release-desc">{t("최신순", "Newest first")}</option><option value="owners-desc">{t("소장 많은 순", "Most owned")}</option><option value="owners-asc">{t("소장 적은 순", "Least owned")}</option></select><ChevronDown size={13} /></label></div></div>
      <div className="card-grid" style={{ "--catalog-columns": columns, "--catalog-tablet-columns": Math.min(columns, 4) } as CSSProperties}>{filtered.slice(0, visibleCount).map((card) => <PhotoCard key={card.id} card={card} owned={owned.includes(card.id)} revealed={revealedIds.includes(card.id)} ownerCount={ownerCounts[card.id] ?? 0} onToggle={() => toggleOwned(card.id)} onOpen={() => setSelectedCard(card)} globalBlur={globalBlur} />)}</div>
      {visibleCount < filtered.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + 40)}>{t("포카 더 보기", "Load more")} <span>{Math.min(visibleCount, filtered.length)} / {filtered.length}</span></button>}
      {filtered.length === 0 && <div className="empty-state"><Search size={32} /><h3>{t("조건에 맞는 포카가 없어요", "No matching photocards")}</h3><p>{t("필터나 검색어를 바꿔보세요.", "Try changing the filters or search.")}</p></div>}
      {selectedCard && <CardDetailModal card={selectedCard} seriesCards={catalogCards.filter((card) => card.idNumber === selectedCard.idNumber)} ownedIds={owned} revealedIds={revealedIds} globalBlur={globalBlur} onToggle={() => toggleOwned(selectedCard.id)} onSelect={setSelectedCard} onEdit={localAdminAccess ? () => { preserveEditorState(); setEditorCard(selectedCard); setSelectedCard(null); } : undefined} onClose={() => setSelectedCard(null)} />}
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

function RecognizeView({ addOwned, revealedIds, globalBlur, signedIn, onSignIn }: { addOwned: (id: string, silent?: boolean) => Promise<void>; revealedIds: string[]; globalBlur: boolean; signedIn: boolean; onSignIn: () => void }) {
  const { t, memberLabel, collectionLabel } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const runIdRef = useRef(0);
  const [items, setItems] = useState<BatchRecognitionItem[]>([]);
  const [notice, setNotice] = useState("");
  const [addingAll, setAddingAll] = useState(false);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [canCapturePhoto, setCanCapturePhoto] = useState(false);
  const [requestItem, setRequestItem] = useState<BatchRecognitionItem | null>(null);
  const [requestedIds, setRequestedIds] = useState<string[]>([]);

  const matchedItems = items.filter((item) => item.status === "matched" && item.result);
  const uniqueMatches = Array.from(new Map(matchedItems.map((item) => [item.result!.match.card.id, item.result!.match])).values());
  const finishedCount = items.filter((item) => !["queued", "scanning"].includes(item.status)).length;
  const isProcessing = items.some((item) => item.status === "queued" || item.status === "scanning");

  useEffect(() => () => {
    runIdRef.current += 1;
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    const isMobileOrTablet = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    setCanCapturePhoto(isMobileOrTablet);
  }, []);

  const updateItem = (id: string, patch: Partial<BatchRecognitionItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };
  const reset = () => {
    runIdRef.current += 1;
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
    setItems([]); setNotice(""); setAddedIds([]); setRequestedIds([]); setAddingAll(false);
  };
  const chooseFiles = async (selected?: FileList | File[]) => {
    if (!selected?.length) return;
    const files = Array.from(selected).slice(0, 10);
    const validFiles = files.filter((file) => file.size <= 15 * 1024 * 1024 && (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name)));
    if (!validFiles.length) { setNotice(t("15MB 이하 JPG, PNG, WEBP 사진을 선택해 주세요.", "Choose JPG, PNG or WEBP images up to 15MB.")); return; }
    runIdRef.current += 1;
    const thisRun = runIdRef.current;
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    const prepared = validFiles.map((file, index) => ({ id: `${thisRun}-${index}`, file, previewUrl: URL.createObjectURL(file), status: "queued" as const, progress: 0, result: null }));
    previewUrlsRef.current = prepared.map((item) => item.previewUrl);
    setItems(prepared); setAddedIds([]); setRequestedIds([]);
    setNotice(selected.length > 10 ? t("한 번에 최대 10장까지 분석해요. 앞의 10장만 불러왔습니다.", "Up to 10 images can be analyzed at once. The first 10 were loaded.") : validFiles.length < files.length ? t("15MB를 넘거나 지원하지 않는 파일은 제외했습니다.", "Unsupported files or files over 15MB were excluded.") : "");
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
    setNotice(t(`중복을 제외한 포카 ${uniqueMatches.length}장을 나의 포카에 추가했어요.`, `Added ${uniqueMatches.length} unique photocards to My Cards.`));
  };

  return <section className="tool-page"><div className="tool-intro"><span className="eyebrow"><span /> ON-DEVICE MATCHING</span><h1>{t("여러 장도 한 번에 찾아요", "Find multiple cards at once")}</h1><p>{t("최대 10장의 포카 사진을 차례로 분석해 도감에서 찾아드려요.", "Analyze up to 10 photocard images and match them against the catalog.")}<br />{t("사진은 기기에서 분석하며, 추가 요청을 보낼 때만 업로드합니다.", "Photos are analyzed on your device and uploaded only if you submit a request.")}</p></div>
    <div className="recognizer-shell batch-recognizer"><div className="privacy-pill"><ShieldCheck size={15} /> {t("100% 기기 내 분석 · 업로드 비용 0원", "100% on-device · No upload cost")}</div>
      {items.length === 0 ? <div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void chooseFiles(event.dataTransfer.files); }}><span className="upload-icon"><ImagePlus size={30} /></span><strong>{t("포카 사진을 올려주세요", "Upload photocard images")}</strong><span>{t("여러 장을 한꺼번에 선택하면 순서대로 안전하게 분석해요.", "Select several images to analyze them in order.")}</span><div className="upload-actions">{canCapturePhoto && <button className="camera-button" onClick={() => cameraRef.current?.click()}><Camera size={17} /> {t("카메라로 촬영", "Take photo")}</button>}<button className="gallery-button" onClick={() => inputRef.current?.click()}><Upload size={17} /> {t("여러 장 선택", "Choose images")}</button></div><small>{t("JPG, PNG, WEBP · 장당 최대 15MB · 한 번에 최대 10장", "JPG, PNG, WEBP · 15MB each · Up to 10")}</small></div> :
      <div className="batch-results"><div className="batch-toolbar"><div><strong>{isProcessing ? t("포카를 분석하고 있어요", "Analyzing photocards") : t("분석을 마쳤어요", "Analysis complete")}</strong><span>{t(`${finishedCount} / ${items.length}장 완료 · ${uniqueMatches.length}종 인식`, `${finishedCount} / ${items.length} complete · ${uniqueMatches.length} matched`)}</span></div><div><button className="secondary-button" disabled={isProcessing} onClick={() => inputRef.current?.click()}><Upload size={15} /> {t("다시 선택", "Choose again")}</button><button className="batch-reset" aria-label={t("분석 닫기", "Close analysis")} onClick={reset}><X size={18} /></button></div></div><div className="batch-overall-progress"><span style={{ width: `${items.length ? Math.round(finishedCount / items.length * 100) : 0}%` }} /></div>
        {notice && <p className="batch-notice">{notice}</p>}
        <div className="batch-list">{items.map((item) => { const match = item.result?.match; const isDuplicate = Boolean(match && matchedItems.find((candidate) => candidate.result?.match.card.id === match.card.id)?.id !== item.id); const isAdded = Boolean(match && (addedIds.includes(match.card.id) || revealedIds.includes(match.card.id))); return <article className={`batch-item is-${item.status}`} key={item.id}><div className="batch-source-photo"><Image src={item.previewUrl} alt={t("분석할 포카 사진", "Photocard to analyze")} fill unoptimized sizes="120px" />{item.status === "scanning" && <span className="scan-line" />}</div><div className="batch-item-copy"><div className="batch-status"><span>{item.status === "queued" ? t("대기", "Queued") : item.status === "scanning" ? t(`분석 ${item.progress}%`, `Analyzing ${item.progress}%`) : item.status === "matched" ? isDuplicate ? t("중복 인식", "Duplicate") : t("인식 완료", "Matched") : item.status === "unmatched" ? t("찾지 못함", "No match") : t("분석 오류", "Error")}</span></div>{match ? <div className="batch-match"><CardArtwork card={match.card} blurred={globalBlur && !revealedIds.includes(match.card.id) && !addedIds.includes(match.card.id)} /><div><span>{memberLabel(match.card.member)}</span><strong>{match.card.name}</strong><small>{collectionLabel(match.card.collection)}</small><em>{Math.round(match.confidence * 100)}% · {t("특징점", "features")} {match.goodMatches}</em></div><button className={isAdded ? "batch-added" : "secondary-button"} disabled={isAdded || isDuplicate} onClick={() => void addOne(match.card.id)}>{isDuplicate ? t("같은 포카", "Same card") : isAdded ? <><Check size={14} /> {t("추가됨", "Added")}</> : <><Plus size={14} /> {t("추가", "Add")}</>}</button></div> : item.status === "scanning" || item.status === "queued" ? <div className="batch-item-progress"><span style={{ width: `${Math.max(item.status === "scanning" ? 6 : 0, item.progress)}%` }} /></div> : item.status === "unmatched" ? <div className="no-card-match">
          <p>{t("일치하는 포카를 찾지 못했어요. 반사를 피해 카드 정면에서 다시 찍어 보세요.", "No match found. Try taking a straight-on photo without glare.")}</p>
          {requestedIds.includes(item.id) ? <span role="status">{t("요청을 보냈어요.", "Request sent.")}</span> : <button className="secondary-button" onClick={() => setRequestItem(item)}>{t("포카 추가 요청", "Request a photocard")}</button>}
        </div> : <p>{t("이 사진은 분석하지 못했어요. 다른 형식으로 다시 시도해 주세요.", "This image could not be analyzed. Try another format.")}</p>}</div></article>; })}</div>
        {!isProcessing && uniqueMatches.length > 0 && <div className="batch-add-bar"><div><strong>{t(`중복 제외 ${uniqueMatches.length}장`, `${uniqueMatches.length} unique cards`)}</strong><span>{t("인식된 포카만 나의 포카에 저장합니다.", "Only matched cards are saved to My Cards.")}</span></div><button className="primary-button" disabled={addingAll || uniqueMatches.every((match) => addedIds.includes(match.card.id) || revealedIds.includes(match.card.id))} onClick={() => void addAll()}><Plus size={17} /> {addingAll ? t("추가하는 중…", "Adding…") : t("인식된 포카 모두 추가", "Add all matched cards")}</button></div>}
      </div>}{canCapturePhoto && <input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={(event) => { void chooseFiles(event.target.files ?? undefined); event.currentTarget.value = ""; }} />}<input ref={inputRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => { void chooseFiles(event.target.files ?? undefined); event.currentTarget.value = ""; }} />
    </div><div className="recognize-tips"><div><b>01</b><span><strong>{t("카드 전체가 보이게", "Show the whole card")}</strong><small>{t("모서리 4개를 프레임 안에 담아주세요.", "Keep all four corners in frame.")}</small></span></div><div><b>02</b><span><strong>{t("반사를 피해 밝게", "Bright, without glare")}</strong><small>{t("부드러운 자연광이 좋아요.", "Soft natural light works best.")}</small></span></div><div><b>03</b><span><strong>{t("기울어져도 괜찮아요", "Angles are okay")}</strong><small>{t("자동 원근 보정으로 바로잡아요.", "Perspective is corrected automatically.")}</small></span></div></div>
    {requestItem && <LocalCardEditor submission={{
      image: requestItem.file,
      signedIn,
      onSignIn,
      onSent: () => {
        setRequestedIds((current) => [...current, requestItem.id]);
        setRequestItem(null);
      },
    }} onClose={() => setRequestItem(null)} />}
  </section>;
}

function CollectionView({ owned, revealedIds, photoAcquiredCount, drawnCount, ownerCounts, toggleOwned, globalBlur, user, onSignIn, onEditProfile }: { owned: string[]; revealedIds: string[]; photoAcquiredCount: number; drawnCount: number; ownerCounts: Record<string, number>; toggleOwned: (id: string) => void; globalBlur: boolean; user: AuthUser | null; onSignIn: () => void; onEditProfile?: () => void }) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [member, setMember] = useState("전체");
  const [collection, setCollection] = useState("모든 앨범 · 이벤트");
  const [sort, setSort] = useState<CatalogSort>("release-asc");
  const [selectedCard, setSelectedCard] = useState<CatalogCard | null>(null);
  const ownedCards = useMemo(() => catalogCards.filter((card) => owned.includes(card.id)), [owned]);
  const filteredCards = useMemo(() => ownedCards.filter((card) =>
    (member === "전체" || card.member === member || (member === "단체" && card.kind === "group") || (member === "유닛" && card.kind === "unit")) &&
    (collection === "모든 앨범 · 이벤트" || card.collection === collection)
  ).sort((a, b) => {
    const releaseDifference = (catalogReleaseOrder.get(a.id) ?? 0) - (catalogReleaseOrder.get(b.id) ?? 0);
    const chronologyDifference = getCatalogChronology(a) - getCatalogChronology(b);
    if (a.collection === b.collection && (sort === "release-asc" || sort === "release-desc")) {
      const additionDifference = (a.addedOrder ?? 0) - (b.addedOrder ?? 0);
      if (additionDifference) return sort === "release-desc" ? -additionDifference : additionDifference;
    }
    if (sort === "release-desc") return -chronologyDifference || releaseDifference;
    if (sort === "owners-desc") return (ownerCounts[b.id] ?? 0) - (ownerCounts[a.id] ?? 0) || releaseDifference;
    if (sort === "owners-asc") return (ownerCounts[a.id] ?? 0) - (ownerCounts[b.id] ?? 0) || releaseDifference;
    return chronologyDifference || releaseDifference;
  }), [ownedCards, member, collection, sort, ownerCounts]);
  useEffect(() => setPage(1), [member, collection, sort]);
  useEffect(() => {
    if (member !== "전체" && !ownedCards.some((card) => card.member === member || (member === "단체" && card.kind === "group") || (member === "유닛" && card.kind === "unit"))) setMember("전체");
    if (collection !== "모든 앨범 · 이벤트" && !ownedCards.some((card) => card.collection === collection)) setCollection("모든 앨범 · 이벤트");
  }, [ownedCards, member, collection]);
  if (!user) return <section className="collection-page auth-required"><div className="auth-card"><span className="brand-mark"><span>p</span></span><h1>{t("나의 포카를 저장해 보세요", "Save your photocards")}</h1><p>{t("Google 계정으로 로그인하면 어느 기기에서든 내 포카 앨범을 이어서 볼 수 있어요.", "Sign in with Google to access your collection on any device.")}</p><button className="google-login-button large" onClick={onSignIn}><LogIn size={18} /> {t("Google로 로그인", "Sign in with Google")}</button></div></section>;
  const total = catalogCards.length; const percent = Math.round((owned.length / total) * 100);
  const pageSize = 12; const pageCount = Math.max(1, Math.ceil(filteredCards.length / pageSize)); const currentPage = Math.min(page, pageCount); const pageCards = filteredCards.slice((currentPage - 1) * pageSize, currentPage * pageSize); const pageStart = Math.max(1, Math.min(currentPage - 2, pageCount - 4)); const visiblePages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => pageStart + index);
  const initial = (user.name || user.email || "P").trim().charAt(0).toLocaleUpperCase();
  return <section className="collection-page"><div className="album-header"><div className="profile-avatar">{user.avatarUrl ? <Image src={user.avatarUrl} alt={t(`${user.name} 프로필 사진`, `${user.name} profile photo`)} fill unoptimized sizes="68px" /> : initial}<span>✦</span></div><div><span className="eyebrow"><span /> MY POCKET</span><h1>{t(`${user.name}의 포카 앨범`, `${user.name}'s photocard album`)}</h1><p>{t("좋아하는 순간을 한 장씩 모으는 중 · 공개 앨범", "Collecting favorite moments · Public album")}</p></div><div className="album-header-actions">{onEditProfile && <button className="secondary-button" onClick={onEditProfile}><Pencil size={16} /> {t("프로필 수정", "Edit profile")}</button>}<button className="secondary-button"><Share2 size={16} /> {t("공유하기", "Share")}</button></div></div>
    <div className="collection-stats"><div><strong>{owned.length}</strong><span>{t("보유 포카", "Owned")}</span></div><div><strong>{photoAcquiredCount}</strong><span>{t("사진 획득", "Photo matches")}</span></div><div><strong>{drawnCount}</strong><span>{t("뽑기 획득", "Drawn")}</span></div><div><strong>{percent}%</strong><span>{t("수집률", "Complete")}</span></div><div className="completion"><span>{t(`전체 ${total}장 중 ${owned.length}장`, `${owned.length} of ${total} cards`)}</span><div><i style={{ width: `${percent}%` }} /></div></div></div>
    <Filters member={member} setMember={setMember} collection={collection} setCollection={setCollection} cards={ownedCards} /><div className="result-bar"><span><strong>{filteredCards.length}</strong>{t("장의 포카", " photocards")}</span><label className="sort-wrap"><Filter size={14} /><select value={sort} aria-label={t("나의 포카 정렬 순서", "My card sort order")} onChange={(event) => setSort(event.target.value as CatalogSort)}><option value="release-asc">{t("발매 · 공개 순", "Oldest first")}</option><option value="release-desc">{t("최신순", "Newest first")}</option><option value="owners-desc">{t("소장 많은 순", "Most owned")}</option><option value="owners-asc">{t("소장 적은 순", "Least owned")}</option></select><ChevronDown size={13} /></label></div>
    <div className="binder collection-binder"><div className="binder-rings">{[1,2,3,4,5].map((n) => <i key={n} />)}</div><div className="binder-top"><div><span className="section-kicker">MY PHOTOCARD BINDER</span><h2>POCA POCKET</h2></div><span>{filteredCards.length} CARDS</span></div>{pageCards.length > 0 ? <div className="collection-card-grid">{pageCards.map((card) => <PhotoCard key={card.id} card={card} owned revealed={revealedIds.includes(card.id)} ownerCount={ownerCounts[card.id] ?? 1} onToggle={() => toggleOwned(card.id)} onOpen={() => setSelectedCard(card)} globalBlur={globalBlur} />)}</div> : <div className="collection-empty"><span className="brand-mark"><span>p</span></span><h3>{ownedCards.length ? t("조건에 맞는 포카가 없어요", "No matching photocards") : t("아직 꽂아둔 포카가 없어요", "Your album is empty")}</h3><p>{ownedCards.length ? t("필터를 바꿔보세요.", "Try changing the filters.") : t("포카도감에서 소장 버튼을 누르거나 사진으로 포카를 찾아 추가해 보세요.", "Add cards from the catalog or find them from a photo.")}</p></div>}{filteredCards.length > pageSize && <nav className="binder-pagination" aria-label={t("나의 포카 페이지", "My cards pages")}><button aria-label={t("이전 페이지", "Previous page")} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>{visiblePages.map((number) => <button key={number} className={number === currentPage ? "active" : ""} aria-current={number === currentPage ? "page" : undefined} onClick={() => setPage(number)}>{number}</button>)}<button aria-label={t("다음 페이지", "Next page")} disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button></nav>}<span className="page-number">— {String(currentPage).padStart(2, "0")} / {String(pageCount).padStart(2, "0")} —</span></div>
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
    <CardRequestQueue />
  </div></section>;
}

export default function PocaPocketApp() {
  const [locale, setLocale] = useState<Locale>("ko");

  useEffect(() => {
    const savedLocale = window.localStorage.getItem("pocapocket.locale");
    const nextLocale: Locale = savedLocale === "en" ? "en" : "ko";
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale;
  }, []);

  const toggleLocale = () => {
    setLocale((current) => {
      const nextLocale: Locale = current === "ko" ? "en" : "ko";
      window.localStorage.setItem("pocapocket.locale", nextLocale);
      document.documentElement.lang = nextLocale;
      return nextLocale;
    });
  };
  const [view, setView] = useState<View>("catalog"); const [owned, setOwned] = useState<string[]>([]); const [revealedIds, setRevealedIds] = useState<string[]>([]); const [photoAcquiredIds, setPhotoAcquiredIds] = useState<string[]>([]); const [drawnIds, setDrawnIds] = useState<string[]>([]); const [ownerCounts, setOwnerCounts] = useState<Record<string, number>>({}); const [globalBlur, setGlobalBlur] = useState(true); const [mobileOpen, setMobileOpen] = useState(false); const [toast, setToast] = useState(""); const [authUser, setAuthUser] = useState<AuthUser | null>(null); const [profile, setProfile] = useState<UserProfile | null>(null); const [profileFeatureReady, setProfileFeatureReady] = useState(false); const [profileEditorOpen, setProfileEditorOpen] = useState(false); const [isAdmin, setIsAdmin] = useState(false); const [authReady, setAuthReady] = useState(false);
  const localAdminAccess = process.env.NODE_ENV === "development" && isAdmin;
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setAuthReady(true); return; }
    let active = true;
    const applySession = async (accessToken?: string) => {
      if (!accessToken) { if (active) { setAuthUser(null); setProfile(null); setProfileFeatureReady(false); setProfileEditorOpen(false); setIsAdmin(false); setOwned([]); setRevealedIds([]); setPhotoAcquiredIds([]); setDrawnIds([]); setAuthReady(true); } return; }
      const identityResponse = await fetch("/api/auth/identity", { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!identityResponse.ok) { if (active) setAuthReady(true); return; }
      const identity = await identityResponse.json() as { user: AuthUser; isAdmin: boolean };
      const [cardsResult, profileResult, provenanceResult] = await Promise.all([
        supabase.from("user_cards").select("card_id, acquisition_method"),
        supabase.from("profiles").select("nickname, avatar_path").eq("id", identity.user.id).maybeSingle(),
        supabase.rpc("card_provenance", { owner_id: identity.user.id }),
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
      if (active) { const ownedIds = cardRows.map((row) => row.card_id); const recognizedIds = cardRows.filter((row) => "acquisition_method" in row && row.acquisition_method === "recognized").map((row) => row.card_id); setAuthUser(loadedUser); setProfile(loadedProfile); setProfileFeatureReady(!profileResult.error); setIsAdmin(identity.isAdmin); setOwned(ownedIds); setRevealedIds(recognizedIds); setPhotoAcquiredIds(recognizedIds); setDrawnIds([]); setOwnerCounts((current) => { const next = { ...current }; for (const id of ownedIds) next[id] = Math.max(1, next[id] ?? 0); return next; }); setAuthReady(true); }
      if (active && !provenanceResult.error) {
        const ownedIds = new Set(cardRows.map((row) => row.card_id));
        const provenanceRows = provenanceResult.data ?? [];
        const photoIds = provenanceRows.filter((row: { card_id: string; photo_verified: boolean }) => row.photo_verified && ownedIds.has(row.card_id)).map((row: { card_id: string }) => row.card_id);
        const acquiredByDrawIds = provenanceRows
          .filter((row: { card_id: string; drawn: boolean }) => row.drawn && ownedIds.has(row.card_id))
          .map((row: { card_id: string }) => row.card_id);
        setPhotoAcquiredIds(photoIds); setDrawnIds(acquiredByDrawIds);
        setRevealedIds((current) => [...new Set([...current, ...acquiredByDrawIds])]);
      }
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session?.access_token));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void applySession(session?.access_token), 0);
    });
    const refreshCollection = () => { void supabase.auth.getSession().then(({ data }) => applySession(data.session?.access_token)); };
    window.addEventListener('pocapocket:collection-updated', refreshCollection);
    return () => { active = false; listener.subscription.unsubscribe(); window.removeEventListener('pocapocket:collection-updated', refreshCollection); };
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
    if (!supabase) { showToast(tr(locale, "Supabase 연결 설정이 필요해요", "Supabase connection settings are required")); return; }
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) showToast(tr(locale, "Google 로그인을 시작하지 못했어요", "Could not start Google sign-in"));
  };
  const signOut = async () => { await getSupabaseBrowserClient()?.auth.signOut(); setProfile(null); setProfileFeatureReady(false); setProfileEditorOpen(false); setRevealedIds([]); setPhotoAcquiredIds([]); setDrawnIds([]); setView("catalog"); };
  const toggleOwned = async (id: string, acquisitionMethod: "manual" | "recognized" = "manual") => {
    const supabase = getSupabaseBrowserClient();
    if (!authUser || !supabase) { await signIn(); return; }
    const removing = owned.includes(id);
    const wasRevealed = revealedIds.includes(id);
    const wasPhotoAcquired = photoAcquiredIds.includes(id);
    const wasDrawn = drawnIds.includes(id);
    setOwned((current) => removing ? current.filter((item) => item !== id) : [...current, id]);
    setRevealedIds((current) => removing ? current.filter((item) => item !== id) : acquisitionMethod === "recognized" ? [...new Set([...current, id])] : current);
    setPhotoAcquiredIds((current) => removing ? current.filter((item) => item !== id) : acquisitionMethod === "recognized" ? [...new Set([...current, id])] : current);
    if (removing) setDrawnIds((current) => current.filter((item) => item !== id));
    setOwnerCounts((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + (removing ? -1 : 1)) }));
    let result = removing
      ? await supabase.from("user_cards").delete().eq("user_id", authUser.id).eq("card_id", id)
      : await supabase.from("user_cards").insert({ user_id: authUser.id, card_id: id, ...(acquisitionMethod === "recognized" ? { acquisition_method: "recognized" } : {}) });
    if (result.error && !removing && acquisitionMethod === "recognized") result = await supabase.from("user_cards").insert({ user_id: authUser.id, card_id: id });
    if (result.error) { setOwned((current) => removing ? [...current, id] : current.filter((item) => item !== id)); setRevealedIds((current) => wasRevealed ? [...new Set([...current, id])] : current.filter((item) => item !== id)); setPhotoAcquiredIds((current) => wasPhotoAcquired ? [...new Set([...current, id])] : current.filter((item) => item !== id)); setDrawnIds((current) => wasDrawn ? [...new Set([...current, id])] : current.filter((item) => item !== id)); setOwnerCounts((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + (removing ? 1 : -1)) })); showToast(tr(locale, "저장하지 못했어요. 잠시 후 다시 시도해 주세요", "Could not save. Please try again shortly")); }
    else void supabase.rpc("get_card_owner_counts").then(({ data }) => { const row = data?.find((item) => item.card_id === id); setOwnerCounts((current) => ({ ...current, [id]: Number(row?.owner_count ?? (removing ? 0 : Math.max(1, current[id] ?? 1))) })); });
  };
  const addOwned = async (id: string, silent = false) => {
    const supabase = getSupabaseBrowserClient();
    if (!authUser || !supabase) { await signIn(); return; }
    if (!owned.includes(id)) await toggleOwned(id, "recognized");
    else {
      setRevealedIds((current) => [...new Set([...current, id])]);
      setPhotoAcquiredIds((current) => [...new Set([...current, id])]);
      await supabase.from("user_cards").update({ acquisition_method: "recognized" }).eq("user_id", authUser.id).eq("card_id", id);
    }
    if (!silent) showToast(tr(locale, "사진으로 확인한 포카를 원본으로 표시해요", "Photo-verified cards are now shown in full"));
  };
  const navigate = (next: View) => { if (next === "settings" && !localAdminAccess) return; setView(next); setMobileOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const completeProfile = (nextProfile: UserProfile) => { setProfile(nextProfile); setProfileEditorOpen(false); setAuthUser((current) => current ? { ...current, name: nextProfile.nickname, avatarUrl: nextProfile.avatarUrl } : current); };
  const initial = (authUser?.name || authUser?.email || "P").trim().charAt(0).toLocaleUpperCase();
  return <I18nProvider locale={locale}><main><header className="site-header"><button className="mobile-menu" aria-label={tr(locale, "메뉴", "Menu")} onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <Menu />}</button><button className="logo-button" onClick={() => navigate("catalog")}><Logo /></button><nav className={mobileOpen ? "open" : ""}>{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><item.icon size={17} /> {tr(locale, item.ko, item.en)}</button>)}</nav><div className="header-actions"><button className="language-button" aria-label={tr(locale, "영어로 변경", "Switch to Korean")} onClick={toggleLocale}>{locale === "ko" ? "EN" : "한국어"}</button>{authUser ? <><button className="profile-button" title={authUser.email ?? authUser.name} onClick={() => navigate("collection")}>{authUser.avatarUrl ? <Image src={authUser.avatarUrl} alt={tr(locale, "프로필 사진", "Profile picture")} fill unoptimized sizes="36px" /> : initial}</button><button className="icon-button" aria-label={tr(locale, "로그아웃", "Sign out")} title={tr(locale, "로그아웃", "Sign out")} onClick={signOut}><LogOut size={17} /></button></> : <button className="google-login-button" disabled={!authReady} onClick={signIn}><LogIn size={16} /> {tr(locale, "Google 로그인", "Sign in with Google")}</button>}{localAdminAccess && <button className="icon-button desktop-settings" aria-label={tr(locale, "관리자 설정", "Admin settings")} onClick={() => navigate("settings")}><Settings2 size={18} /></button>}</div></header>
    {view === "catalog" && <CatalogView owned={owned} revealedIds={revealedIds} ownerCounts={ownerCounts} toggleOwned={toggleOwned} globalBlur={globalBlur} setView={navigate} localAdminAccess={localAdminAccess} />}{view === "recognize" && <RecognizeView signedIn={Boolean(authUser)} onSignIn={signIn} addOwned={addOwned} revealedIds={revealedIds} globalBlur={globalBlur} />}{view === "collection" && <CollectionView owned={owned} revealedIds={revealedIds} photoAcquiredCount={photoAcquiredIds.length} drawnCount={drawnIds.length} ownerCounts={ownerCounts} toggleOwned={toggleOwned} globalBlur={globalBlur} user={authUser} onSignIn={signIn} onEditProfile={profileFeatureReady && profile ? () => setProfileEditorOpen(true) : undefined} />}{view === "settings" && localAdminAccess && <SettingsView globalBlur={globalBlur} setGlobalBlur={setGlobalBlur} />}
    <footer><Logo /><p>{tr(locale, "팬이 만들고, 팬이 함께 채우는 오픈 포토카드 아카이브.", "An open photocard archive made and completed by fans.")}</p><small>{tr(locale, "자료 출처: 리센느 음원총공팀 포카사전 · 이벤트 포카 Scene Simulation · Lip Bomb 앨범 포카 @bemyzena_ · Pulse 포카 MaxKim. 인식: XFeat (Apache-2.0). RESCENE 및 포토카드 권리는 각 권리자에게 있습니다.", "Sources: RESCENE streaming team's photocard catalog · Event photocards Scene Simulation · Lip Bomb album photocards @bemyzena_ · Pulse photocards MaxKim. Recognition: XFeat (Apache-2.0). RESCENE and photocard rights belong to their respective owners.")}</small></footer>{authUser && profileFeatureReady && (!profile || profileEditorOpen) && <ProfileSetup userId={authUser.id} currentProfile={profile} onComplete={completeProfile} onSignOut={signOut} onCancel={profile ? () => setProfileEditorOpen(false) : undefined} />}{toast && <div className="toast"><Check size={16} /> {toast}</div>}
    {view === "draw" && <DailyDraw />}
  </main></I18nProvider>;
}
