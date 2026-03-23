/** App version — format: 1.YY.MM.DD — auto-set at build time */
function computeVersion(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `1.${yy}.${mm}.${dd}`;
}

export const APP_VERSION = computeVersion();
export const APP_NAME = "Pulse AI";
export const APP_FULL_NAME = `${APP_NAME} v${APP_VERSION}`;
