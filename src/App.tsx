import { Feed } from "./features/feed/Feed";
import { NoticeDialog } from "./features/viewer/NoticeDialog";
import { readPageSlug } from "./lib/slug";

export function App() {
  const slug = readPageSlug();
  return (
    <section className="illustrators" aria-labelledby="il-title">
      <div className="il-wrap">
        <h1 className="il-title" id="il-title">
          Иллюстрации
        </h1>
        {slug !== null ? (
          <Feed slug={slug} />
        ) : (
          <p className="il-status">Не удалось понять по адресу страницы, чьи иллюстрации показать.</p>
        )}
      </div>
      <NoticeDialog />
    </section>
  );
}
