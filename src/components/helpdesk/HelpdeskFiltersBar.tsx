import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { THREAD_STATUSES, PRIORITY_LEVELS, type HelpdeskFilters } from "@/hooks/useHelpdesk";
import { Search, Plus } from "lucide-react";

interface HelpdeskFiltersBarProps {
  filters: HelpdeskFilters;
  onFilterChange: (fn: (f: HelpdeskFilters) => HelpdeskFilters) => void;
  onClear: () => void;
  onNew: () => void;
}

export const HelpdeskFiltersBar = ({ filters, onFilterChange, onClear, onNew }: HelpdeskFiltersBarProps) => (
  <Card>
    <CardContent className="flex flex-wrap items-center gap-3 pt-4 pb-4">
      <Search className="h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Search conversations..."
        className="w-48"
        value={filters.search ?? ""}
        onChange={(e) => onFilterChange((f) => ({ ...f, search: e.target.value || undefined }))}
      />
      <Select
        value={filters.status ?? "all"}
        onValueChange={(v) => onFilterChange((f) => ({ ...f, status: v === "all" ? undefined : v }))}
      >
        <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          {THREAD_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.priority ?? "all"}
        onValueChange={(v) => onFilterChange((f) => ({ ...f, priority: v === "all" ? undefined : v }))}
      >
        <SelectTrigger className="w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priority</SelectItem>
          {PRIORITY_LEVELS.map((p) => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
      <Button size="sm" className="ml-auto" onClick={onNew}>
        <Plus className="h-4 w-4 mr-1" /> New
      </Button>
    </CardContent>
  </Card>
);
