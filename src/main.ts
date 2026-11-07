import "@fontsource/andika/latin-400.css";
import "@fontsource/andika/latin-700.css";
import "./styles.css";
import { Library } from "./storage/library";
import { IdbStore } from "./storage/store";
import { S } from "./strings";
import { startApp } from "./ui/app";
import { el } from "./ui/dom";

const root = document.getElementById("app")!;

async function main(): Promise<void> {
  try {
    const library = new Library(await IdbStore.open());
    await library.init();
    startApp(root, library);
  } catch {
    root.replaceChildren(el("p", { class: "fatal", text: S.storageFailed }));
  }
}

void main();
