import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { CommentEditor } from "./CommentEditor";

/**
 * Что уходит на бэк: HTML комментария, новые файлы и — при правке — id уже
 * прикреплённых картинок, которые остаются. Всего картинок не больше MAX_IMAGES.
 */
export interface CommentDraft {
  html: string;
  images: File[];
  keepImages: number[];
}

/** Ограничения на картинки — как на бэке (validate_comment_image). */
const MAX_IMAGES = 3;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const IMAGE_MAX_MB = 10;

/** Прикреплённая картинка: новый файл или уже сохранённая на сервере (при правке). */
type Attached =
  | { key: number; kind: "new"; file: File }
  | { key: number; kind: "saved"; id: number; url: string };

/**
 * Типы ниже продублированы намеренно: бандл редактора (editor.js) не импортирует
 * код ленты, иначе приложение запустилось бы второй раз (см. vite.config.ts).
 */
export interface ReplyInfo {
  commentId: number;
  username: string;
  name: string;
}

export interface EditInfo {
  commentId: number;
  html: string;
  images: { id: number; url: string; preview: string }[];
  /** До какого момента можно сохранить (мс); null — без ограничения. */
  deadline: number | null;
}

interface Props {
  /** Отправка/сохранение. Бросает Error с понятным текстом — форма покажет его и вернёт написанное. */
  onSubmit?: (draft: CommentDraft) => Promise<void>;
  replyTo?: ReplyInfo | null;
  onCancelReply?: () => void;
  /** Правка существующего комментария вместо нового. */
  editing?: EditInfo | null;
  onCancelEdit?: () => void;
}

