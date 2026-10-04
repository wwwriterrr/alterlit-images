/**
 * Slug ленты — последний сегмент адреса страницы:
 * `/images/illustrators/` → `illustrators`.
 *
 * Только в dev его можно переопределить через `?slug=…`, чтобы смотреть
 * другие ленты; пустой `?slug=` отдаёт общую ленту — на ней видна догрузка.
 */
export function readPageSlug(location: Location = window.location): string | null {
  if (import.meta.env.DEV) {
    const override = new URLSearchParams(location.search).get("slug");
    if (override !== null) return override;
  }
  const segments = location.pathname.split("/").filter(Boolean);
  const last = segments.at(-1);
  return last ? decodeURIComponent(last) : null;
}
