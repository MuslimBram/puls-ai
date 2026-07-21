# Google Search Console — Setup Instructions

## Hapi 1: Shto property-n

1. Shko te https://search.google.com/search-console
2. Kliko **Add property**
3. Zgjidh **URL prefix** dhe shto: `https://kohablerjeve.top`
4. Kliko **Continue**

## Hapi 2: Verifiko pronësinë

### Metoda A — HTML Meta Tag (rekomandohet, tashmë e gati)

1. Google do të të japë një kod si: `google-site-verification=xxxxxxxxxxxxxxxx`
2. Hap skedarin `index.html` (te rrënja e projektit)
3. Gjej rreshtin:
   ```html
   <meta name="google-site-verification" content="REPLACE_WITH_YOUR_GSC_VERIFICATION_CODE" />
   ```
4. Zëvendëso `REPLACE_WITH_YOUR_GSC_VERIFICATION_CODE` me kodin real nga Google
5. Deploy aplikacionin (push te Vercel / Lovable)
6. Kthehu te GSC dhe kliko **Verify**

### Metoda B — HTML File (alternativë)

1. Google do të të japë një skedar si: `googleXXXXXXXXXXXXXXXX.html`
2. Vendose atë skedar te `public/` (dmth. `public/googleXXXXXXXXXXXXXXXX.html`)
3. Deploy dhe verifikoje nga GSC

## Hapi 3: Dërgo Sitemap

1. Pas verifikimit, shko te **Sitemaps** (menu e majtë)
2. Shto: `https://kohablerjeve.top/sitemap.xml`
3. Kliko **Submit**
4. Bëj të njëjtën për `https://alfis.re/sitemap.xml` nëse ke shtuar atë property gjithashtu

## Hapi 4: Kërko Indexim

1. Shko te **URL Inspection**
2. Fut: `https://kohablerjeve.top/`
3. Kliko **Request Indexing**
4. Përsërit për: `/pricing`, `/register`, `/install`

## Çfarë pret?

- Verifikimi: **menjëherë** pasi bën deploy me kodin korrekt
- Prima indexim i faqeve kryesore: **3-7 ditë**
- Shfaqje në rezultate kërkimi: **1-4 javë**
- Rich results (FAQ schema): **2-6 javë** pas indeximit

## Domains shtesë

Nëse dëshiron të shtosh edhe `alfis.re`:
1. Shto property të re te GSC: `https://alfis.re`
2. Verifiko me të njëjtën metodë
3. Dërgo sitemap: `https://alfis.re/sitemap.xml`
