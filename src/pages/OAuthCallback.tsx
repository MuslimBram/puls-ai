import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<{ username?: string; profile_picture_url?: string } | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage(searchParams.get("error_description") || "Authorization was denied.");
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setMessage("Missing authorization code or state parameter.");
      return;
    }

    const exchangeCode = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setStatus("error");
          setMessage("You must be logged in. Please log in and try again.");
          return;
        }

        const { data, error: fnError } = await supabase.functions.invoke("instagram-oauth-callback", {
          body: {
            code,
            state,
            redirect_uri: `${window.location.origin}/oauth/callback`,
          },
        });

        if (fnError || data?.error) {
          throw new Error(data?.error || fnError?.message || "Failed to connect");
        }

        setProfile({
          username: data.username,
          profile_picture_url: data.profile_picture_url,
        });
        setStatus("success");
        setMessage(`@${data.username} connected successfully!`);
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Connection failed");
      }
    };

    exchangeCode();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8 max-w-md">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold">Connecting your account...</h2>
            <p className="text-muted-foreground">Please wait while we complete the authorization.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            {profile?.profile_picture_url && (
              <img
                src={profile.profile_picture_url}
                alt={profile.username}
                className="w-16 h-16 rounded-full mx-auto border-2 border-primary"
              />
            )}
            <h2 className="text-xl font-semibold">Instagram Connected!</h2>
            <p className="text-muted-foreground">{message}</p>
            <Button onClick={() => navigate("/channels")} className="w-full">
              Go to Channels
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Connection Failed</h2>
            <p className="text-muted-foreground">{message}</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate("/channels")} className="flex-1">
                Back to Channels
              </Button>
              <Button onClick={() => window.location.reload()} className="flex-1">
                Try Again
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;
