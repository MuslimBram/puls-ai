// src/pages/TermsAndPayments.tsx
// Politika e pagesave + Kushtet e shërbimit — publike

export default function TermsAndPayments() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold mb-2">Kushtet e Shërbimit dhe Politika e Pagesave</h1>
        <p className="text-muted-foreground mb-10">Pulse AI — Versioni 1.0 · Hyrë në fuqi: Janar 2026</p>

        {/* SEKSIONI 1 */}
        <section className="mb-10">
          <h2 className="text-xl font-medium mb-4">1. Struktura e Pagesave</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Kur regjistrohet te Pulse AI, biznesi bie dakort të paguajë dy lloje kostosh të ndara:
          </p>
          <div className="space-y-4">
            <div className="border border-border rounded-xl p-5">
              <div className="font-medium mb-2">A — Abonimi Pulse AI (platforma)</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pagesa mujore/vjetore për aksestë platformës Pulse AI (Starter €50/m, Growth €70/m, Pro €120/m).
                Kjo pagesë mbulon: infrastrukturën, AI (Gemini + Claude), Supabase, hosting, mbështetjen.
              </p>
            </div>
            <div className="border border-border rounded-xl p-5">
              <div className="font-medium mb-2">B — Kostot e Platformave të Treta (jo Pulse AI)</div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                Këto janë pagesa të bëra <strong>drejtpërdrejt te kompanitë e treta</strong> dhe <strong>nuk janë pjesë e Pulse AI</strong>:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1.5 list-none">
                {[
                  ["Meta Ads (Facebook/Instagram)", "Buxheti i reklamave — paguhet direkt te Meta. Pulse AI vetëm i sinkronizon statistikat."],
                  ["Google Ads", "Buxheti i reklamave — paguhet direkt te Google. Pulse AI vetëm lexon ROAS."],
                  ["WhatsApp Business API", "Template messages, numri i telefonit — paguhet te Meta/BSP."],
                  ["Twilio (SMS + Thirrje)", "Kosto per SMS dhe minuta thirrje — paguhet direkt te Twilio."],
                  ["Resend / SendGrid (Email)", "Emaile mbi limitin falas — paguhet direkt te Resend."],
                  ["Google Workspace", "Drive, Calendar, Gmail — paguhet te Google. Pulse AI vetëm sinkronizon."],
                  ["Stripe processing fee", "1.4% + €0.25 per transaksion — paguhet te Stripe, jo Pulse AI."],
                ].map(([name, desc]) => (
                  <li key={name} className="flex gap-2">
                    <span className="text-amber-500 mt-0.5">⚠</span>
                    <span><strong>{name}:</strong> {desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* SEKSIONI 2 — RIMBURSIMI */}
        <section className="mb-10">
          <h2 className="text-xl font-medium mb-4">2. Politika e Rimbursimit</h2>

          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-5 mb-4">
            <div className="font-medium text-green-800 dark:text-green-400 mb-2">✓ Çfarë rimbursohet</div>
            <ul className="text-sm text-green-700 dark:text-green-300 space-y-1.5">
              <li>• Pagesa e parë e abonimit brenda <strong>7 ditëve</strong> nëse platforma nuk funksionoi për shkak tonin</li>
              <li>• Periudha e papërdorur nëse Pulse AI ka ndërprerje teknike {'>'} 48 orë të vazhdueshme</li>
              <li>• Gabime faturimi të vërtetuara (shumëfishim i pagesës, shumë e gabuar)</li>
            </ul>
          </div>

          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-5 mb-4">
            <div className="font-medium text-red-800 dark:text-red-400 mb-2">✗ Çfarë NUK rimbursohet</div>
            <ul className="text-sm text-red-700 dark:text-red-300 space-y-1.5">
              <li>• <strong>Pagesat e bëra te platformat e treta</strong> (Meta Ads, Google Ads, Twilio, Resend, Stripe fee) — këto nuk janë nën kontrollin tonë</li>
              <li>• Abonimi mujor pas ditës së 7-të, pavarësisht shkakut</li>
              <li>• Kostot e incurred gjatë periudhës së përdorimit aktiv (AI calls, email sends, SMS)</li>
              <li>• Pagesa të bëra me <strong>aprovim të vetëdijshëm</strong> gjatë onboarding-ut</li>
              <li>• Periudha ku biznesi kishte akses aktiv por zgjodhi të mos e përdorte</li>
            </ul>
          </div>

          <div className="border border-border rounded-xl p-5">
            <div className="font-medium mb-2">Raste "morele ose ligjore"</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Nëse biznesi pretendon rimbursim për arsye ligjore ose etike, Pulse AI shqyrton çdo rast individualisht.
              Mirëpo, <strong>pagesat e bëra te platformat e treta</strong> (Meta, Google, Twilio etj.) janë jashtë
              jurisdiksionit tonë dhe duhen kërkuar drejtpërdrejt te ato kompani.
              Pagesa e abonimit Pulse AI rimbursohet vetëm nëse vërtetohet se platforma shkaktoi dëm të drejtpërdrejtë
              të verifikueshëm — jo vetëm pakënaqësi subjektive.
            </p>
          </div>
        </section>

        {/* SEKSIONI 3 — APROVIMI PARAPRAK */}
        <section className="mb-10">
          <h2 className="text-xl font-medium mb-4">3. Aprovimi i Parapranuar gjatë Onboarding-ut</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Kur biznesi klikon <strong>"Fillo Provën Falas"</strong> ose <strong>"Abonohu"</strong>, ai bie dakort me:
          </p>
          <ol className="space-y-3 text-sm text-muted-foreground">
            {[
              "Strukturën e dy-nivelit të kostove (Pulse AI + platformat e treta janë të ndara)",
              "Politikën e rimbursimit — pagesa e parë rimbursohet brenda 7 ditëve me arsye të vlefshme",
              "Se pagesat te Meta, Google, Twilio etj. janë marrëdhënie e drejtpërdrejt midis biznesit dhe atyre kompanive",
              "Se aktivizimi i funksioneve (WhatsApp API, Meta Ads sync, Google Workspace) kërkon pagesa shtesë te ato platforma — Pulse AI vetëm ofron integrimet",
              "Se të dhënat e tyre do ruhen te Supabase me enkriptim AES-GCM dhe nuk ndahen me palë të treta pa leje",
            ].map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-semibold text-primary shrink-0">{i+1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* SEKSIONI 4 — TRANSPARENCA */}
        <section className="mb-10">
          <h2 className="text-xl font-medium mb-4">4. Transparenca e Plotë e Kostove</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-medium">Kosto</th>
                  <th className="text-left py-2 pr-4 font-medium">Kujt i paguhet</th>
                  <th className="text-left py-2 font-medium">Rimbursohet?</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {[
                  ["Abonimi Starter €50/m", "Pulse AI", "✓ brenda 7 ditëve"],
                  ["Abonimi Growth €70/m", "Pulse AI", "✓ brenda 7 ditëve"],
                  ["Abonimi Pro €120/m", "Pulse AI", "✓ brenda 7 ditëve"],
                  ["Meta Ads buxheti", "Meta (Facebook)", "✗ — palë e tretë"],
                  ["Google Ads buxheti", "Google", "✗ — palë e tretë"],
                  ["WhatsApp template msgs", "Meta / BSP", "✗ — palë e tretë"],
                  ["SMS (Twilio)", "Twilio", "✗ — palë e tretë"],
                  ["Email mbi limiti", "Resend/SendGrid", "✗ — palë e tretë"],
                  ["Stripe processing fee", "Stripe", "✗ — palë e tretë"],
                ].map(([cost, to, refund]) => (
                  <tr key={cost} className="border-b border-border/50">
                    <td className="py-2 pr-4">{cost}</td>
                    <td className="py-2 pr-4">{to}</td>
                    <td className={`py-2 font-medium ${refund.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{refund}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="border border-border rounded-xl p-5 text-sm text-muted-foreground">
          <p>Për pyetje rreth pagesave: <strong>info@mso.re</strong></p>
          <p className="mt-1">Pulse AI · kohablerjeve.top · Shqipëri</p>
        </div>
      </div>
    </div>
  );
}
