export type GuideLocale = "en" | "sq";

export interface ChannelGuideCopy {
  summary: string;
  requirements: string[];
  steps: string[];
  errors: Array<{ error: string; fix: string }>;
  security: string;
}

export interface ChannelGuide {
  id: string;
  name: string;
  status: "live" | "configuration_required" | "provider_dependent";
  docsUrl?: string;
  copy: Record<GuideLocale, ChannelGuideCopy>;
}

export const getGuideLocale = (language?: string): GuideLocale =>
  language?.toLowerCase().startsWith("sq") ? "sq" : "en";

export const CHANNEL_GUIDES: ChannelGuide[] = [
  {
    id: "whatsapp", name: "WhatsApp Business", status: "live",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
    copy: {
      en: {
        summary: "Direct Meta WhatsApp Cloud API connection. Twilio is not used for this channel.",
        requirements: ["Registered WhatsApp Business number", "Phone Number ID and WABA ID", "Permanent System User access token", "A private webhook verify token"],
        steps: ["In Meta register and verify the business phone number.", "Subscribe the app to the WABA and the messages webhook.", "In Pulse AI enter the IDs, permanent token and the same verify token.", "Verify, Save & Activate, then test inbound and outbound messages."],
        errors: [
          { error: "Invalid access token", fix: "Generate a System User token with whatsapp_business_management and whatsapp_business_messaging; confirm the app and WABA assets are assigned." },
          { error: "Webhook verification failed", fix: "Use the exact same verify token in Meta and Pulse AI, and confirm the whatsapp-webhook URL." },
          { error: "Connected but no inbound messages", fix: "Subscribe the messages field and subscribe the app to the correct WABA." },
          { error: "Cannot send a business-initiated message", fix: "Add payment and use an approved message template outside the 24-hour customer-service window." },
        ],
        security: "Never paste a permanent token into chat, screenshots or support tickets. Rotate any exposed token.",
      },
      sq: {
        summary: "Lidhje direkte me Meta WhatsApp Cloud API. Twilio nuk përdoret për këtë kanal.",
        requirements: ["Numër WhatsApp Business i regjistruar", "Phone Number ID dhe WABA ID", "Permanent System User access token", "Një webhook verify token privat"],
        steps: ["Në Meta regjistro dhe verifiko numrin e biznesit.", "Abono aplikacionin te WABA dhe fushën messages të webhook-ut.", "Në Pulse AI vendos ID-të, token-in permanent dhe të njëjtin verify token.", "Bëj Verify, Save & Activate, pastaj testo mesazh hyrës dhe dalës."],
        errors: [
          { error: "Invalid access token", fix: "Gjenero System User token me whatsapp_business_management dhe whatsapp_business_messaging; kontrollo që App dhe WABA i janë caktuar user-it." },
          { error: "Webhook verification failed", fix: "Përdor saktësisht të njëjtin verify token në Meta dhe Pulse AI dhe kontrollo URL-në whatsapp-webhook." },
          { error: "Connected por mesazhet nuk hyjnë", fix: "Abono fushën messages dhe aplikacionin te WABA e saktë." },
          { error: "Nuk dërgon mesazh të nisur nga biznesi", fix: "Shto pagesën dhe përdor template të aprovuar jashtë dritares 24-orëshe." },
        ],
        security: "Mos e vendos kurrë token-in permanent në chat, screenshot ose ticket. Rrotullo çdo token të ekspozuar.",
      },
    },
  },
  {
    id: "telegram", name: "Telegram", status: "live", docsUrl: "https://core.telegram.org/bots/tutorial",
    copy: {
      en: {
        summary: "Connect a Telegram bot created and controlled through @BotFather.",
        requirements: ["A Telegram account", "A bot created in @BotFather", "A fresh bot token"],
        steps: ["Open @BotFather and create or select the bot.", "Copy the complete token without spaces.", "Enter a channel name and token in Pulse AI.", "Verify and Save & Activate; send /start to prove inbound delivery."],
        errors: [
          { error: "Invalid bot token", fix: "Regenerate the token in @BotFather and paste the full value once, without quotes or spaces." },
          { error: "Failed to send a request to the Edge Function", fix: "Retry once; if verification passed but activation failed, reconnect with the fresh token." },
          { error: "Connected but no messages", fix: "Open the bot chat and send /start; for groups, add the bot and configure privacy permissions as needed." },
        ],
        security: "A bot token controls the bot. Revoke it immediately in @BotFather if exposed.",
      },
      sq: {
        summary: "Lidh një bot Telegram të krijuar dhe kontrolluar përmes @BotFather.",
        requirements: ["Llogari Telegram", "Bot i krijuar te @BotFather", "Bot token i ri"],
        steps: ["Hap @BotFather dhe krijo ose zgjidh botin.", "Kopjo token-in e plotë pa hapësira.", "Vendos emrin e kanalit dhe token-in në Pulse AI.", "Bëj Verify dhe Save & Activate; dërgo /start për provën inbound."],
        errors: [
          { error: "Invalid bot token", fix: "Rigjenero token-in te @BotFather dhe vendose të plotë, pa thonjëza ose hapësira." },
          { error: "Failed to send a request to the Edge Function", fix: "Riprovo një herë; nëse Verify kaloi por aktivizimi dështoi, rilidhe me token-in e ri." },
          { error: "Connected por nuk vijnë mesazhe", fix: "Hap bisedën me botin dhe dërgo /start; për grupe shto botin dhe rregullo privacy permissions." },
        ],
        security: "Bot token kontrollon botin. Revokoje menjëherë te @BotFather nëse ekspozohet.",
      },
    },
  },
  {
    id: "email", name: "Email", status: "configuration_required", docsUrl: "https://resend.com/docs/dashboard/domains/introduction",
    copy: {
      en: { summary: "Connect a business inbox for lead capture and replies.", requirements: ["Verified sending domain", "Email address", "Provider forwarding webhook or IMAP app password"], steps: ["Verify DKIM, SPF and DMARC DNS records.", "Enter the inbox and provider settings.", "Configure forwarding/webhook or IMAP.", "Send and receive a real test email."], errors: [{ error: "Authentication failed", fix: "Use an app-specific password and confirm IMAP is enabled." }, { error: "Email not delivered", fix: "Verify DKIM/SPF status, sender domain and suppression logs." }], security: "Use an app password, never the primary mailbox password." },
      sq: { summary: "Lidh inbox-in e biznesit për lead-e dhe përgjigje.", requirements: ["Domain dërgues i verifikuar", "Adresë email", "Webhook forwarding ose IMAP app password"], steps: ["Verifiko DNS DKIM, SPF dhe DMARC.", "Vendos inbox-in dhe parametrat e provider-it.", "Konfiguro forwarding/webhook ose IMAP.", "Dërgo dhe merr një email real prove."], errors: [{ error: "Authentication failed", fix: "Përdor app-specific password dhe sigurohu që IMAP është aktiv." }, { error: "Email nuk mbërrin", fix: "Kontrollo DKIM/SPF, domain-in dërgues dhe suppression logs." }], security: "Përdor app password, kurrë fjalëkalimin kryesor të email-it." },
    },
  },
  {
    id: "facebook", name: "Facebook / Instagram", status: "configuration_required", docsUrl: "https://developers.facebook.com/docs/messenger-platform/get-started",
    copy: {
      en: { summary: "Connect a Facebook Page and linked Instagram professional account.", requirements: ["Meta App", "Facebook Page", "Page access token", "Required permissions and webhook subscription"], steps: ["Link Instagram Professional to the Facebook Page if needed.", "Assign Page/App assets and generate the correct token.", "Enter IDs and the shared verify token.", "Verify webhooks, test messages, then complete App Review before public use."], errors: [{ error: "OAuth or permission error", fix: "Confirm the logged-in Meta user has full access to the Page and App." }, { error: "No messages", fix: "Subscribe Page messaging fields and ensure the app is published for non-test users." }], security: "Request only the permissions the feature uses and rotate exposed tokens." },
      sq: { summary: "Lidh Facebook Page dhe Instagram Professional të lidhur me të.", requirements: ["Meta App", "Facebook Page", "Page access token", "Permissions dhe webhook subscription"], steps: ["Lidh Instagram Professional me Facebook Page nëse duhet.", "Cakto asetet Page/App dhe gjenero token-in e saktë.", "Vendos ID-të dhe verify token-in e përbashkët.", "Verifiko webhook-et, testo mesazhet dhe përfundo App Review para përdorimit publik."], errors: [{ error: "OAuth ose permission error", fix: "Kontrollo që Meta user ka full access te Page dhe App." }, { error: "Nuk vijnë mesazhe", fix: "Abono Page messaging fields dhe publiko app-in për përdorues jashtë testit." }], security: "Kërko vetëm lejet që përdor funksioni dhe rrotullo token-at e ekspozuar." },
    },
  },
  {
    id: "sms", name: "SMS (Twilio/Vonage)", status: "provider_dependent", docsUrl: "https://www.twilio.com/docs/messaging",
    copy: {
      en: { summary: "Connect an SMS-capable provider number. Twilio here is for SMS, not WhatsApp.", requirements: ["Provider account", "Account SID/API key and auth token", "SMS-capable number"], steps: ["Buy or select an SMS-capable number.", "Enter provider credentials and E.164 phone number.", "Set sms-webhook as the inbound/status callback.", "Verify with a real inbound and outbound SMS."], errors: [{ error: "Invalid credentials", fix: "Match Account SID and Auth Token from the same active account." }, { error: "Message undelivered", fix: "Check number capability, destination country permissions, balance and delivery callback." }], security: "Store provider credentials only in the encrypted connection form." },
      sq: { summary: "Lidh një numër SMS nga provider-i. Twilio këtu është për SMS, jo WhatsApp.", requirements: ["Llogari provider", "Account SID/API key dhe auth token", "Numër me SMS"], steps: ["Bli ose zgjidh një numër me SMS.", "Vendos kredencialet dhe numrin në format E.164.", "Vendos sms-webhook si inbound/status callback.", "Verifiko me SMS real hyrës dhe dalës."], errors: [{ error: "Invalid credentials", fix: "Përputh Account SID dhe Auth Token nga e njëjta llogari aktive." }, { error: "Message undelivered", fix: "Kontrollo aftësinë e numrit, lejet e shtetit marrës, balancën dhe callback-un." }], security: "Ruaji kredencialet vetëm në formularin e enkriptuar të lidhjes." },
    },
  },
  {
    id: "voip", name: "VoIP Calls", status: "provider_dependent", docsUrl: "https://www.twilio.com/docs/voice",
    copy: {
      en: { summary: "Connect a voice provider for real phone calls.", requirements: ["Voice provider account", "Voice-capable number", "Account credentials", "TwiML App SID for browser calling"], steps: ["Select a voice-capable number.", "Create the voice/TwiML application.", "Enter credentials and caller ID.", "Test outbound, inbound and status callbacks."], errors: [{ error: "Call failed", fix: "Check caller ID ownership, geographic permissions, balance and TwiML callback." }], security: "Keep call recordings and credentials access-controlled." },
      sq: { summary: "Lidh provider zëri për telefonata reale.", requirements: ["Llogari provider zëri", "Numër me Voice", "Kredenciale", "TwiML App SID për browser calling"], steps: ["Zgjidh numër me Voice.", "Krijo aplikacionin voice/TwiML.", "Vendos kredencialet dhe caller ID.", "Testo outbound, inbound dhe status callbacks."], errors: [{ error: "Call failed", fix: "Kontrollo pronësinë e caller ID, lejet gjeografike, balancën dhe TwiML callback." }], security: "Mbro kredencialet dhe aksesin te regjistrimet e telefonatave." },
    },
  },
  {
    id: "tiktok", name: "TikTok Business", status: "provider_dependent", docsUrl: "https://developers.tiktok.com/",
    copy: {
      en: { summary: "Connect a TikTok Business developer app where messaging access is available.", requirements: ["TikTok developer app", "Approved product/scopes", "Long-lived token"], steps: ["Create/select the developer app.", "Request the scopes needed by your account and region.", "Enter App ID, secret and token.", "Verify with a supported test action."], errors: [{ error: "Access denied", fix: "Confirm product availability, review status, scopes and account region." }], security: "Never place the app secret in public client code." },
      sq: { summary: "Lidh TikTok Business developer app aty ku messaging access ofrohet.", requirements: ["TikTok developer app", "Produkt/scopes të aprovuara", "Long-lived token"], steps: ["Krijo ose zgjidh developer app.", "Kërko scopes sipas llogarisë dhe rajonit.", "Vendos App ID, secret dhe token.", "Verifiko me veprim prove të suportuar."], errors: [{ error: "Access denied", fix: "Kontrollo disponueshmërinë, review status, scopes dhe rajonin." }], security: "Mos e vendos app secret në kod publik të frontend-it." },
    },
  },
  {
    id: "google_sheets", name: "Google Sheets", status: "configuration_required", docsUrl: "https://developers.google.com/workspace/guides/create-credentials",
    copy: {
      en: { summary: "Write Pulse AI records to a spreadsheet through a service account.", requirements: ["Google Cloud project", "Sheets API enabled", "Service account JSON", "Spreadsheet shared with service account"], steps: ["Enable Sheets API and create a service account.", "Create a JSON key.", "Share the sheet with the service-account email.", "Paste JSON and Spreadsheet ID, then test a row."], errors: [{ error: "Permission denied", fix: "Share the spreadsheet with the exact service-account email as Editor." }], security: "Treat the JSON key as a secret; rotate it if downloaded to an unsafe device." },
      sq: { summary: "Shkruan të dhënat e Pulse AI në Sheet përmes service account.", requirements: ["Google Cloud project", "Sheets API aktiv", "Service account JSON", "Sheet i ndarë me service account"], steps: ["Aktivizo Sheets API dhe krijo service account.", "Krijo JSON key.", "Ndaje Sheet-in me email-in e service account.", "Vendos JSON dhe Spreadsheet ID, pastaj testo një rresht."], errors: [{ error: "Permission denied", fix: "Ndaje Sheet-in me email-in e saktë të service account si Editor." }], security: "JSON key është sekret; rrotulloje nëse është shkarkuar në pajisje të pasigurt." },
    },
  },
  {
    id: "messagebird", name: "MessageBird SMS", status: "provider_dependent", docsUrl: "https://developers.messagebird.com/",
    copy: {
      en: { summary: "Connect a MessageBird virtual number for SMS.", requirements: ["MessageBird account", "Live API key", "Virtual number"], steps: ["Create a live API key.", "Enter the key and E.164 number.", "Set the displayed sms-webhook URL.", "Test inbound and outbound SMS."], errors: [{ error: "Unauthorized", fix: "Use a live key from the correct workspace and confirm balance." }], security: "Do not use a test key for production traffic." },
      sq: { summary: "Lidh numër virtual MessageBird për SMS.", requirements: ["Llogari MessageBird", "Live API key", "Numër virtual"], steps: ["Krijo live API key.", "Vendos key dhe numrin E.164.", "Vendos URL-në sms-webhook.", "Testo SMS hyrës dhe dalës."], errors: [{ error: "Unauthorized", fix: "Përdor live key nga workspace i saktë dhe kontrollo balancën." }], security: "Mos përdor test key për trafik production." },
    },
  },
  {
    id: "viber", name: "Viber", status: "provider_dependent", docsUrl: "https://developers.viber.com/docs/api/rest-bot-api/",
    copy: {
      en: { summary: "Connect a Viber bot where commercial bot access is approved.", requirements: ["Approved Viber bot", "Bot auth token"], steps: ["Create or select the approved bot.", "Copy its auth token.", "Enter token and bot name.", "Configure webhook and test a message."], errors: [{ error: "Invalid auth token", fix: "Copy the active bot token again and confirm the bot is approved." }], security: "Rotate the bot token if exposed." },
      sq: { summary: "Lidh Viber bot aty ku commercial bot access është aprovuar.", requirements: ["Viber bot i aprovuar", "Bot auth token"], steps: ["Krijo ose zgjidh botin e aprovuar.", "Kopjo auth token.", "Vendos token dhe emrin e botit.", "Konfiguro webhook dhe testo mesazh."], errors: [{ error: "Invalid auth token", fix: "Kopjo përsëri token-in aktiv dhe kontrollo aprovimin e botit." }], security: "Rrotullo bot token nëse ekspozohet." },
    },
  },
];

export const getChannelGuide = (id: string) => CHANNEL_GUIDES.find((guide) => guide.id === id);
