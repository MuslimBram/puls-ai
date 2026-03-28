

# Rregullimi i OAuth Login (Google/Apple) në alfis.re

## Problemi
OAuth login me Google dhe Apple përdor `@lovable.dev/cloud-auth-js` i cili kalon përmes proxy-s së Lovable. Kur aplikacioni hapet nga `alfis.re` (Vercel), redirect URI (`window.location.origin = https://alfis.re`) nuk pranohet nga proxy-ja e Lovable sepse nuk është domen `*.lovable.app`.

## Zgjidhja

### Hapi 1: Shto alfis.re si redirect URL i lejuar
Përdor `cloud--configure_auth` për të shtuar këto URL në listën e redirect-eve të lejuara:
- `https://alfis.re`
- `https://alfis.re/login`
- `https://alfis.re/dashboard`
- `https://alfis.re/reset-password`
- `https://www.alfis.re`

### Hapi 2: Përditëso Login.tsx — error handling
Shto error handling më të qartë në butonat OAuth për të shfaqur mesazhe specifike:
```typescript
onClick={async () => {
  try {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error("Login me Google dështoi: " + String(error));
  } catch (err) {
    toast.error("Nuk u arrit të lidhet me Google. Provoni përsëri.");
  }
}}
```

### Hapi 3: Trajto PASSWORD_RECOVERY në AuthContext (nga plani i mëparshëm)
Shto listener për `PASSWORD_RECOVERY` event në `AuthContext.tsx` për të ridrejtuar automatikisht tek `/reset-password`.

### Hapi 4: Përditëso ResetPassword.tsx
Kontrollo sesionin aktiv si alternativë ndaj hash-it `type=recovery`.

## Skedarët që preken
| Skedar | Ndryshim |
|--------|----------|
| Auth config | Shto alfis.re redirect URLs |
| `src/pages/Login.tsx` | Përmirëso error handling në OAuth buttons |
| `src/contexts/AuthContext.tsx` | Trajto PASSWORD_RECOVERY event |
| `src/pages/ResetPassword.tsx` | Kontrollo sesion aktiv |

