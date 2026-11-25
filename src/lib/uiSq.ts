/**
 * Fjalor shqip për tekstet e ndërfaqes që janë shkruar drejtpërdrejt në kod.
 * Përdorim: const tr = useTr(); tr("Sign In") → "Hyr" kur gjuha është shqip.
 * Teksti që nuk gjendet në fjalor mbetet siç është.
 */
import { useTranslation } from "react-i18next";

export const UI_SQ: Record<string, string> = {
  // ── Menuja anësore ──
  "Administration": "Administrimi", "Admin Panel": "Paneli i administrimit", "Lidhjet Moderation": "Moderimi i Lidhjeve",
  "Activation": "Aktivizimi", "Integration Hub": "Qendra e integrimeve", "Deep Analytics": "Analitikë e thellë",
  "SaaS Health": "Shëndeti i platformës", "System Status": "Gjendja e sistemit", "Core": "Kryesore", "Dashboard": "Paneli",
  "Inbox": "Inbox", "Leads": "Klientë të mundshëm", "Lidhjet": "Lidhjet", "Growth": "Rritja", "Campaigns": "Fushatat",
  "Content Studio": "Studio e përmbajtjes", "Business Scanner": "Skaneri i biznesit", "Analytics": "Analitika",
  "Create Content": "Krijo përmbajtje", "AI Images": "Imazhe me AI", "AI Video": "Video me AI", "Gallery": "Galeria",
  "Content Calendar": "Kalendari i përmbajtjes", "AI Posts": "Postime me AI", "Website Sources": "Burime nga faqja",
  "Product Sources": "Burime produktesh", "Social Networks": "Rrjetet sociale", "SEO Analysis": "Analiza SEO",
  "Competitors": "Konkurrentët", "Automation": "Automatizimi", "Automations": "Automatizimet", "AI Advisor": "Këshilltari AI",
  "Suggested Posts": "Postime të sugjeruara", "Suggested Offers": "Oferta të sugjeruara", "Suggested Replies": "Përgjigje të sugjeruara",
  "Suggested Campaigns": "Fushata të sugjeruara", "Sales Engine": "Motori i shitjeve", "Revenue Engine": "Motori i të ardhurave",
  "Telephony": "Telefonia", "Broadcast": "Mesazhe masive", "Helpdesk": "Helpdesk", "AI Marketplace": "Tregu AI",
  "AI Training Center": "Qendra e trajnimit AI", "Integration Wizard": "Udhëzuesi i lidhjeve", "Business": "Biznesi",
  "Businesses": "Bizneset", "Connections": "Lidhjet e kanaleve", "Channels": "Kanalet", "Connected Accounts": "Llogaritë e lidhura",
  "Billing": "Faturimi", "Wallet": "Portofoli", "Partners": "Partnerët", "Settings": "Cilësimet", "Business Profile": "Profili i biznesit",
  "Branding": "Marka", "Security": "Siguria", "LEAH Providers": "Ofruesit e LEAH", "Help": "Ndihma", "Main": "Kryesore",
  "Calendar": "Kalendari", "Website": "Faqja", "My Clients": "Klientët e mi", "My Businesses": "Bizneset e mia",
  "Integrations": "Integrimet", "Account": "Llogaria", "Partner": "Partner", "Subscription": "Abonimi", "Contacts": "Kontaktet",
  "Partner Program": "Programi i partnerëve", "Wallet & Earnings": "Portofoli & fitimet", "Search menu…": "Kërko në menu…",
  "Sign out": "Dil",

  // ── Hyrja ──
  "Security Code": "Kodi i sigurisë", "Enter your personal security code to continue": "Shkruani kodin tuaj personal të sigurisë për të vazhduar",
  "Your code": "Kodi juaj", "Two-Factor Verification": "Verifikimi me dy hapa", "Choose verification method": "Zgjidhni mënyrën e verifikimit",
  "Use the Authenticator app on your phone": "Përdorni aplikacionin Authenticator në telefon", "Email Code": "Kod me email",
  "Send a 6-digit code to your email": "Dërgo një kod 6-shifror në email", "Less secure": "Më pak i sigurt",
  "Setup Google Authenticator": "Konfiguro Google Authenticator",
  "Scan the QR code with Google Authenticator app or enter the manual code": "Skanoni kodin QR me Google Authenticator ose shkruani kodin manual",
  "Manual code:": "Kodi manual:", "Enter the 6-digit code from Authenticator": "Shkruani kodin 6-shifror nga Authenticator",
  "Security Verification": "Verifikimi i sigurisë", "We sent a 6-digit code to": "Dërguam një kod 6-shifror te",
  "Enter the 6-digit code from Google Authenticator app": "Shkruani kodin 6-shifror nga Google Authenticator",
  "Resend code": "Ridërgo kodin",
  "Email code is less secure than Google Authenticator. We recommend using Authenticator for maximum security.": "Kodi me email është më pak i sigurt se Google Authenticator. Ju rekomandojmë Authenticator për siguri maksimale.",
  "Sign In": "Hyr", "Enter your credentials to sign in": "Shkruani të dhënat tuaja për të hyrë", "Forgot password?": "Harruat fjalëkalimin?",
  "Continue with Google": "Vazhdo me Google", "Continue with Facebook": "Vazhdo me Facebook", "Continue with Apple": "Vazhdo me Apple",
  "Sign up": "Regjistrohu", "Don't have an account?": "Nuk keni llogari?", "Password": "Fjalëkalimi", "Email": "Email",
  "Wrong security code!": "Kodi i sigurisë është i gabuar!", "Error verifying code": "Gabim gjatë verifikimit të kodit",
  "Error checking Authenticator": "Gabim gjatë kontrollit të Authenticator", "Code sent to your email": "Kodi u dërgua në email-in tuaj",
  "Email was not sent. Check email configuration.": "Email-i nuk u dërgua. Kontrolloni konfigurimin e email-it.",
  "New code sent to email": "Kodi i ri u dërgua në email", "Verification successful!": "Verifikimi u krye me sukses!",
  "Verification error": "Gabim verifikimi", "Google login failed: ": "Hyrja me Google dështoi: ",
  "Could not connect to Google. Please try again.": "Nuk u lidh dot me Google. Provoni përsëri.",
  "Facebook login failed: ": "Hyrja me Facebook dështoi: ", "Could not connect to Facebook. Please try again.": "Nuk u lidh dot me Facebook. Provoni përsëri.",
  "Apple login failed: ": "Hyrja me Apple dështoi: ", "Could not connect to Apple. Please try again.": "Nuk u lidh dot me Apple. Provoni përsëri.",
  "e.g. Aabc@.123": "p.sh. Aabc@.123",

  // ── Regjistrimi ──
  "Create Account": "Krijo llogari", "What you get:": "Çfarë merrni:", "Already have an account?": "Keni llogari?", "Sign in": "Hyni",
  "Options rotate automatically. Your account type changes only when you select one.": "Opsionet ndërrohen vetë. Lloji i llogarisë ndryshon vetëm kur zgjidhni një.",
  "Choose Plan": "Zgjidh paketën", "Choose Duration": "Zgjidh kohëzgjatjen", "Type:": "Lloji:", "Plan:": "Paketa:", "Price:": "Çmimi:",
  "Full Name": "Emri i plotë", "Company Name": "Emri i kompanisë",
  "Format: 1 uppercase + 3 letters + 1 symbol (!@#$) + 1 punctuation (.,;:) + 3 digits": "Formati: 1 shkronjë e madhe + 3 shkronja + 1 simbol (!@#$) + 1 shenjë pikësimi (.,;:) + 3 shifra",
  "First Last": "Emër Mbiemër", "Your business name": "Emri i biznesit tuaj", "you@example.com": "ju@shembull.com",
  "Min 6 characters": "Të paktën 6 karaktere", "Select an account type": "Zgjidhni llojin e llogarisë",
  "Password must be at least 6 characters": "Fjalëkalimi duhet të ketë të paktën 6 karaktere",
  "Registration could not be completed. Contact support.": "Regjistrimi nuk u krye. Kontaktoni mbështetjen.",
  "Check your email to confirm your account": "Kontrolloni email-in për të konfirmuar llogarinë",
  "Registration failed. Try again.": "Regjistrimi dështoi. Provoni përsëri.", "Select an account type first": "Zgjidhni fillimisht llojin e llogarisë",
  "7-Day Trial": "Provë 7-ditore", "Monthly": "Mujore", "3 Months": "3 muaj", "6 Months": "6 muaj", "Yearly": "Vjetore",
  "Freelancer": "Frilancer", "Ambassador": "Ambasador", "White Label": "White Label",

  // ── Paneli ──
  "Loading businesses…": "Duke ngarkuar bizneset…", "No business workspaces are available yet.": "Nuk ka ende hapësira biznesi.",
  "Open Admin Panel": "Hap panelin e administrimit", "Workspace support and monitoring": "Mbështetja dhe monitorimi i hapësirave",
  "Pulse AI registrations": "Regjistrimet në Pulse AI",
  "Owner-only platform registration overview. No business private data is shown here.": "Pamje e regjistrimeve vetëm për pronarin. Këtu nuk shfaqen të dhëna private të bizneseve.",
  "Loading registrations…": "Duke ngarkuar regjistrimet…", "No registrations found.": "Nuk u gjet asnjë regjistrim.", "Personal role": "Roli personal",
  "Your platform role is separate from a business profile. You can assist authorized businesses as a worker, influencer, collaborator, or caretaker.": "Roli juaj në platformë është i ndarë nga profili i biznesit. Mund të ndihmoni bizneset e autorizuara si punonjës, influencer, bashkëpunëtor ose kujdestar.",
  "Managed Businesses": "Bizneset e menaxhuara", "Notifications & Support": "Njoftime & mbështetje", "Total Leads": "Gjithsej klientë të mundshëm",
  "This Week": "Këtë javë", "Your current usage against plan limits.": "Përdorimi juaj krahasuar me limitet e paketës.", "View Plans": "Shiko paketat",
  "Connected Channels": "Kanalet e lidhura", "Manage your communication channels": "Menaxhoni kanalet e komunikimit", "No channels connected": "Asnjë kanal i lidhur",
  "Add Channel": "Shto kanal", "Recent Leads": "Klientët e fundit", "Latest discovered leads": "Klientët e mundshëm të gjetur së fundi",
  "No leads yet": "Ende pa klientë të mundshëm", "Add keywords to start discovering leads": "Shtoni fjalë kyçe për të gjetur klientë",
  "Keywords": "Fjalë kyçe", "Ad Spend": "Shpenzimet për reklama", "Assigned Businesses": "Bizneset e caktuara",
  "Admin view: only businesses explicitly assigned to you. This is not your personal business profile.": "Pamje admini: vetëm bizneset që ju janë caktuar. Ky nuk është profili juaj personal i biznesit.",
  "Open": "Hap",
};

export const trUi = (text: string, lang?: string) => (lang?.startsWith("sq") ? UI_SQ[text] ?? text : text);

export function useTr() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return (text: string) => trUi(text, lang);
}
