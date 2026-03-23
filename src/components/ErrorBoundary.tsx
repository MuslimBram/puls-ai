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
  errorInfo: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Error:", error.message);
    console.error("[ErrorBoundary] Stack:", error.stack);
    console.error("[ErrorBoundary] Component:", info.componentStack);
    this.setState({ errorInfo: info.componentStack || null });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Gabim në faqe</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              {this.state.error?.message || "Kjo faqe hasi një gabim. Provo ta rifreskosh ose të lundrosh diku tjetër."}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={this.handleReset}>
              <RefreshCw className="h-4 w-4 mr-2" /> Rifresko
            </Button>
            <Button onClick={() => (window.location.href = "/dashboard")} variant="default">
              Shko te Paneli i Kontrollit
            </Button>
          </div>
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
      <h2 className="text-xl font-semibold text-foreground">Gabim në faqe</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Kjo faqe ka një gabim. Provo ta rifreskosh ose të lundrosh diku tjetër.
      </p>
    </div>
    <div className="flex gap-3">
      <Button variant="outline" onClick={() => {
        // Clear caches + hard reload
        if ('caches' in window) {
          caches.keys().then(names => names.forEach(n => caches.delete(n)));
        }
        window.location.reload();
      }}>
        <RefreshCw className="h-4 w-4 mr-2" /> Pastro cache & Rifresko
      </Button>
      <Button onClick={() => (window.location.href = "/dashboard")} variant="default">
        Shko te Paneli i Kontrollit
      </Button>
    </div>
  </div>
);
