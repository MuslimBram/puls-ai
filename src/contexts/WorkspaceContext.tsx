import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Workspace {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string;
  created_at: string;
}

interface WorkspaceContextType {
  workspace: Workspace | null;
  workspaces: Workspace[];
  loading: boolean;
  switchWorkspace: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspace: null,
  workspaces: [],
  loading: true,
  switchWorkspace: () => {},
});

export const useWorkspace = () => useContext(WorkspaceContext);

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      setActiveId(null);
      setLoading(false);
      return;
    }

    const load = async () => {
      const { data } = await supabase
        .from("workspaces")
        .select("*")
        .order("created_at", { ascending: true });

      const list = (data ?? []) as Workspace[];
      setWorkspaces(list);

      // Restore last active or pick first
      const saved = localStorage.getItem(`ws_active_${user.id}`);
      const match = list.find((w) => w.id === saved);
      setActiveId(match?.id ?? list[0]?.id ?? null);
      setLoading(false);
    };

    load();
  }, [user]);

  const switchWorkspace = (id: string) => {
    setActiveId(id);
    if (user) localStorage.setItem(`ws_active_${user.id}`, id);
  };

  const workspace = workspaces.find((w) => w.id === activeId) ?? null;

  return (
    <WorkspaceContext.Provider value={{ workspace, workspaces, loading, switchWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
};
