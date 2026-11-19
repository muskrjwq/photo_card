"use client";

import { Check, ImagePlus, LoaderCircle, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useI18n } from "@/lib/i18n";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const OUTPUT_SIZE = 256;
const TARGET_MAX_BYTES = 60 * 1024;

export type UserProfile = {
  nickname: string;
  avatarPath: string;
  avatarUrl: string;
};

type ProfileSetupProps = {
  userId: string;
  currentProfile?: UserProfile | null;
  onComplete: (profile: UserProfile) => void;
  onSignOut: () => void;
  onCancel?: () => void;
};

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("이미지를 변환하지 못했습니다.")), "image/webp", quality));
}

async function createAvatar(file: File, zoom: number, positionX: number, positionY: number) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
      element.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리하지 못했습니다.");
    const baseScale = Math.max(OUTPUT_SIZE / image.naturalWidth, OUTPUT_SIZE / image.naturalHeight);
    const scale = baseScale * zoom;
    const sourceWidth = Math.min(image.naturalWidth, OUTPUT_SIZE / scale);
    const sourceHeight = Math.min(image.naturalHeight, OUTPUT_SIZE / scale);
    const sourceX = (image.naturalWidth - sourceWidth) * (positionX / 100);
    const sourceY = (image.naturalHeight - sourceHeight) * (positionY / 100);
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    let quality = .82;
    let blob = await canvasToBlob(canvas, quality);
    while (blob.size > TARGET_MAX_BYTES && quality > .5) {
      quality -= .07;
      blob = await canvasToBlob(canvas, quality);
    }
    if (blob.size > 100 * 1024) throw new Error("프사 용량을 100KB 이하로 줄이지 못했습니다. 다른 사진을 선택해 주세요.");
    return blob;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export default function ProfileSetup({ userId, currentProfile, onComplete, onSignOut, onCancel }: ProfileSetupProps) {
  const { t } = useI18n();
  const editing = Boolean(currentProfile);
  const [nickname, setNickname] = useState(currentProfile?.nickname ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1.15);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const chooseFile = (nextFile?: File) => {
    setError("");
    if (!nextFile) return;
    if (!/^image\/(?:jpeg|png|webp)$/.test(nextFile.type)) { setError(t("JPG, PNG, WEBP 이미지만 사용할 수 있습니다.", "Only JPG, PNG, and WEBP images are supported.")); return; }
    if (nextFile.size > MAX_SOURCE_BYTES) { setError(t("원본 이미지는 최대 5MB까지 업로드할 수 있습니다.", "The source image must be 5MB or smaller.")); return; }
    const nextPreviewUrl = URL.createObjectURL(nextFile);
    const image = new window.Image();
    image.onload = () => setPreviewSize({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => setError(t("이미지를 읽지 못했습니다.", "Could not read the image."));
    image.src = nextPreviewUrl;
    setFile(nextFile);
    setPreviewUrl(nextPreviewUrl);
    setPreviewSize(null);
    setZoom(1.15); setPositionX(50); setPositionY(50);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanNickname = nickname.trim();
    if (cleanNickname.length < 2 || cleanNickname.length > 20) { setError(t("닉네임은 2~20자로 입력해 주세요.", "Enter a nickname between 2 and 20 characters.")); return; }
    if (!file && !currentProfile) { setError(t("프로필 사진을 선택해 주세요.", "Choose a profile picture.")); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError(t("Supabase 연결 설정이 필요합니다.", "Supabase connection settings are required.")); return; }
    setSaving(true); setError("");
    try {
      let avatarPath = currentProfile?.avatarPath ?? "";
      let uploadedPath: string | null = null;
      if (file) {
        const avatar = await createAvatar(file, zoom, positionX, positionY);
        avatarPath = `${userId}/avatar-${Date.now()}.webp`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(avatarPath, avatar, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
        if (uploadError) throw uploadError;
        uploadedPath = avatarPath;
      }
      const { error: profileError } = await supabase.from("profiles").upsert({ id: userId, nickname: cleanNickname, avatar_path: avatarPath, updated_at: new Date().toISOString() });
      if (profileError) {
        if (uploadedPath) await supabase.storage.from("avatars").remove([uploadedPath]);
        if (profileError.code === "23505") throw new Error(t("이미 사용 중인 닉네임입니다.", "This nickname is already in use."));
        throw profileError;
      }
      if (uploadedPath && currentProfile?.avatarPath && currentProfile.avatarPath !== uploadedPath) {
        await supabase.storage.from("avatars").remove([currentProfile.avatarPath]);
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(avatarPath);
      onComplete({ nickname: cleanNickname, avatarPath, avatarUrl: data.publicUrl });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("프로필을 저장하지 못했습니다.", "Could not save the profile."));
      setSaving(false);
    }
  };

  const shownAvatar = previewUrl ?? currentProfile?.avatarUrl ?? null;
  const aspectRatio = previewSize ? previewSize.width / previewSize.height : 1;
  const previewWidth = (aspectRatio >= 1 ? aspectRatio * 100 : 100) * zoom;
  const previewHeight = (aspectRatio >= 1 ? 100 : 100 / aspectRatio) * zoom;
  const previewLeft = -(previewWidth - 100) * positionX / 100;
  const previewTop = -(previewHeight - 100) * positionY / 100;
  return <div className="profile-setup-backdrop"><form className="profile-setup" onSubmit={submit}>{editing && onCancel && <button type="button" className="profile-setup-close" aria-label={t("닫기", "Close")} onClick={onCancel}><X size={20} /></button>}<div className="profile-setup-copy"><span className="eyebrow"><span /> {editing ? "MY PROFILE" : "WELCOME TO POCA POCKET"}</span><h2>{editing ? t("프로필 수정", "Edit profile") : t("리센느 포카도감에 오신 걸 환영해요", "Welcome to the RESCENE Photocard Catalog")}</h2></div><div className="profile-setup-body"><div className="avatar-editor"><label className={`avatar-crop ${shownAvatar ? "has-image" : ""}`}>{previewUrl && previewSize ? <><Image src={previewUrl} alt={t("프로필 사진 미리보기", "Profile picture preview")} unoptimized width={previewSize.width} height={previewSize.height} style={{ position: "absolute", maxWidth: "none", width: `${previewWidth}%`, height: `${previewHeight}%`, left: `${previewLeft}%`, top: `${previewTop}%` }} /><span className="avatar-guide" /></> : currentProfile?.avatarUrl ? <><Image src={currentProfile.avatarUrl} alt={t("현재 프로필 사진", "Current profile picture")} fill unoptimized sizes="220px" /><span className="avatar-guide" /></> : <><ImagePlus size={30} /><b>{t("프사 선택", "Choose photo")}</b><small>JPG · PNG · WEBP</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} /></label>{previewUrl && <div className="avatar-controls"><label><span>{t("확대", "Zoom")}</span><input type="range" min="1" max="3" step=".05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label><label><span>{t("좌우 위치", "Horizontal")}</span><input type="range" min="0" max="100" value={positionX} onChange={(event) => setPositionX(Number(event.target.value))} /></label><label><span>{t("상하 위치", "Vertical")}</span><input type="range" min="0" max="100" value={positionY} onChange={(event) => setPositionY(Number(event.target.value))} /></label></div>}</div><div className="profile-fields"><label><span>{t("닉네임", "Nickname")}</span><input value={nickname} maxLength={20} onChange={(event) => setNickname(event.target.value)} placeholder={t("2~20자 닉네임", "2–20 characters")} autoFocus /><small>{nickname.trim().length}/20 · {t("다른 사용자와 중복할 수 없어요.", "Must be unique.")}</small></label>{error && <p className="profile-error">{error}</p>}<button className="primary-button profile-submit" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={17} /> {t("저장 중…", "Saving…")}</> : <><Check size={17} /> {editing ? t("변경사항 저장", "Save changes") : t("가입 완료", "Complete sign-up")}</>}</button>{!editing && <button type="button" className="profile-signout" onClick={onSignOut} disabled={saving}>{t("다른 계정으로 로그인", "Sign in with another account")}</button>}</div></div></form></div>;
}

