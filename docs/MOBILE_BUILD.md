# Pulse AI — Mobile App (Android & iOS)

## Teknologjia: Capacitor + React (Vite)

Pulse AI web app mund të bëhet app native Android & iOS me Capacitor.
PWA është tashmë aktive — Capacitor shton aksesin e plotë në features native.

---

## Hapat e Build-it

### 1. Instalo dependencies

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
npm install @capacitor/splash-screen @capacitor/status-bar @capacitor/push-notifications
npx cap init
```

### 2. Build Web App

```bash
npm run build
```

### 3. Shto Platformën

```bash
# Android
npx cap add android

# iOS (kërkon Mac + Xcode)
npx cap add ios
```

### 4. Sync kodin

```bash
npx cap sync
```

### 5. Build Android APK

```bash
npx cap open android
# Brenda Android Studio: Build → Generate Signed APK
```

### 6. Build iOS IPA (kërkon Mac + Apple Developer Account)

```bash
npx cap open ios
# Brenda Xcode: Product → Archive → Distribute App
```

---

## Base44 — Download APK/IPA Direkt

Base44 mund ta eksportojë si APK/IPA pa Android Studio/Xcode:
1. Hap: https://app.base44.com/apps/6a6067e3e24abcf74e681ffd
2. Shko te: Settings → Export
3. Zgjedh: Android APK ose iOS IPA
4. Shkarko dhe instalo

---

## PWA (Tashmë Aktive)

Pulse AI ka PWA të konfiguruar. Instalimi:

**Android:**
- Hap Chrome → kohablerjeve.top
- Menu (⋮) → "Add to Home Screen"
- Instalohet si app native

**iOS:**
- Hap Safari → kohablerjeve.top  
- Share button → "Add to Home Screen"
- Instalohet si app native

---

## Push Notifications

Konfiguro te Supabase Secrets:
- `FCM_SERVER_KEY` — nga Firebase Console (Android)
- `APNS_KEY` — nga Apple Developer (iOS)

---

## App Store Publishing

- **Google Play Store**: Kërkon Google Developer Account ($25 one-time)
- **Apple App Store**: Kërkon Apple Developer Account ($99/year)
- **Alternative**: Distributo APK direkt (pa Play Store)
