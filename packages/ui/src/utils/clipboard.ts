import { uiText } from "../i18n";
import { notify } from "./notification";
export async function copyToClipboard(
  text: string,
  successMessage = uiText("sf56a510e30"),
): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      notify.success(successMessage);
      return true;
    }
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    if (successful) {
      notify.success(successMessage);
      return true;
    }
    throw new Error(uiText("sc2dd6b03d4"));
  } catch (err) {
    notify.error(uiText("sdb7c1f09b9"));
    return false;
  }
}
