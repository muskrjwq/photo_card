"use client";

import { Camera, Check, ImagePlus, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

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
  suggestedNickname: string;
  onComplete: (profile: UserProfile) => void;
  onSignOut: () => void;
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

export default function ProfileSetup({ userId, suggestedNickname, onComplete, onSignOut }: ProfileSetupProps) {
  const [nickname, setNickname] = useState(suggestedNickname.trim().slice(0, 20));
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const chooseFile = (nextFile?: File) => {
    setError("");
    if (!nextFile) return;
    if (!/^image\/(?:jpeg|png|webp)$/.test(nextFile.type)) { setError("JPG, PNG, WEBP 이미지만 사용할 수 있습니다."); return; }
    if (nextFile.size > MAX_SOURCE_BYTES) { setError("원본 이미지는 최대 5MB까지 업로드할 수 있습니다."); return; }
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setZoom(1); setPositionX(50); setPositionY(50);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanNickname = nickname.trim();
    if (cleanNickname.length < 2 || cleanNickname.length > 20) { setError("닉네임은 2~20자로 입력해 주세요."); return; }
    if (!file) { setError("프로필 사진을 선택해 주세요."); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError("Supabase 연결 설정이 필요합니다."); return; }
    setSaving(true); setError("");
    try {
      const avatar = await createAvatar(file, zoom, positionX, positionY);
      const avatarPath = `${userId}/avatar-${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(avatarPath, avatar, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (uploadError) throw uploadError;
      const { error: profileError } = await supabase.from("profiles").upsert({ id: userId, nickname: cleanNickname, avatar_path: avatarPath, updated_at: new Date().toISOString() });
      if (profileError) {
        await supabase.storage.from("avatars").remove([avatarPath]);
        if (profileError.code === "23505") throw new Error("이미 사용 중인 닉네임입니다.");
        throw profileError;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(avatarPath);
      onComplete({ nickname: cleanNickname, avatarPath, avatarUrl: data.publicUrl });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "프로필을 저장하지 못했습니다.");
      setSaving(false);
    }
  };

  return <div className="profile-setup-backdrop"><form className="profile-setup" onSubmit={submit}><div className="profile-setup-copy"><span className="eyebrow"><span /> WELCOME TO POCA POCKET</span><h2>포카포켓에 오신 걸 환영해요</h2><p>다른 팬들에게 보여질 닉네임과 프로필 사진을 설정해 주세요.</p></div><div className="profile-setup-body"><div className="avatar-editor"><label className={`avatar-crop ${previewUrl ? "has-image" : ""}`}>{previewUrl ? <><Image src={previewUrl} alt="프로필 사진 미리보기" fill unoptimized sizes="220px" style={{ objectPosition: `${positionX}% ${positionY}%`, transform: `scale(${zoom})` }} /><span className="avatar-guide" /></> : <><ImagePlus size={30} /><b>프사 선택</b><small>JPG · PNG · WEBP</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} /></label>{previewUrl && <div className="avatar-controls"><label><span>확대</span><input type="range" min="1" max="3" step=".05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label><label><span>좌우 위치</span><input type="range" min="0" max="100" value={positionX} onChange={(event) => setPositionX(Number(event.target.value))} /></label><label><span>상하 위치</span><input type="range" min="0" max="100" value={positionY} onChange={(event) => setPositionY(Number(event.target.value))} /></label></div>}</div><div className="profile-fields"><label><span>닉네임</span><input value={nickname} maxLength={20} onChange={(event) => setNickname(event.target.value)} placeholder="2~20자 닉네임" autoFocus /><small>{nickname.trim().length}/20 · 다른 사용자와 중복할 수 없어요.</small></label><div className="avatar-spec"><Camera size={16} /><span><b>자동 이미지 최적화</b>256×256 WebP · 목표 30~60KB · 최종 최대 100KB</span></div>{error && <p className="profile-error">{error}</p>}<button className="primary-button profile-submit" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={17} /> 저장 중…</> : <><Check size={17} /> 가입 완료</>}</button><button type="button" className="profile-signout" onClick={onSignOut} disabled={saving}>다른 계정으로 로그인</button></div></div></form></div>;
}

