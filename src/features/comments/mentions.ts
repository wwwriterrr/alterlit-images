/**
 * Поиск пользователей для упоминаний.
 *
 * Модуль живёт в бандле редактора (editor.js) и намеренно ничего не берёт из кода
 * ленты: импорт точки входа из отдельного бандла запустил бы приложение второй раз
 * (см. versionChunkImports в vite.config.ts). Поэтому здесь свой fetch и своя
 * ссылка на профиль.
 */

/**
 * GET ?q=<строка>&limit=<1..100, по умолчанию 20>&offset=<сдвиг>
 * → { objects: AutocompleteUser[], more: boolean }
 * Работает по сессионной куке, как и остальные ручки острова.
 */
const ENDPOINT = "/api/v1/session/autocomplete/users/";

/** Размер страницы — умолчание бэка, поэтому limit не передаём. */
export const PAGE_SIZE = 20;

export interface MentionUser {
  username: string;
  /** Отображаемое имя: ник (поле name), а если он пустой — логин. */
  name: string;
  avatar: string | null;
}

export interface MentionPage {
  users: MentionUser[];
  /** Есть ли ещё результаты — тогда следующая страница с offset = уже загруженному. */
  more: boolean;
}

export function profileUrl(username: string): string {
  return `/profile/${encodeURIComponent(username)}/`;
}

export async function searchUsers(query: string, offset: number, signal: AbortSignal): Promise<MentionPage> {
  const params = new URLSearchParams({ q: query });
  if (offset > 0) params.set("offset", String(offset));
  const response = await fetch(`${ENDPOINT}?${params}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`autocomplete ${response.status}`);
  const data = (await response.json()) as { objects?: unknown; more?: unknown };
  return { users: parseUsers(data.objects), more: data.more === true };
}

function parseUsers(list: unknown): MentionUser[] {
  if (!Array.isArray(list)) return [];
  const users: MentionUser[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const username = text(item.username);
    if (!username) continue;
    users.push({ username, name: text(item.name) ?? username, avatar: text(item.avatar) });
  }
  return users;
}

/** Обрезает и схлопывает пробелы: в базе встречаются имена вида «  я король кк  Бротан». */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean === "" ? null : clean;
}
