"use client";

import { Check, ImagePlus, Save, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { catalogCards, collections, members, type CatalogCard } from "@/modules/catalog";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type EditorProps = {
  card?: CatalogCard;
  onClose: () => void;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function editorErrorMessage(reason: unknown, fallback: string) {
  if (reason instanceof TypeError && /fetch/i.test(reason.message)) {
    return "로컬 편집 서비스에 연결할 수 없습니다. 실행 중인 개발 서버를 완전히 종료한 뒤 npm run dev로 다시 시작해 주세요.";
  }
  return reason instanceof Error ? reason.message : fallback;
}

export default function LocalCardEditor({ card, onClose }: EditorProps) {
  const [type, setType] = useState<"album" | "event">(card?.category ?? "event");
  const [collection, setCollection] = useState(card?.collection ?? "");
  const [member, setMember] = useState(card?.member ?? "원이");
  const [name, setName] = useState(card?.name ?? "");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(card?.image ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const memberOptions = [...new Set([...members, "단체", "유닛"])];
  const collectionOptions = collections.filter((item) => catalogCards.some((candidate) => candidate.collection === item && candidate.category === type));
  const matchingSeries = useMemo(() => catalogCards.find((candidate) => candidate.id !== card?.id && candidate.category === type && candidate.collection === collection.trim() && candidate.name.normalize("NFKC").trim().toLocaleLowerCase() === name.normalize("NFKC").trim().toLocaleLowerCase()), [card?.id, collection, name, type]);

  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  const chooseImage = (file: File | null) => {
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : (card?.image ?? null));
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose, saving]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!collection.trim() || !name.trim() || (!card && !image)) {
      setError(!card && !image ? "새 포카 이미지를 선택해 주세요." : "필수 정보를 모두 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const token = data.session?.access_token;
      if (!token) throw new Error("관리자 계정으로 다시 로그인해 주세요.");
      const response = await fetch("http://127.0.0.1:4317/cards", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: card ? "edit" : "create",
          cardId: card?.id,
          type,
          collection: collection.trim(),
          member,
          name: name.trim(),
          imageBase64: image ? await fileToDataUrl(image) : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === "admin_required" ? "관리자 인증에 실패했습니다." : `저장하지 못했습니다: ${result.error ?? response.status}`);
      if (result.recognitionIndexPending) window.alert("저장했습니다. 새 이미지의 인식 특징은 커밋 전에 npm run recognition:index 명령으로 갱신해 주세요.");
      window.location.reload();
    } catch (reason) {
      setError(editorErrorMessage(reason, "저장하지 못했습니다. 로컬 편집 서버를 확인해 주세요."));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!card || saving) return;
    const confirmed = window.confirm(`“${card.member} · ${card.name}” 포카를 삭제할까요?\n\nCSV에서 제거되고 이미지는 로컬 휴지통으로 이동합니다.`);
    if (!confirmed) return;
    setSaving(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const token = data.session?.access_token;
      if (!token) throw new Error("관리자 계정으로 다시 로그인해 주세요.");
      const response = await fetch("http://127.0.0.1:4317/cards", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "delete", cardId: card.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === "admin_required" ? "관리자 인증에 실패했습니다." : `삭제하지 못했습니다: ${result.error ?? response.status}`);
      window.alert("삭제했습니다. 인식 특징 파일에서도 제거하려면 커밋 전에 npm run recognition:index 명령을 실행해 주세요.");
      window.location.reload();
    } catch (reason) {
      setError(editorErrorMessage(reason, "삭제하지 못했습니다. 로컬 편집 서버를 확인해 주세요."));
      setSaving(false);
    }
  };

  return <div className="local-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form className="local-editor" onSubmit={submit}>
      <div className="local-editor-heading"><div><span className="section-kicker">LOCAL CATALOG EDITOR</span><h2>{card ? "포카 편집" : "새 포카 추가"}</h2><p>저장 내용은 프로젝트의 CSV와 이미지 파일에 직접 반영됩니다.</p></div><button type="button" aria-label="닫기" onClick={onClose} disabled={saving}><X size={20} /></button></div>
      <div className="local-editor-body">
        <label className="local-image-field"><span>{preview ? <Image src={preview} alt="포카 미리보기" fill unoptimized sizes="230px" /> : <><ImagePlus size={30} /><b>포카 이미지 선택</b></>}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.target.files?.[0] ?? null)} /><small>{card ? "이미지를 바꾸지 않으면 기존 파일을 유지합니다." : "필수 · JPG, PNG, WEBP · 저장 시 WebP 변환"}</small></label>
        <div className="local-editor-fields">
          <div className="local-field-row"><label><span>분류</span><select value={type} onChange={(event) => { setType(event.target.value as "album" | "event"); setCollection(""); }}><option value="album">앨범</option><option value="event">이벤트 · 기타</option></select></label><label><span>멤버</span><select value={member} onChange={(event) => setMember(event.target.value)}>{memberOptions.map((item) => <option key={item}>{item}</option>)}</select></label></div>
          <label><span>앨범 / 이벤트</span><input list="local-card-collections" value={collection} onChange={(event) => setCollection(event.target.value)} placeholder="기존 항목 선택 또는 새 이름 입력" required /><datalist id="local-card-collections">{collectionOptions.map((item) => <option key={item} value={item} />)}</datalist><small>목록에 없으면 새 이름을 그대로 입력하세요.</small></label>
          <label><span>포카 이름</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="포카 이름" required /></label>
          <div className={`series-match-note ${matchingSeries ? "matched" : ""}`}>{matchingSeries ? <><Check size={15} /><span><b>같은 시리즈를 찾았습니다.</b> #{matchingSeries.idNumber} · {matchingSeries.member} 포카와 같은 시리즈로 저장합니다.</span></> : <span>같은 분류·앨범/이벤트·포카명의 카드가 있으면 기존 시리즈에 자동으로 연결됩니다.</span>}</div>
          {error && <p className="local-editor-error">{error}</p>}
          <div className={`local-editor-actions ${card ? "has-delete" : ""}`}>{card && <button type="button" className="local-delete-button" onClick={remove} disabled={saving}><Trash2 size={15} /> 삭제</button>}<button type="button" className="secondary-button" onClick={onClose} disabled={saving}>취소</button><button type="submit" className="primary-button" disabled={saving}><Save size={16} /> {saving ? "처리 중…" : "CSV에 저장"}</button></div>
        </div>
      </div>
    </form>
  </div>;
}

