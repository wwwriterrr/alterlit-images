import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "./app/store";
import { App } from "./App";
import "./styles/index.css";

const container = document.getElementById("alterlit-illustrators");

if (!container) {
  // Шаблон подключил скрипт, но забыл точку монтирования — скажем об этом вслух,
  // иначе страница окажется молча пустой.
  throw new Error(
    'Не найден контейнер #alterlit-illustrators. Добавьте <div id="alterlit-illustrators"></div> в шаблон.',
  );
}

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
