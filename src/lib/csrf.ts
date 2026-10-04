/**
 * Django требует CSRF-токен на небезопасных методах. В проде остров живёт на
 * том же домене, поэтому куку `csrftoken` можно прочитать из document.cookie,
 * а Referer браузер подставит сам.
 *
 * В режиме разработки куки нет: сессию и токен подставляет прокси Vite,
 * см. vite.config.ts.
 */
export function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
