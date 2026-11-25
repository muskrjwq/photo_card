"use client";

import { Check, ImagePlus, Save, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { catalogCards, collections, members, type CatalogCard } from "@/modules/catalog";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useI18n } from "@/lib/i18n";
import { cardRequestClient, prepareRequestImage, removeCardRequest, type CardRequest } from "@/lib/card-requests";

type EditorProps = {
  card?: CatalogCard;
  submission?: { image: File; signedIn: boolean; onSignIn: () => void; onSent: () => void };
  review?: CardRequest & { image_data: string; onResolved: () => void };
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

export default function LocalCardEditor({ card, submission, review, onClose }: EditorProps) {
  const { t, memberLabel, collectionLabel } = useI18n();
  const [type, setType] = useState<"album" | "event">(review?.card_type ?? card?.category ?? "event");
  const [collection, setCollection] = useState(review?.collection ?? card?.collection ?? "");
  const [member, setMember] = useState(review?.member ?? card?.member ?? "원이");
  const [name, setName] = useState(review?.name ?? card?.name ?? "");
  const [image, setImage] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const sourceImage = image ?? submission?.image;
  const preview = filePreview ?? review?.image_data ?? card?.image;
  const memberOptions = [...new Set([...members, "단체", "유닛"])];
  const collectionOptions = collections.filter((item) => catalogCards.some((candidate) => candidate.collection === item && candidate.category === type));
  const matchingSeries = useMemo(() => catalogCards.find((candidate) => candidate.id !== card?.id && candidate.category === type && candidate.collection === collection.trim() && candidate.name.normalize("NFKC").trim().toLocaleLowerCase() === name.normalize("NFKC").trim().toLocaleLowerCase()), [card?.id, collection, name, type]);

  useEffect(() => {
    const url = sourceImage ? URL.createObjectURL(sourceImage) : null;
    setFilePreview(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [sourceImage]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose, saving]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submission && !submission.signedIn) return;
    setError("");
    if (!registered && (!collection.trim() || !name.trim() || (!card && !sourceImage && !review))) {
      setError(t("포카 정보와 이미지를 입력해 주세요.", "Enter the card details and choose an image."));
      return;
    }
    setSaving(true);
    try {
      if (submission) {
        let imageData: string;
        try {
          imageData = await prepareRequestImage(image ?? submission.image);
        } catch {
          throw new Error(t("15MB 이하의 JPG, PNG 또는 WebP 사진을 선택해 주세요.", "Choose a JPG, PNG or WebP image up to 15 MB."));
        }
        const { error: requestError } = await cardRequestClient().from("card_requests").insert({
          card_type: type, collection: collection.trim(), member, name: name.trim(), image_data: imageData,
        });
        if (requestError) {
          if (requestError.code === "PGRST205" || requestError.code === "42P01") {
            throw new Error(t("아직 요청 접수가 열리지 않았어요.", "Photocard requests are not open yet."));
          }
          throw new Error(requestError.message.includes("pending_card_request_limit")
            ? t("처리 대기 중인 요청은 계정당 최대 5건입니다.", "You can have up to five pending requests.")
            : t("요청을 보내지 못했어요. 로그인 상태를 확인하고 다시 시도해 주세요.", "Could not send the request. Check that you are signed in and try again."));
        }
        submission.onSent();
        return;
      }
      if (review && registered) {
        await removeCardRequest(review.id);
        review.onResolved();
        return;
      }
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
          requestId: review?.id,
          type,
          collection: collection.trim(),
          member,
          name: name.trim(),
          imageBase64: image ? await fileToDataUrl(image) : review?.image_data ?? null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === "admin_required" ? "관리자 인증에 실패했습니다." : `저장하지 못했습니다: ${result.error ?? response.status}`);
      if (review) {
        setRegistered(true);
        try {
          await removeCardRequest(review.id);
        } catch {
          throw new Error(t("포카는 로컬에 저장했습니다. 버튼을 다시 눌러 요청 삭제를 재시도하세요.", "The card was saved locally. Press the button again to remove the request."));
        }
        review.onResolved();
      }
      if (result.recognitionIndexPending) window.alert(t("저장했습니다. 배포 전 npm run recognition:update로 새 이미지 인식 특징을 갱신하세요.", "Saved. Run npm run recognition:update before deploying to index the new image."));
      onClose();
    } catch (reason) {
      setError(editorErrorMessage(reason, "저장하지 못했습니다. 로컬 편집 서버를 확인해 주세요."));
      setSaving(false);
    }
  };

  const rejectRequest = async () => {
    if (!review || registered || saving || !window.confirm(t("이 요청과 사진을 삭제할까요?", "Delete this request and its image?"))) return;
    setSaving(true);
    setError("");
    try {
      await removeCardRequest(review.id);
      review.onResolved();
    } catch {
      setError(t("요청을 삭제하지 못했어요. 다시 시도해 주세요.", "Could not delete the request. Try again."));
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
      onClose();
    } catch (reason) {
      setError(editorErrorMessage(reason, "삭제하지 못했습니다. 로컬 편집 서버를 확인해 주세요."));
      setSaving(false);
    }
  };

  return <div className="local-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form className="local-editor" onSubmit={submit} role="dialog" aria-modal="true" aria-label={t("포카 정보", "Photocard details")}>
      <div className="local-editor-heading"><div><span className="section-kicker">LOCAL CATALOG EDITOR</span><h2>{submission ? t("포카 추가 요청", "Request a photocard") : review ? t("요청 검토", "Review request") : card ? t("포카 편집", "Edit card") : t("새 포카 추가", "Add card")}</h2><p>{submission ? t("사진과 입력한 정보가 관리자에게 전달됩니다.", "Your image and card details will be sent to the administrator.") : t("저장 내용은 프로젝트의 CSV와 이미지 파일에 직접 반영됩니다.", "Changes are saved to the project CSV and image files.")}</p></div><button type="button" aria-label={t("닫기", "Close")} onClick={onClose} disabled={saving}><X size={20} /></button></div>
      <div className="local-editor-body">
        <label className="local-image-field"><span>{preview ? <Image src={preview} alt={t("포카 미리보기", "Photocard preview")} fill unoptimized sizes="230px" /> : <><ImagePlus size={30} /><b>{t("포카 이미지 선택", "Choose image")}</b></>}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving || registered} aria-label={t("포카 이미지 선택", "Choose image")} onChange={(event) => setImage(event.target.files?.[0] ?? null)} /><small>{card || review ? t("교체하지 않으면 현재 이미지를 사용합니다.", "The current image is used unless you replace it.") : t("JPG, PNG, WebP · 최대 15MB", "JPG, PNG, WebP · Up to 15 MB")}</small></label>
        <div className="local-editor-fields">
          {submission && <p>{t("요청 사진은 관리자만 검토하며, 승인되면 도감에 게시될 수 있어요.", "Only the administrator reviews request photos. Approved photos may be published in the catalog.")}</p>}
          {submission && !submission.signedIn && <p>{t("요청을 보내려면 Google 로그인이 필요해요. 로그인 후 사진을 다시 선택해 주세요.", "Sign in with Google to send a request. Select the photo again after signing in.")}</p>}
          <div className="local-field-row"><label><span>{t("분류", "Type")}</span><select value={type} onChange={(event) => { setType(event.target.value as "album" | "event"); setCollection(""); }}><option value="album">{t("앨범", "Album")}</option><option value="event">{t("이벤트 · 기타", "Event / Other")}</option></select></label><label><span>{t("멤버", "Member")}</span><select value={member} onChange={(event) => setMember(event.target.value)}>{memberOptions.map((item) => <option key={item} value={item}>{memberLabel(item)}</option>)}</select></label></div>
          <label><span>{t("앨범 / 이벤트", "Album / Event")}</span><input list="local-card-collections" value={collection} onChange={(event) => setCollection(event.target.value)} placeholder={t("기존 항목 선택 또는 새 이름 입력", "Choose or enter a collection")} maxLength={120} required /><datalist id="local-card-collections">{collectionOptions.map((item) => <option key={item} value={item} label={collectionLabel(item)} />)}</datalist><small>{t("목록에 없으면 새 이름을 입력하세요.", "Enter a new name if it is not listed.")}</small></label>
          <label><span>{t("포카 이름", "Card name")}</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("포카 이름", "Card name")} maxLength={120} required /></label>
          {!submission && <div className={`series-match-note ${matchingSeries ? "matched" : ""}`}>{matchingSeries ? <><Check size={15} /><span><b>{t("같은 시리즈를 찾았습니다.", "Matching series found.")}</b> #{matchingSeries.idNumber} · {memberLabel(matchingSeries.member)}</span></> : <span>{t("같은 분류·앨범/이벤트·포카명의 카드가 있으면 기존 시리즈에 연결됩니다.", "Cards with the same type, collection and name are grouped into one series.")}</span>}</div>}
          {error && <p className="local-editor-error">{error}</p>}
          <div className={`local-editor-actions ${card || review ? "has-delete" : ""}`}>
            {card && <button type="button" className="local-delete-button" onClick={remove} disabled={saving}><Trash2 size={15} /> {t("삭제", "Delete")}</button>}
            {review && <button type="button" className="local-delete-button" onClick={() => void rejectRequest()} disabled={saving || registered}><Trash2 size={15} /> {t("요청 반려", "Reject request")}</button>}
            <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>{t("닫기", "Close")}</button>
            {submission && !submission.signedIn
              ? <button type="button" className="primary-button" onClick={submission.onSignIn}>{t("Google 로그인", "Sign in with Google")}</button>
              : <button type="submit" className="primary-button" disabled={saving}><Save size={16} /> {saving ? t("처리 중…", "Working…") : submission ? t("요청 보내기", "Send request") : registered ? t("요청 삭제 재시도", "Retry removing request") : review ? t("새 포카로 등록", "Register card") : t("CSV에 저장", "Save to CSV")}</button>}
          </div>
        </div>
      </div>
    </form>
  </div>;
}

