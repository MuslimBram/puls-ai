import { useMemo, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PlanKey } from "@/config/plans";
import type { PricingComparisonSection } from "@/hooks/useMonetizationCatalog";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, HelpCircle, Minus, X } from "lucide-react";
import type { MonetizationPlan } from "./pricing-utils";

interface PricingComparisonProps {
  comparisonSections: PricingComparisonSection[];
  currentPlanKey: PlanKey;
  planOrder: PlanKey[];
  plansByKey: Record<PlanKey, MonetizationPlan>;
}

const renderValue = (value: string | boolean) => {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-primary" />;
  if (value === false) return <X className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  if (!value || value === "—") return <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" />;
  return <span className="text-sm text-foreground">{value}</span>;
};

export const PricingComparison = ({ comparisonSections, currentPlanKey, planOrder, plansByKey }: PricingComparisonProps) => {
  const [showDetailedRows, setShowDetailedRows] = useState(false);

  const defaultExpanded = useMemo(
    () => comparisonSections.filter((section) => section.defaultExpanded).map((section) => section.id),
    [comparisonSections],
  );

  return (
    <Card className="overflow-hidden border-border/70 bg-card/80 backdrop-blur-sm">
      <CardHeader className="gap-4 border-b border-border/60 bg-muted/20">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl">Interactive plan comparison</CardTitle>
            <CardDescription>
              Expand each section to inspect limits, entitlements, and feature access without losing mobile readability.
            </CardDescription>
          </div>

          <Button variant="outline" onClick={() => setShowDetailedRows((value) => !value)}>
            {showDetailedRows ? "Show highlighted rows only" : "Show all feature rows"}
            <ChevronDown className={cn("ml-2 h-4 w-4 transition-transform", showDetailedRows && "rotate-180")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Accordion type="multiple" defaultValue={defaultExpanded} className="w-full">
          {comparisonSections.map((section) => {
            const visibleRows = showDetailedRows
              ? section.rows
              : section.rows.filter((row) => row.isHighlight).length > 0
                ? section.rows.filter((row) => row.isHighlight)
                : section.rows.slice(0, 4);

            return (
              <AccordionItem key={section.id} value={section.id} className="border-border/60">
                <AccordionTrigger className="px-6 text-left hover:no-underline">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-foreground">{section.title}</p>
                    {section.description ? <p className="text-sm text-muted-foreground">{section.description}</p> : null}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-0 pb-0">
                  <div className="hidden overflow-x-auto md:block">
                    <div className="min-w-[860px]">
                      <div className="grid grid-cols-[minmax(240px,1.4fr)_repeat(4,minmax(120px,1fr))] border-y border-border/60 bg-muted/20 px-6 py-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        <div>Feature</div>
                        {planOrder.map((planKey) => (
                          <div key={planKey} className="text-center">
                            <span>{plansByKey[planKey]?.name ?? planKey}</span>
                            {planKey === currentPlanKey ? (
                              <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                                Current
                              </Badge>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      {visibleRows.map((row) => (
                        <div
                          key={row.id}
                          className="grid grid-cols-[minmax(240px,1.4fr)_repeat(4,minmax(120px,1fr))] items-center border-b border-border/40 px-6 py-4"
                        >
                          <div className="pr-6">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{row.featureName}</span>
                              {row.featureTooltip ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="text-muted-foreground transition-colors hover:text-foreground">
                                      <HelpCircle className="h-4 w-4" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>{row.featureTooltip}</TooltipContent>
                                </Tooltip>
                              ) : null}
                            </div>
                          </div>

                          {planOrder.map((planKey) => (
                            <div key={planKey} className={cn("text-center", planKey === currentPlanKey && "rounded-lg bg-primary/5 py-2")}>
                              {renderValue(row.values[planKey])}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 p-4 md:hidden">
                    {visibleRows.map((row) => (
                      <div key={row.id} className="rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
                        <div className="mb-3 flex items-start gap-2">
                          <div className="flex-1">
                            <p className="font-medium text-foreground">{row.featureName}</p>
                            {row.featureTooltip ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.featureTooltip}</p> : null}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {planOrder.map((planKey) => (
                            <div
                              key={planKey}
                              className={cn(
                                "rounded-xl border border-border/50 p-3 text-center",
                                planKey === currentPlanKey && "border-primary/40 bg-primary/5",
                              )}
                            >
                              <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                {plansByKey[planKey]?.name ?? planKey}
                              </p>
                              <div>{renderValue(row.values[planKey])}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
};
