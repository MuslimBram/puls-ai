/** App version — format: 1.MM.DD — auto-set from current date */
function computeVersion(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `1.${mm}.${dd}`;
}

export const APP_VERSION = computeVersion();
export const APP_NAME = "Pulse AI";
export const APP_FULL_NAME = `${APP_NAME} v${APP_VERSION}`;
