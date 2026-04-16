import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const NavigationButtons = () => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-1 mb-4">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => navigate(-1)}
        aria-label="Go back"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => navigate(1)}
        aria-label="Go forward"
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
