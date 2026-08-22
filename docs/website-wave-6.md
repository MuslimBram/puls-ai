# Website Wave 6 — SEO / AEO / Structured Discovery

This branch centralizes public SEO truth for the localized Pulse AI website.

Key rules:

- Fully localized EN/SQ public routes are indexable with self-canonicals and `en` / `sq` / `x-default` hreflang.
- SQ White Label and legal routes without approved Albanian body copy stay accessible but are `noindex,follow`, canonicalize to EN, omit SQ hreflang, and are excluded from the sitemap.
- Private/auth/admin/app routes are excluded from discovery.
- `robots.txt`, `sitemap.xml`, and `llms.txt` are generated at build time from `VITE_PUBLIC_SITE_URL`.
- Structured data is factual only; runtime SEO strips offers, aggregate ratings, and reviews unless a future verified implementation deliberately changes that policy.
- No DNS, OAuth, Supabase production configuration, or production-domain switch is part of Wave 6.
