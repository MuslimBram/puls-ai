import { useState, useCallback } from "react";
import { toast } from "sonner";

interface Options {
  successMessage?: string;
  errorMessage?: string;
  maxRetries?: number;
  onSuccess?: () => void;
}

/**
 * Wraps any async action with success / failure / retry UX.
 * Shows toast notifications and exposes a retry() handler for the caller.
 */
export function useActionWithFeedback<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  opts: Options = {}
) {
  const { successMessage, errorMessage, maxRetries = 2, onSuccess } = opts;
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastArgs, setLastArgs] = useState<TArgs | null>(null);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      setLastArgs(args);
      setIsPending(true);
      setError(null);
      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          const result = await action(...args);
          setIsPending(false);
          if (successMessage) toast.success(successMessage);
          onSuccess?.();
          return result;
        } catch (e) {
          attempt++;
          if (attempt > maxRetries) {
            const err = e instanceof Error ? e : new Error(String(e));
            setError(err);
            setIsPending(false);
            toast.error(errorMessage || err.message || "Something went wrong", {
              description: "Tap retry below to try again.",
            });
            return undefined;
          }
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    },
    [action, maxRetries, successMessage, errorMessage, onSuccess]
  );

  const retry = useCallback(() => {
    if (lastArgs) return run(...lastArgs);
  }, [lastArgs, run]);

  return { run, retry, isPending, error, hasFailed: !!error };
}
