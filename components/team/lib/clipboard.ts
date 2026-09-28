/** クリック直後に呼ぶ。モーダル内でのフォールバックでもフォーカスを外へ移さない。 */
export async function copyText(text: string, container: HTMLElement): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 非HTTPS・ブラウザ設定などで使えなければ従来のコピーを試す。
    }
  }
  if (!container.isConnected) return false;
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const scrollBody = container.closest<HTMLElement>(".team-dialog-body");
  const scrollTop = scrollBody?.scrollTop ?? 0;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;";
  container.appendChild(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    focused?.focus({ preventScroll: true });
    if (scrollBody) scrollBody.scrollTop = scrollTop;
  }
}
