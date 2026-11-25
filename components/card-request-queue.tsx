"use client";

import { useCallback, useEffect, useState } from "react";
import LocalCardEditor from "@/components/local-card-editor";
import { cardRequestClient, type CardRequest } from "@/lib/card-requests";
import { useI18n } from "@/lib/i18n";

type Review = CardRequest & { image_data: string };

export default function CardRequestQueue() {
  const { t, collectionLabel, memberLabel } = useI18n();
  const [requests, setRequests] = useState<CardRequest[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<"load" | "open" | null>(null);
  const pageSize = 20;

  const load = useCallback(async (pageNumber: number) => {
    setBusy(true);
    setError(null);
    try {
      const client = cardRequestClient();
      const { data: admin, error: adminError } = await client.from("card_request_admins").select("user_id").maybeSingle();
      if (adminError || !admin) throw new Error("request_admin_required");
      const start = pageNumber * pageSize;
      const { data, error: listError } = await client.from("card_requests")
        .select("id,card_type,collection,member,name,created_at")
        .order("created_at").order("id").range(start, start + pageSize);
      if (listError) throw listError;
      setRequests(data.slice(0, pageSize) as CardRequest[]);
      setHasMore(data.length > pageSize);
      setPage(pageNumber);
    } catch {
      setError("load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(0); }, [load]);

  const openRequest = async (request: CardRequest) => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: imageError } = await cardRequestClient().from("card_requests")
        .select("image_data").eq("id", request.id).single();
      if (imageError || !data) throw imageError;
      setReview({ ...request, image_data: data.image_data });
    } catch {
      setError("open");
    } finally {
      setBusy(false);
    }
  };

  return <div className="settings-card wide">
    <h2>{t("포카 추가 요청", "Photocard requests")}</h2>
    <p>{t("요청을 열어 정보와 사진을 확인한 뒤 로컬 도감에 등록하거나 반려하세요.", "Review the details and image, then register the card locally or reject the request.")}</p>
    <button className="secondary-button" disabled={busy} onClick={() => void load(page)}>{t("새로고침", "Refresh")}</button>
    {busy && <p role="status">{t("불러오는 중…", "Loading…")}</p>}
    {error && <p role="alert">{error === "load"
      ? t("목록을 불러오지 못했어요. Supabase 마이그레이션과 요청 관리자 권한을 확인해 주세요.", "Could not load requests. Check the Supabase migration and request administrator access.")
      : t("요청을 열지 못했어요. 목록을 새로고침해 주세요.", "Could not open the request. Refresh the list.")}</p>}
    {!error && !busy && requests.length === 0 && <p>{t("대기 중인 요청이 없어요.", "No pending requests.")}</p>}
    {requests.length > 0 && <ul className="request-queue">{requests.map((request) => <li key={request.id}>
      <span><strong>{request.name}</strong><small>{memberLabel(request.member)} · {collectionLabel(request.collection)}</small></span>
      <button className="secondary-button" disabled={busy} onClick={() => void openRequest(request)}>{t("검토", "Review")}</button>
    </li>)}</ul>}
    {(page > 0 || hasMore) && <div className="request-pagination">
      <button className="secondary-button" disabled={busy || page === 0} onClick={() => void load(page - 1)}>{t("이전", "Previous")}</button>
      <button className="secondary-button" disabled={busy || !hasMore} onClick={() => void load(page + 1)}>{t("다음", "Next")}</button>
    </div>}
    {review && <LocalCardEditor review={{ ...review, onResolved: () => {
      setReview(null);
      void load(requests.length === 1 && page > 0 ? page - 1 : page);
    } }} onClose={() => setReview(null)} />}
  </div>;
}
