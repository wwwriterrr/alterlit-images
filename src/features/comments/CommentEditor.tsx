import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import Mention from "@tiptap/extension-mention";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { profileUrl, searchUsers, type MentionUser } from "./mentions";

interface Props {
  /** Пользователь вставил или перетащил в поле картинки. */
  onImages: (files: File[]) => void;
  /** Нажата кнопка «прикрепить картинки». */
  onAttachClick: () => void;
  /** Можно ли прикрепить ещё — иначе кнопка неактивна. */
  canAttach: boolean;
  /** Подсказка к кнопке прикрепления. */
  attachLabel: string;
  onReady: (editor: Editor) => void;
  /** Ctrl/Cmd+Enter — отправить. */
  onSubmitShortcut?: () => void;
}

/**
 * Поле комментария на Tiptap. Схема намеренно узкая: абзацы, переносы строк,
 * жирный, курсив, подчёркнутый и ссылки. Всё остальное (заголовки, списки,
 * цвета из Word) при вставке отбрасывается, так что на бэк уходит чистый HTML
 * из <p>, <br>, <strong>, <em>, <u> и <a> — как у старого редактора сайта.
 */
/** Фрагмент текста, к которому применяется ссылка. */
interface Range {
  from: number;
  to: number;
}

export function CommentEditor({ onImages, onAttachClick, canAttach, attachLabel, onReady, onSubmitShortcut }: Props) {
  // Выделение запоминаем в момент открытия строки ссылки: пока фокус в поле
  // адреса, выделение в редакторе браузер теряет или сдвигает.
  const [linkRange, setLinkRange] = useState<Range | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const moreFor = (query: string) => firstPageRef.current.query === query && firstPageRef.current.more;
  const boxRef = useRef<HTMLDivElement>(null);
  // Настройки редактора создаются один раз, поэтому свежий колбэк — через ref.
  const onImagesRef = useRef(onImages);
  onImagesRef.current = onImages;
  const onSubmitRef = useRef(onSubmitShortcut);
  onSubmitRef.current = onSubmitShortcut;
  const openLink = (range: Range) => {
    // Догоняем состояние редактора до реального выделения: по нему строка
    // ссылки узнаёт текущий адрес и показывает «Убрать».
    editorRef.current?.commands.setTextSelection(range);
    setLinkRange(range);
  };
  const openLinkRef = useRef(openLink);

  // Подсказки упоминаний. Плагин Tiptap живёт вне React, поэтому он пишет
  // в состояние через колбэки, а клавиши читает из ref с актуальными данными.
  const [mention, setMention] = useState<MentionPopup | null>(null);
  const mentionRef = useRef<MentionPopup | null>(null);
  mentionRef.current = mention;
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  activeIndexRef.current = activeIndex;
  // items() в Tiptap возвращает только массив — признак «есть ещё» передаём рядом.
  const firstPageRef = useRef<{ query: string; more: boolean }>({ query: "", more: false });
  const moreAbortRef = useRef<AbortController | null>(null);

  /** Подгрузить следующую страницу результатов для текущего запроса. */
  const loadMore = () => {
    const popup = mentionRef.current;
    if (!popup || !popup.more || popup.loadingMore) return;
    const { query } = popup;
    moreAbortRef.current?.abort();
    const controller = new AbortController();
    moreAbortRef.current = controller;
    setMention((prev) => (prev && prev.query === query ? { ...prev, loadingMore: true } : prev));
    searchUsers(query.trim(), popup.items.length, controller.signal)
      .then((page) => {
        setMention((prev) => {
          if (!prev || prev.query !== query) return prev;
          const known = new Set(prev.items.map((user) => user.username));
          const fresh = page.users.filter((user) => !known.has(user.username));
          return { ...prev, items: [...prev.items, ...fresh], more: page.more && fresh.length > 0, loadingMore: false };
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // Не вышло — больше не пытаемся для этого запроса, список остаётся как есть.
        setMention((prev) => (prev && prev.query === query ? { ...prev, more: false, loadingMore: false } : prev));
      });
  };
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Bold,
      Italic,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        // Только веб-ссылки и почта: никаких javascript: и прочих схем.
        isAllowedUri: (url, { defaultValidate }) => /^(https?:\/\/|mailto:)/i.test(url) && Boolean(defaultValidate(url)),
      }),
      Placeholder.configure({ placeholder: "Ваш комментарий" }),
      UndoRedo,
      Mention.extend({
        // При правке комментария загружаем его HTML: ссылки на профили — это упоминания
        // (и нового редактора, и старого — <a class="link" data-user href="/profile/…">).
        // Без этого правила они стали бы обычными ссылками с target/rel.
        parseHTML() {
          return [
            {
              tag: 'a[href^="/profile/"]',
              priority: 100,
              getAttrs: (element) => {
                const href = (element as HTMLElement).getAttribute("href") ?? "";
                const username = decodeURIComponent(href.split("/")[2] ?? "");
                if (!username) return false;
                return { id: username, label: (element as HTMLElement).textContent?.trim() || username };
              },
            },
          ];
        },
      }).configure({
        // Backspace удаляет упоминание целиком, а не превращает обратно в «@».
        deleteTriggerWithBackspace: true,
        // В HTML упоминание — обычная ссылка на профиль, без служебных атрибутов:
        // <a href="/profile/<username>/">name</a>
        renderHTML: ({ node }) => ["a", { href: profileUrl(String(node.attrs.id)) }, String(node.attrs.label ?? node.attrs.id)],
        renderText: ({ node }) => String(node.attrs.label ?? node.attrs.id),
        suggestion: {
          char: "@",
          debounce: 200,
          items: async ({ query, signal }) => {
            if (query.trim() === "") {
              firstPageRef.current = { query, more: false };
              return [];
            }
            try {
              const page = await searchUsers(query.trim(), 0, signal);
              firstPageRef.current = { query, more: page.more };
              return page.users;
            } catch {
              firstPageRef.current = { query, more: false };
              return [];
            }
          },
          command: ({ editor: e, range, props }) => {
            const user = props as unknown as MentionUser;
            e.chain()
              .focus()
              .insertContentAt(range, [
                { type: "mention", attrs: { id: user.username, label: user.name } },
                { type: "text", text: " " },
              ])
              .run();
          },
          render: () => ({
            onBeforeStart: (props) => {
              setActiveIndex(0);
              setMention(toPopup(props, true, false));
            },
            onStart: (props) => setMention(toPopup(props, false, moreFor(props.query))),
            onBeforeUpdate: (props) =>
              setMention((prev) => ({ ...toPopup(props, true, false), items: prev?.items ?? [] })),
            onUpdate: (props) => {
              moreAbortRef.current?.abort();
              setActiveIndex(0);
              setMention(toPopup(props, false, moreFor(props.query)));
            },
            onExit: () => {
              moreAbortRef.current?.abort();
              setMention(null);
            },
            onKeyDown: ({ event }: SuggestionKeyDownProps) => {
              const popup = mentionRef.current;
              if (!popup) return false;
              if (event.key === "Escape") {
                // Закрываем только список, не диалог с картинкой.
                event.preventDefault();
                event.stopPropagation();
                setMention(null);
                return true;
              }
              if (!popup.items.length) return false;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                const last = popup.items.length - 1;
                const current = activeIndexRef.current;
                if (event.key === "ArrowDown") {
                  // На последнем пункте: если есть ещё — подгружаем и стоим на месте,
                  // иначе переходим в начало.
                  if (current === last && popup.more) loadMoreRef.current();
                  else setActiveIndex(current === last ? 0 : current + 1);
                } else {
                  setActiveIndex(current === 0 ? last : current - 1);
                }
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                const user = popup.items[activeIndexRef.current];
                if (user) popup.select(user);
                return true;
              }
              return false;
            },
          }),
        },
      }),
    ],
    editorProps: {
      attributes: { class: "il-editor__content", "aria-label": "Ваш комментарий", "aria-multiline": "true", role: "textbox" },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          onSubmitRef.current?.();
          return true;
        }
        // Ctrl/Cmd+K — ссылка, как в большинстве редакторов.
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          openLinkRef.current(currentRange(view));
          return true;
        }
        return false;
      },
      // Картинку из буфера или перетащенную в поле прикрепляем к комментарию,
      // а не вставляем в текст.
      handlePaste: (_view, event) => takeImages(event.clipboardData?.files, onImagesRef.current),
      handleDrop: (_view, event) => takeImages((event as DragEvent).dataTransfer?.files, onImagesRef.current),
    },
  });

  editorRef.current = editor;

  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      link: e?.isActive("link") ?? false,
    }),
  });

  if (!editor) return null;

  return (
    <div ref={boxRef} className="il-editor">
      {linkRange ? (
        <LinkBar editor={editor} range={linkRange} onDone={() => setLinkRange(null)} />
      ) : (
        <div className="il-editor__toolbar" role="toolbar" aria-label="Форматирование">
          <ToolButton label="Жирный (Ctrl+B)" active={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <span className="il-tool__letter il-tool__letter--bold">Ж</span>
          </ToolButton>
          <ToolButton label="Курсив (Ctrl+I)" active={state?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <span className="il-tool__letter il-tool__letter--italic">К</span>
          </ToolButton>
          <ToolButton label="Подчёркнутый (Ctrl+U)" active={state?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <span className="il-tool__letter il-tool__letter--underline">Ч</span>
          </ToolButton>
          <ToolButton
            label="Ссылка (Ctrl+K)"
            active={state?.link}
            onClick={() => openLink(currentRange(editor.view))}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
            </svg>
          </ToolButton>
          <span className="il-tool__sep" aria-hidden="true" />
          <ToolButton label={attachLabel} disabled={!canAttach} onClick={onAttachClick}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="M4 17l5-4.5 4 3.5 2.5-2 4.5 3.5" />
            </svg>
          </ToolButton>
        </div>
      )}
      <EditorContent editor={editor} />
      {mention && (
        <MentionList
          popup={mention}
          bounds={boxRef.current?.getBoundingClientRect() ?? null}
          activeIndex={activeIndex}
          onHover={setActiveIndex}
          onLoadMore={loadMore}
        />
      )}
    </div>
  );
}

interface MentionPopup {
  query: string;
  items: MentionUser[];
  loading: boolean;
  /** Есть ли ещё результаты на бэке. */
  more: boolean;
  loadingMore: boolean;
  rect: DOMRect | null;
  select: (user: MentionUser) => void;
}

function toPopup(props: SuggestionProps<MentionUser>, loading: boolean, more: boolean): MentionPopup {
  return {
    query: props.query,
    items: props.items,
    loading,
    more,
    loadingMore: false,
    rect: props.clientRect?.() ?? null,
    select: (user) => props.command(user as never),
  };
}

const POPUP_MAX_HEIGHT = 280;
const POPUP_WIDTH = 280;

/**
 * Список пользователей под курсором. position: fixed — от координат курсора;
 * если снизу не хватает места (на телефоне снизу клавиатура), список встаёт над строкой.
 */
function MentionList({
  popup,
  bounds,
  activeIndex,
  onHover,
  onLoadMore,
}: {
  popup: MentionPopup;
  /** Рамка поля ввода: список не вылезает за его края. */
  bounds: DOMRect | null;
  activeIndex: number;
  onHover: (index: number) => void;
  onLoadMore: () => void;
}) {
  const { rect, items, loading, query } = popup;
  const listRef = useRef<HTMLDivElement>(null);

  // Выбранный стрелками пункт всегда в зоне видимости.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!rect) return null;

  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const above = rect.bottom + POPUP_MAX_HEIGHT + 8 > viewportHeight && rect.top > viewportHeight - rect.bottom;
  const minLeft = bounds?.left ?? 16;
  const maxLeft = (bounds?.right ?? window.innerWidth - 16) - Math.min(POPUP_WIDTH, bounds?.width ?? POPUP_WIDTH);
  const left = Math.max(minLeft, Math.min(rect.left, maxLeft));
  const width = Math.min(POPUP_WIDTH, bounds?.width ?? POPUP_WIDTH);
  const style = above
    ? { left, width, bottom: viewportHeight - rect.top + 6 }
    : { left, width, top: rect.bottom + 6 };

  let message: string | null = null;
  if (query.trim() === "") message = "Начните вводить имя";
  else if (!items.length) message = loading ? "Ищем…" : "Никого не нашли";

  return (
    <div
      ref={listRef}
      className="il-mentions"
      style={style}
      role="listbox"
      aria-label="Упомянуть пользователя"
      onScroll={(event) => {
        // Докрутили почти до конца — подгружаем следующую страницу.
        const el = event.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) onLoadMore();
      }}
    >
      {message ? (
        <p className="il-mentions__message">{message}</p>
      ) : (
        items.map((user, index) => (
          <button
            key={user.username}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className="il-mentions__item"
            // Не забираем фокус у поля — иначе подсказки закроются раньше клика.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => popup.select(user)}
          >
            {user.avatar ? (
              <img className="il-mentions__avatar" src={user.avatar} alt="" />
            ) : (
              <span className="il-mentions__avatar il-mentions__avatar--initial" aria-hidden="true">
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="il-mentions__name">{user.name}</span>
            {user.name !== user.username && <span className="il-mentions__login">{user.username}</span>}
          </button>
        ))
      )}
      {!message && popup.loadingMore && <p className="il-mentions__message">Загружаем ещё…</p>}
    </div>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="il-tool"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      // Не забираем фокус у поля, чтобы выделение не пропадало.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Строка ввода адреса ссылки, встаёт на место тулбара. */
function LinkBar({ editor, range, onDone }: { editor: Editor; range: Range; onDone: () => void }) {
  const current = (editor.getAttributes("link").href as string | undefined) ?? "";
  const onLink = editor.isActive("link");
  const [value, setValue] = useState(current);
  const [invalid, setInvalid] = useState(false);

  const close = () => {
    onDone();
    editor.chain().focus().setTextSelection(range).run();
  };

  const apply = () => {
    const href = normalizeUrl(value);
    if (!href) {
      setInvalid(true);
      return;
    }
    const chain = editor.chain().focus().setTextSelection(range);
    if (range.from === range.to && !onLink) {
      // Нет выделения — вставляем сам адрес как текст ссылки.
      chain.insertContent({ type: "text", text: value.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.extendMarkRange("link").setLink({ href }).run();
      // Курсор — в конец ссылки, чтобы можно было сразу печатать дальше.
      editor.commands.setTextSelection(editor.state.selection.to);
    }
    onDone();
  };

  const remove = () => {
    editor.chain().focus().setTextSelection(range).extendMarkRange("link").unsetLink().run();
    onDone();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
    }
    if (event.key === "Escape") {
      // Иначе Esc закрыл бы весь диалог с картинкой.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div className="il-linkbar">
      <input
        className="il-linkbar__input"
        type="url"
        inputMode="url"
        placeholder="https://"
        aria-label="Адрес ссылки"
        aria-invalid={invalid || undefined}
        value={value}
        autoFocus
        onChange={(event) => {
          setValue(event.target.value);
          setInvalid(false);
        }}
        onKeyDown={handleKeyDown}
      />
      <button className="il-linkbar__action" type="button" onClick={apply}>
        Готово
      </button>
      {onLink && (
        <button className="il-linkbar__action il-linkbar__action--quiet" type="button" onClick={remove}>
          Убрать
        </button>
      )}
      <button className="il-tool" type="button" aria-label="Отмена" title="Отмена" onClick={close}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Текущее выделение. ProseMirror подхватывает выделение браузера с небольшой
 * задержкой, поэтому сразу после Shift+стрелок его состояние ещё старое —
 * берём выделение прямо из DOM, если оно внутри редактора.
 */
function currentRange(view: EditorView): Range {
  const selection = window.getSelection();
  if (selection?.anchorNode && selection.focusNode && view.dom.contains(selection.anchorNode)) {
    try {
      const anchor = view.posAtDOM(selection.anchorNode, selection.anchorOffset);
      const head = view.posAtDOM(selection.focusNode, selection.focusOffset);
      return { from: Math.min(anchor, head), to: Math.max(anchor, head) };
    } catch {
      // Узел вне документа редактора — ниже возьмём выделение из состояния.
    }
  }
  const { from, to } = view.state.selection;
  return { from, to };
}

/** «alterlit.ru/x» → «https://alterlit.ru/x». Пустой или не веб-адрес — null. */
function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withProtocol = /^(https?:\/\/|mailto:)/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol === "mailto:") return withProtocol;
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

function takeImages(files: FileList | undefined, onImages: (files: File[]) => void): boolean {
  const images = files ? Array.from(files).filter((item) => item.type.startsWith("image/")) : [];
  if (!images.length) return false;
  onImages(images);
  return true;
}
