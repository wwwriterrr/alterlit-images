import { createHash } from "node:crypto";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Страница Django, на которой живёт остров. В dev открываем приложение по тому же пути. */
const PAGE_PATH = "/images/illustrators/";

/** В проде `/` принадлежит Django, а в dev просто ведёт на страницу острова. */
const devLanding: Plugin = {
  name: "dev-landing",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split(/[?#]/)[0] === "/") {
        res.statusCode = 302;
        res.setHeader("Location", PAGE_PATH);
        res.end();
        return;
      }
      next();
    });
  },
};

/**
 * Сброс кэша для бандлов с постоянными именами.
 *
 * Шаблон подключает только images_list.js?v=<версия>, а vendor.js и editor.js
 * подгружает сам JS обычными относительными импортами — без версии браузер
 * после деплоя взял бы их из кэша. Поэтому ко всем импортам между бандлами
 * дописываем ?v=<хэш всей сборки>: имена файлов не меняются, а адрес — меняется,
 * как только меняется хоть один бандл.
 *
 * Важно, чтобы точку входа никто не импортировал: шаблон грузит её со своим
 * ?v=, и импорт без того же ?v= запустил бы приложение второй раз.
 */
const versionChunkImports: Plugin = {
  name: "version-chunk-imports",
  apply: "build",
  enforce: "post",
  generateBundle(_options, bundle) {
    const chunks = Object.values(bundle).filter((item) => item.type === "chunk");
    const entry = chunks.find((chunk) => chunk.isEntry);
    if (!entry) return;

    for (const chunk of chunks) {
      if (chunk.imports.includes(entry.fileName) || chunk.dynamicImports.includes(entry.fileName)) {
        this.error(`${chunk.fileName} импортирует точку входа ${entry.fileName} — вынесите общий код в отдельный бандл.`);
      }
    }

    const hash = createHash("sha256");
    for (const chunk of [...chunks].sort((a, b) => a.fileName.localeCompare(b.fileName))) {
      hash.update(chunk.fileName).update(chunk.code);
    }
    const version = hash.digest("hex").slice(0, 10);

    const others = chunks.filter((chunk) => chunk !== entry).map((chunk) => chunk.fileName);
    for (const chunk of chunks) {
      for (const fileName of others) {
        const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        chunk.code = chunk.code.replace(new RegExp(`(["'\`])\\./${escaped}\\1`, "g"), `$1./${fileName}?v=${version}$1`);
      }
    }
  },
};

/** Tiptap, ProseMirror и их зависимости — всё, что нужно только редактору комментариев. */
const EDITOR_MODULES = /node_modules\/(@tiptap|@floating-ui|prosemirror-|orderedmap|rope-sequence|w3c-keyname|linkifyjs)|src\/features\/comments\//;

/**
 * Сборка рассчитана на встраивание в Django-шаблон:
 * фиксированные имена файлов без хэшей, кэш сбрасывается через ?v= в шаблоне.
 */
export default defineConfig(({ mode, command }) => {
  // Пустой префикс — читаем и переменные без VITE_, они остаются только в node.
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.API_TARGET || "https://alterlit.ru";
  const sessionId = env.DEV_SESSION_ID;
  const csrfToken = env.DEV_CSRF_TOKEN;

  return {
    plugins: [react(), devLanding, versionChunkImports],
    // В проде статика лежит под STATIC_BASE, в dev — от корня.
    base: command === "build" ? env.STATIC_BASE || "/assets/images_list/" : "/",
    build: {
      outDir: "dist",
      // Весь CSS — одним файлом images_list.css, его и подключает шаблон.
      cssCodeSplit: false,
      // Отдельные бандлы подгружаются обычным import(), без <link rel=modulepreload>.
      modulePreload: false,
      assetsInlineLimit: 4096,
      rolldownOptions: {
        // Точка входа — сразу main.tsx: index.html нужен только dev-серверу
        // и в dist не попадает.
        input: "src/main.tsx",
        // Рекомендация Rolldown при includeDependenciesRecursively: false — без неё
        // возможны бандлы с неверным порядком выполнения модулей.
        preserveEntrySignatures: false,
        output: {
          strictExecutionOrder: true,
          format: "es",
          // Имена постоянные, без хэшей: кэш сбрасывает ?v=, см. versionChunkImports.
          entryFileNames: "images_list.js",
          chunkFileNames: "[name].js",
          assetFileNames: (info) => {
            const name = info.names?.[0] ?? "";
            return name.endsWith(".css") ? "images_list.css" : "assets/[name][extname]";
          },
          codeSplitting: {
            // По умолчанию группа забирает к себе и все зависимости своих модулей —
            // так React уехал бы в editor.js вслед за @tiptap/react.
            includeDependenciesRecursively: false,
            groups: [
              // Редактор комментариев грузится, только когда вошедший пользователь
              // открывает картинку.
              { name: "editor", test: EDITOR_MODULES, priority: 2 },
              // Остальные библиотеки — отдельно от кода ленты. Заодно точка входа
              // не экспортирует общий код, и её никто не импортирует.
              { name: "vendor", test: /node_modules/, priority: 1 },
            ],
          },
        },
      },
    },
    server: {
      // Слушаем на всех интерфейсах, чтобы dev-сервер был виден с других машин.
      host: true,
      port: 5181,
      strictPort: true,
      // Открывают по IP или внутреннему доменному имени — не режем по Host.
      allowedHosts: true,
      proxy: {
        "/api": {
          target: backend,
          changeOrigin: true,
          secure: true,
          cookieDomainRewrite: "",
          configure: (proxy) => {
            const cookies: string[] = [];
            if (sessionId) cookies.push(`alterlitsessionid=${sessionId}`);
            if (csrfToken) cookies.push(`csrftoken=${csrfToken}`);
            if (!cookies.length) return;

            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("Cookie", cookies.join("; "));
              // Django на HTTPS сверяет Referer/Origin с доменом, а из dev они
              // пришли бы с localhost. Токен тоже подставляем сами: куки csrftoken
              // у localhost нет, и клиент не сможет её прочитать.
              proxyReq.setHeader("Referer", `${backend}${PAGE_PATH}`);
              proxyReq.setHeader("Origin", backend);
              if (csrfToken) proxyReq.setHeader("X-CSRFToken", csrfToken);
            });
          },
        },
        "/media": { target: backend, changeOrigin: true, secure: true },
        // Шрифт Ethna и текстура для dev-оболочки в index.html. Свои файлы
        // в dev Vite отдаёт из /src, так что /assets целиком принадлежит сайту.
        "/assets": { target: backend, changeOrigin: true, secure: true },
        // Сокет комментариев. Сервер (Django Channels) без Origin отвечает 403,
        // поэтому подставляем Origin сайта и, если есть, сессию.
        "/ws": {
          target: backend,
          changeOrigin: true,
          secure: true,
          ws: true,
          configure: (proxy) => {
            proxy.on("proxyReqWs", (proxyReq) => {
              proxyReq.setHeader("Origin", backend);
              const cookies: string[] = [];
              if (sessionId) cookies.push(`alterlitsessionid=${sessionId}`);
              if (csrfToken) cookies.push(`csrftoken=${csrfToken}`);
              if (cookies.length) proxyReq.setHeader("Cookie", cookies.join("; "));
            });
          },
        },
        // Ссылки на профили авторов: в проде это страница того же сайта.
        "/profile": { target: backend, changeOrigin: true, secure: true },
      },
    },
  };
});