export function CommentForm({ onSubmit, replyTo = null, onCancelReply, editing = null, onCancelEdit }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [images, setImages] = useState<Attached[]>([]);
  // Актуальный список для attach: вставка и выбор файлов могут прийти подряд,
  // раньше, чем React перерисует форму.
  const imagesRef = useRef<Attached[]>([]);
  imagesRef.current = images;
  const nextKey = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const secondsLeft = useSecondsLeft(editing?.deadline ?? null);
  const editExpired = editing !== null && secondsLeft === 0;

  const isEmpty = useEditorState({ editor, selector: ({ editor: e }) => e?.isEmpty ?? true });
  const canSend = Boolean(onSubmit) && !sending && !editExpired && (!isEmpty || images.length > 0);

  const updateImages = (next: Attached[]) => {
    imagesRef.current = next;
    setImages(next);
  };

  /** Прикрепить файлы: неподходящие пропускаем, сверх лимита — не берём, и говорим об этом. */
  const attach = useCallback((files: File[]) => {
    let problem: string | null = null;
    const accepted: Attached[] = [];
    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type)) {
        problem = "Можно прикрепить картинки в формате JPEG, PNG, GIF или WebP.";
        continue;
      }
      if (file.size > IMAGE_MAX_MB * 1024 * 1024) {
        problem = `Картинка «${file.name}» больше ${IMAGE_MAX_MB} МБ. Уменьшите её и попробуйте снова.`;
        continue;
      }
      accepted.push({ key: nextKey.current++, kind: "new", file });
    }
    const free = MAX_IMAGES - imagesRef.current.length;
    if (accepted.length > free) {
      problem = `К комментарию можно прикрепить не больше ${MAX_IMAGES} картинок.`;
      accepted.length = Math.max(free, 0);
    }
    if (accepted.length) updateImages([...imagesRef.current, ...accepted]);
    setError(problem);
  }, []);

  const remove = (key: number) => {
    updateImages(imagesRef.current.filter((item) => item.key !== key));
    setError(null);
  };

  const submit = async () => {
    if (!editor || !onSubmit || !canSend) return;
    // Новый комментарий сразу появляется в списке, поэтому поле очищаем тут же.
    // Если отправка не удалась — возвращаем написанное и картинки.
    const snapshot = editor.getJSON();
    const html = editor.isEmpty ? "" : editor.getHTML();
    const attached = imagesRef.current;
    const draft: CommentDraft = {
      html,
      images: attached.flatMap((item) => (item.kind === "new" ? [item.file] : [])),
      keepImages: attached.flatMap((item) => (item.kind === "saved" ? [item.id] : [])),
    };
    editor.commands.clearContent();
    updateImages([]);
    setSending(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (failure) {
      editor.commands.setContent(snapshot);
      updateImages(attached);
      setError(failure instanceof Error && failure.message ? failure.message : "Не получилось. Попробуйте ещё раз.");
    } finally {
      setSending(false);
    }
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  // Правка: подставляем текст и картинки комментария. Выход из правки — пустая форма.
  const editKey = editing?.commentId ?? null;
  const wasEditing = useRef(false);
  useEffect(() => {
    if (!editor) return;
    if (editing) {
      wasEditing.current = true;
      editor.commands.setContent(editing.html);
      // preview — размытая заглушка 60×60, для миниатюры берём оригинал (он уже в кэше браузера).
      updateImages(editing.images.map((image) => ({ key: nextKey.current++, kind: "saved", id: image.id, url: image.url })));
      setError(null);
      editor.commands.focus("end");
    } else if (wasEditing.current) {
      wasEditing.current = false;
      editor.commands.clearContent();
      updateImages([]);
      setError(null);
    }
    // Реагируем только на смену редактируемого комментария.
  }, [editor, editKey]);

  // Ответ: упоминаем того, кому отвечаем, в начале поля и ставим курсор в конец.
  const replyKey = replyTo ? `${replyTo.commentId}:${replyTo.username}` : null;
  useEffect(() => {
    if (!editor || !replyTo) return;
    const alreadyMentioned = editor.getHTML().includes(`href="/profile/${encodeURIComponent(replyTo.username)}/"`);
    const chain = editor.chain().focus();
    if (!alreadyMentioned) {
      // Позиция 1 — внутри первого абзаца, иначе упоминание встанет отдельным абзацем.
      chain.insertContentAt(1, [
        { type: "mention", attrs: { id: replyTo.username, label: replyTo.name } },
        { type: "text", text: " " },
      ]);
    }
    chain.focus("end").run();
    // Реагируем только на смену адресата.
  }, [editor, replyKey]);

  return (
    <form className="il-comment-form" onSubmit={handleSubmit}>
      {editing ? (
        <div className="il-reply-banner il-reply-banner--edit">
          <span className="il-reply-banner__text">{editExpired ? "Время на правку вышло — сохранить не получится" : "Правка комментария"}</span>
          {!editExpired && secondsLeft !== null && (
            <span
              className="il-reply-banner__timer"
              title="Время, за которое можно сохранить изменения. После этого сохранить не получится."
              aria-label={`Осталось ${formatSecondsLeft(secondsLeft)}, чтобы сохранить изменения`}
            >
              {formatSecondsLeft(secondsLeft)}
            </span>
          )}
          <button className="il-reply-banner__cancel" type="button" onClick={onCancelEdit} aria-label="Отменить правку">
            <CrossIcon />
          </button>
        </div>
      ) : (
        replyTo && (
          <div className="il-reply-banner">
            <span className="il-reply-banner__text">
              Ответ для <strong>{replyTo.name}</strong>
            </span>
            <button className="il-reply-banner__cancel" type="button" onClick={onCancelReply} aria-label="Не отвечать, написать обычный комментарий">
              <CrossIcon />
            </button>
          </div>
        )
      )}
      {/* Как форма комментариев сайта: кнопка картинок, поле, круглая кнопка отправки. */}
      <div className="il-compose">
        {images.length > 0 && (
          <ul className="il-attachments" aria-label="Прикреплённые картинки">
            {images.map((item) => (
              <li key={item.key}>
                {item.kind === "new" ? (
                  <FileAttachment file={item.file} onRemove={() => remove(item.key)} />
                ) : (
                  <AttachmentView src={item.url} alt="Прикреплённая картинка" onRemove={() => remove(item.key)} />
                )}
              </li>
            ))}
          </ul>
        )}
        <button
          className="il-compose__btn il-compose__attach"
          type="button"
          disabled={images.length >= MAX_IMAGES}
          onClick={() => fileRef.current?.click()}
          title={images.length < MAX_IMAGES ? `Прикрепить картинки — до ${MAX_IMAGES}` : `Прикреплено ${MAX_IMAGES} картинки — больше нельзя`}
          aria-label={images.length < MAX_IMAGES ? "Прикрепить картинки" : "Прикреплено максимум картинок"}
        >
          {/* Картинка — к комментарию прикрепляются только изображения. */}
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4.86 8.86-3 3.87L9 13.14 6 17h12l-3.86-5.14z"
              fill="currentColor"
            />
          </svg>
        </button>
        <div className="il-compose__area">
          <CommentEditor onSubmitShortcut={() => void submitRef.current()} onReady={setEditor} onImages={attach} />
        </div>
        <button
          className="il-compose__btn il-compose__submit"
          type="submit"
          disabled={!canSend}
          title={editing ? "Сохранить (Ctrl+Enter)" : "Отправить (Ctrl+Enter)"}
          aria-label={editing ? (sending ? "Сохраняем" : "Сохранить") : sending ? "Отправляем" : "Отправить"}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M1 21V3L23 12L1 21ZM3.31579 17.625L17.0368 12L3.31579 6.375V10.3125L10.2632 12L3.31579 13.6875V17.625Z" fill="#fff" />
          </svg>
        </button>
      </div>
      <input
        ref={fileRef}
        className="il-visually-hidden"
        type="file"
        accept={IMAGE_TYPES.join(",")}
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) attach(files);
          // Сбрасываем, чтобы повторный выбор тех же файлов снова сработал.
          event.target.value = "";
        }}
      />

      {error && (
        <p className="il-comment-form__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function FileAttachment({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  // Ссылка на файл живёт, пока он прикреплён, потом освобождаем память.
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return <AttachmentView src={url} alt={`Прикреплённая картинка ${file.name}`} onRemove={onRemove} />;
}

function AttachmentView({ src, alt, onRemove }: { src: string | null; alt: string; onRemove: () => void }) {
  return (
    <div className="il-attachment">
      {src && <img className="il-attachment__img" src={src} alt={alt} />}
      <button className="il-attachment__remove" type="button" onClick={onRemove} aria-label="Убрать картинку">
        <CrossIcon />
      </button>
    </div>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Секунды до deadline; тикает раз в секунду. Своя копия: бандл редактора не берёт код ленты. */
function useSecondsLeft(deadline: number | null): number | null {
  const compute = () => (deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  const [left, setLeft] = useState(compute);
  useEffect(() => {
    setLeft(compute());
    if (deadline === null) return;
    const timer = setInterval(() => {
      const next = compute();
      setLeft(next);
      if (next === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  return left;
}

function formatSecondsLeft(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
