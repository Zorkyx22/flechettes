type Props = Partial<{
  class: string;
  text: string;
  onclick: (e: MouseEvent) => void;
  [attr: string]: unknown;
}>;

/** Minimal element builder. Content is only ever set as text, never as markup. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value as EventListener);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) if (child !== null) node.append(child);
  return node;
}

/** Attributes that stop the browser from checking, completing or capitalising what a child types. */
export function noAssist(node: HTMLElement): void {
  node.setAttribute("spellcheck", "false");
  node.setAttribute("autocorrect", "off");
  node.setAttribute("autocapitalize", "off");
  node.setAttribute("autocomplete", "off");
  node.setAttribute("writingsuggestions", "false");
  node.setAttribute("translate", "no");
  node.setAttribute("data-gramm", "false");
  node.setAttribute("data-gramm_editor", "false");
  node.setAttribute("data-enable-grammarly", "false");
}
