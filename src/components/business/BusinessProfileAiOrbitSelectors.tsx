import { Languages, MessageCircle, Sparkles } from "lucide-react";
import { OrbitSelector, type OrbitSelectorItem } from "@/components/OrbitSelector";

export const BUSINESS_AI_TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "persuasive", label: "Persuasive" },
] as const;

export const BUSINESS_AI_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
] as const;

const toneItems: OrbitSelectorItem[] = BUSINESS_AI_TONE_OPTIONS.map((option) => ({
  ...option,
  icon: <MessageCircle className="h-5 w-5" />,
}));

const languageItems: OrbitSelectorItem[] = BUSINESS_AI_LANGUAGE_OPTIONS.map((option) => ({
  ...option,
  icon: <Languages className="h-5 w-5" />,
}));

type Props = {
  tone: string;
  language: string;
  onToneChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
};

export function BusinessProfileAiOrbitSelectors({
  tone,
  language,
  onToneChange,
  onLanguageChange,
}: Props) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="space-y-3" aria-labelledby="business-ai-tone-heading">
        <div className="text-center">
          <h3 id="business-ai-tone-heading" className="text-sm font-semibold">AI Tone</h3>
          <p className="text-xs text-muted-foreground">Choose how Pulse AI should sound on your behalf.</p>
        </div>
        <OrbitSelector
          ariaLabel="AI tone"
          items={toneItems}
          selectedValue={tone}
          onSelect={onToneChange}
          rotationInterval={2500}
          centralContent={(item) => (
            <div className="flex flex-col items-center gap-2 px-3 text-center">
              <MessageCircle className="h-6 w-6 text-primary" />
              <span className="text-xs font-semibold sm:text-sm">{item?.label}</span>
            </div>
          )}
        />
      </section>

      <section className="space-y-3" aria-labelledby="business-ai-language-heading">
        <div className="text-center">
          <h3 id="business-ai-language-heading" className="text-sm font-semibold">AI Language</h3>
          <p className="text-xs text-muted-foreground">Choose the existing communication language stored in your business profile.</p>
        </div>
        <OrbitSelector
          ariaLabel="AI language"
          items={languageItems}
          selectedValue={language}
          onSelect={onLanguageChange}
          rotationInterval={2500}
          centralContent={(item) => (
            <div className="flex flex-col items-center gap-2 px-3 text-center">
              <div className="relative">
                <Languages className="h-7 w-7 text-primary" />
                <Sparkles className="absolute -right-2 -top-2 h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-xs font-semibold sm:text-sm">{item?.label}</span>
            </div>
          )}
        />
      </section>
    </div>
  );
}
