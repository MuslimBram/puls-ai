import { ReactNode } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/** Wraps a component in an error boundary with a compact inline fallback */
export const SafeRender = ({ children, label }: { children: ReactNode; label?: string }) => (
  <ErrorBoundary
    fallback={
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
        <p className="text-sm text-destructive font-medium">
          Failed to load {label || "this section"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Please refresh or try again later.
        </p>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);
