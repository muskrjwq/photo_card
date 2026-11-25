import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export type CardRequest = {
  id: string;
  card_type: "album" | "event";
  collection: string;
  member: string;
  name: string;
  created_at: string;
};

export function cardRequestClient() {
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("auth_not_configured");
  return client;
}

export async function removeCardRequest(id: string) {
  const { data, error } = await cardRequestClient().from("card_requests")
    .delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("request_delete_failed");
}

export async function prepareRequestImage(file: File) {
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error("request_image_size");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("request_image_format");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.7, 0.52, 0.35]) {
      const encoded = canvas.toDataURL("image/webp", quality);
      if (!encoded.startsWith("data:image/webp;base64,")) break;
      if (encoded.length <= 700000) return encoded;
    }
    throw new Error("request_image_format");
  } finally {
    bitmap.close();
  }
}
