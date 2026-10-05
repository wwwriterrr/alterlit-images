import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { commentsApi } from "../../api/commentsApi";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import type { ApiUser } from "../../types/api";
import { reportClosed } from "../viewer/viewerSlice";

/** Простая проверка адреса: бэк email не проверяет вовсе. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TEXT_MAX = 2000;

/**
 * Окно жалобы на комментарий — в виде окна жалобы с комментариев сайта:
 * рамка, шапка «Alterlit» с крестиком, поля и широкая синяя кнопка.
 * Гостю нужен ещё email: без него бэк жалобу не примет.
 */
export function ReportDialog({ viewer }: { viewer: ApiUser | null }) {
  const dispatch = useAppDispatch();
  const commentId = useAppSelector((state) => state.viewer.reportingId);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (commentId !== null && !dialog.open) dialog.showModal();
    if (commentId === null && dialog.open) dialog.close();
  }, [commentId]);

  return (
    <dialog
      ref={ref}
      className="il-report"
      aria-labelledby="il-report-title"
      // close от вложенных диалогов React прокидывает по дереву — реагируем только на свой.
      onClose={(event) => {
        if (event.target === event.currentTarget) dispatch(reportClosed());
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="il-report__bar">
        <span>Alterlit</span>
        <button className="il-report__close" type="button" aria-label="Закрыть" onClick={() => ref.current?.close()}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>
      {commentId !== null && <ReportForm key={commentId} commentId={commentId} guest={viewer === null} onDone={() => ref.current?.close()} />}
    </dialog>
  );
}

function ReportForm({ commentId, guest, onDone }: { commentId: number; guest: boolean; onDone: () => void }) {
  const dispatch = useAppDispatch();
  const emailId = useId();
  const textId = useId();
  const [email, setEmail] = useState("");
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const emailError = guest && !EMAIL.test(email.trim()) ? (email.trim() ? "Похоже, в адресе ошибка" : "Укажите email") : null;
  const textError = text.trim() ? null : "Опишите, что не так";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (emailError || textError || state === "sending") return;
    setState("sending");
    setError(null);
    try {
      await dispatch(
        commentsApi.endpoints.reportComment.initiate({ commentId, text: text.trim(), email: guest ? email.trim() : null }),
      ).unwrap();
      setState("sent");
    } catch (failure) {
      const details = (failure as { data?: { details?: unknown; detail?: unknown } } | undefined)?.data;
      setError(typeof details?.details === "string" ? details.details : "Жалоба не отправилась. Проверьте соединение и попробуйте ещё раз.");
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <div className="il-report__body">
        <h3 className="il-report__title" id="il-report-title">
          Жалоба отправлена
        </h3>
        <p className="il-report__text">Спасибо! Модераторы посмотрят комментарий.</p>
        <button className="il-report__submit" type="button" onClick={onDone} autoFocus>
          Закрыть
        </button>
      </div>
    );
  }

  return (
    <form className="il-report__body" onSubmit={submit} noValidate>
      <h3 className="il-report__title" id="il-report-title">
        Жалоба на комментарий
      </h3>
      {guest && (
        <div className="il-report__field">
          <label className="il-visually-hidden" htmlFor={emailId}>
            Ваш email
          </label>
          <input
            id={emailId}
            className="il-report__input"
            type="email"
            autoComplete="email"
            placeholder="Укажите email *"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={(touched && Boolean(emailError)) || undefined}
            autoFocus
          />
          {touched && emailError && <span className="il-report__error">{emailError}</span>}
        </div>
      )}
      <div className="il-report__field">
        <label className="il-visually-hidden" htmlFor={textId}>
          Что не так с комментарием
        </label>
        <textarea
          id={textId}
          className="il-report__input il-report__textarea"
          placeholder="Опишите, что вас не устраивает *"
          rows={3}
          maxLength={TEXT_MAX}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-invalid={(touched && Boolean(textError)) || undefined}
          autoFocus={!guest}
        />
        {touched && textError && <span className="il-report__error">{textError}</span>}
      </div>
      {error && (
        <p className="il-report__error" role="alert">
          {error}
        </p>
      )}
      <button className="il-report__submit" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Отправляем…" : "Отправить"}
      </button>
    </form>
  );
}
