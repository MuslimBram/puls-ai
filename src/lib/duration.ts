export const formatDurationSeconds = (seconds: number | null | undefined): string => {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "Unlimited";
  if (seconds === 0) return "0s";
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
};
