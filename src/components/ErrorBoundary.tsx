import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error.message, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Something went wrong</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
          </div>
          <Button variant="outline" onClick={this.handleReset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const PageErrorFallback = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
    <AlertTriangle className="h-12 w-12 text-destructive" />
    <div>
      <h2 className="text-xl font-semibold text-foreground">Page Error</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This page encountered an error. Try refreshing or navigating elsewhere.
      </p>
    </div>
    <div className="flex gap-3">
      <Button variant="outline" onClick={() => window.location.reload()}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh Page
      </Button>
      <Button onClick={() => (window.location.href = "/dashboard")}>
        Go to Dashboard
      </Button>
    </div>
  </div>
);
