/**
 * FAQAccordion — accessible FAQ accordion for public marketing pages.
 *
 * Uses Radix Accordion via shadcn/ui.
 * Each item has a question + answer.
 * Supports EN/SQ via i18n keys or explicit content.
 */

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

interface FAQAccordionProps {
  items: FAQItem[];
  /** Allow multiple items open simultaneously */
  type?: "single" | "multiple";
  className?: string;
}

export function FAQAccordion({
  items,
  type = "single",
  className,
}: FAQAccordionProps) {
  if (items.length === 0) return null;

  return (
    <section aria-label="Frequently asked questions" className={cn("w-full", className)}>
      {type === "single" ? (
        <Accordion type="single" collapsible className="w-full">
          {items.map((item) => (
            <FAQItem key={item.id} item={item} />
          ))}
        </Accordion>
      ) : (
        <Accordion type="multiple" className="w-full">
          {items.map((item) => (
            <FAQItem key={item.id} item={item} />
          ))}
        </Accordion>
      )}
    </section>
  );
}

function FAQItem({ item }: { item: FAQItem }) {
  return (
    <AccordionItem value={item.id} className="border-b border-border/60">
      <AccordionTrigger className="text-left text-sm font-medium leading-relaxed hover:no-underline py-4 [&[data-state=open]>svg]:rotate-180">
        {item.question}
      </AccordionTrigger>
      <AccordionContent className="text-sm leading-relaxed text-muted-foreground pb-4">
        {item.answer}
      </AccordionContent>
    </AccordionItem>
  );
}
