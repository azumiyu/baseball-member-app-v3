import { isHomeImagePath } from "@/lib/home-images";

export type HomeNotice = { id: string; date: string; text: string; published: boolean };
export type HomeColumn = { id: string; date: string; title: string; body: string; imageUrl: string; imageAlt: string; linkUrl: string; linkLabel: string; published: boolean };
export type HomeContent = { notices: HomeNotice[]; columns: HomeColumn[] };

export const HOME_CONTENT_LIMITS = {
  notices: 30, columns: 50, id: 100, noticeText: 180, title: 100, body: 4000,
  url: 1000, imageAlt: 200, linkLabel: 80, total: 45000,
} as const;

function text(value: unknown, limit: number, required = false): string {
  if (typeof value !== "string" || value.length > limit || (required && !value.trim())) throw new Error("文字数と必須項目を確認してください。");
  return value.trim();
}

function contentDate(value: unknown): string {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new Error("日付を確認してください。");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("日付を確認してください。");
  return value;
}

function safeUrl(value: unknown, image: boolean): string {
  const url = text(value, HOME_CONTENT_LIMITS.url);
  if (!url) return "";
  if (/[\s\\\u0000-\u001f\u007f]/u.test(url) || /%(?:0[0-9a-f]|1[0-9a-f]|20|5c|7f)/i.test(url)) throw new Error("URLの形式を確認してください。");
  if (url.startsWith("/")) {
    if (image && isHomeImagePath(url)) return url;
    if (url.startsWith("//") || /%2f/i.test(url) || (image && !url.startsWith("/homepage/"))) throw new Error("画像には /homepage/ 内のパスまたは https URLを指定してください。");
    const parsed = new URL(url, "https://local.invalid");
    if (parsed.origin !== "https://local.invalid" || (image && !parsed.pathname.startsWith("/homepage/"))) throw new Error("URLの形式を確認してください。");
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && parsed.hostname && !parsed.username && !parsed.password) return url;
  } catch { /* Invalid URLs are reported with the same field message. */ }
  throw new Error("外部URLは https:// から入力してください。");
}

export function validateHomeContent(value: unknown): HomeContent {
  if (!value || typeof value !== "object") throw new Error("ホームページの入力内容を確認してください。");
  const input = value as Partial<HomeContent>;
  if (!Array.isArray(input.notices) || !Array.isArray(input.columns)
    || input.notices.length > HOME_CONTENT_LIMITS.notices || input.columns.length > HOME_CONTENT_LIMITS.columns) throw new Error("お知らせ・コラムの登録上限を超えています。");
  const id = (value: unknown) => {
    if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("保存情報を確認してください。");
    return value;
  };
  const notices = input.notices.map((notice) => {
    if (!notice || typeof notice.published !== "boolean") throw new Error("公開設定を確認してください。");
    return { id: id(notice.id), date: contentDate(notice.date), text: text(notice.text, HOME_CONTENT_LIMITS.noticeText, true), published: notice.published };
  });
  const columns = input.columns.map((column) => {
    if (!column || typeof column.published !== "boolean") throw new Error("公開設定を確認してください。");
    return { id: id(column.id), date: contentDate(column.date), title: text(column.title, HOME_CONTENT_LIMITS.title, true),
      body: text(column.body, HOME_CONTENT_LIMITS.body, true), imageUrl: safeUrl(column.imageUrl, true),
      imageAlt: text(column.imageAlt, HOME_CONTENT_LIMITS.imageAlt), linkUrl: safeUrl(column.linkUrl, false),
      linkLabel: text(column.linkLabel, HOME_CONTENT_LIMITS.linkLabel), published: column.published };
  });
  if (new Set(notices.map((item) => item.id)).size !== notices.length || new Set(columns.map((item) => item.id)).size !== columns.length) throw new Error("同じ記事が重複しています。");
  const data = { notices, columns };
  if (JSON.stringify(data).length > HOME_CONTENT_LIMITS.total) throw new Error("内容が長すぎます。古い記事の整理や本文の短縮をしてください。");
  return data;
}
