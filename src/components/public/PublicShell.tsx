/**
 * PublicShell — top-level layout wrapper for all public (marketing) pages.
 *
 * Wraps children with PublicHeader and PublicFooter.
 * Does NOT include DashboardLayout, FloatingAIBot, or authenticated-only components.
 * Safe to render for unauthenticated visitors.
 */

import type { ReactNode } from "react";
import { PublicHeader } from "./PublicHeader";
import { PublicFooter } from "./PublicFooter";
import { cn } from "@/lib/utils";

interface PublicShellProps {
  children: ReactNode;
  /** Optional additional class for the <main> element */
  mainClassName?: string;
}

export function PublicShell({ children, mainClassName }: PublicShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main
        id="main-content"
        className={cn("flex-1", mainClassName)}
        tabIndex={-1}
      >
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
