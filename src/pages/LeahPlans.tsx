import { LEAH_PLANS } from "@/config/leahPlans";

export default function LeahPlans() {
  return (
    <section className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">LEAH Plans</h1>
        <p className="text-sm text-muted-foreground">AI assistant plans with explicit usage limits. Owner and Admin access is free.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {LEAH_PLANS.map((plan) => (
          <article key={plan.key} className="rounded-xl border p-4">
            <h2 className="font-semibold">{plan.name}</h2>
            <p className="mt-2 text-xl font-bold">{plan.monthlyPriceUsd === null ? "Contact us" : `$${plan.monthlyPriceUsd}/mo`}</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>AI credits: {plan.monthlyAiCredits ?? "Custom"}/month</li>
              <li>Messages: {plan.monthlyMessages ?? "Custom"}/month</li>
              <li>Memory: {plan.memoryDays === null ? "Custom" : `${plan.memoryDays} days`}</li>
              <li>Channels: {plan.connectedChannels === -1 ? "Unlimited" : plan.connectedChannels}</li>
              <li>Plugins: {plan.pluginConnections === -1 ? "Unlimited" : plan.pluginConnections}</li>
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
