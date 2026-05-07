import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayCircle, X } from "lucide-react";

const STORAGE_KEY = "walkthrough-dismissed-v1";
const VIDEO_URL = "https://www.youtube.com/embed/dQw4w9WgXcQ"; // replace with real product walkthrough

export const WalkthroughVideo = () => {
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setDismissed(!!localStorage.getItem(STORAGE_KEY));
  }, []);

  if (dismissed) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <PlayCircle className="h-4 w-4 text-primary" />
          2-minute walkthrough
        </CardTitle>
        <button
          onClick={() => { localStorage.setItem(STORAGE_KEY, "1"); setDismissed(true); }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Dismiss walkthrough"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent>
        {!open ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              See how to connect a channel, set up AI replies, and create your first automation in 2 minutes.
            </p>
            <Button onClick={() => setOpen(true)} size="sm">Watch now</Button>
          </div>
        ) : (
          <div className="aspect-video rounded-lg overflow-hidden bg-black">
            <iframe
              src={VIDEO_URL}
              className="w-full h-full"
              title="Pulse AI walkthrough"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
