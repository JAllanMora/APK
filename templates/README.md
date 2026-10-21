# Plantillas Expo

Cada carpeta es un proyecto Expo independiente (con su propio `package-lock.json`) que EAS compila por separado. Quedan fuera del workspace de pnpm a propósito.

`base/` es la plantilla de referencia: cópiala o úsala como guía para adaptar tus 5 plantillas.

## Contrato que deben cumplir las 5

1. **`brand.json`** en la raíz, con un ejemplo válido según `brandConfigSchema` (`packages/template-config/src/schema.ts`). CI lo valida. El pipeline lo sobrescribe antes de compilar.
2. **`app.config.ts`** que tome de `brand.json`, y de nada más, todo lo personalizable:
   - `name` ← `brand.app.name`
   - `version` ← `brand.app.versionName`
   - `android.package` ← `brand.app.androidPackage`
   - `android.versionCode` ← `brand.app.versionCode`
   - `icon` y `android.adaptiveIcon.foregroundImage` ← `brand.assets.icon` (o el icono por defecto)
   - plugin `expo-splash-screen` ← `brand.assets.splash`, `brand.theme.backgroundColor`
   - `extra.brand` ← `{ content, theme }`
   - `slug` **fijo** e igual al del proyecto EAS de la plantilla; `extra.eas.projectId` desde `EAS_PROJECT_ID`.
3. **El código de la app** lee textos y colores solo desde `Constants.expoConfig.extra.brand` (ver `base/src/brand.ts`). Nada de textos de negocio escritos a mano.
4. **`eas.json`** con el perfil `apk`: `android.buildType: "apk"`, `distribution: "internal"`, `credentialsSource: "local"`.
5. **`assets/brand/`** está en `.gitignore`: ahí deja el pipeline el icono y el splash de cada cliente.

## Agregar una plantilla

1. Copia la carpeta a `templates/<id>` (id en minúsculas con guiones).
2. Cambia `TEMPLATE_SLUG` en `app.config.ts` y `name` en `package.json`.
3. Crea su proyecto EAS: `cd templates/<id> && npx eas-cli init` y guarda el projectId como secreto `EAS_PROJECT_ID_<ID>` en GitHub.
4. Añade `<id>` a la matriz `templates` de `.github/workflows/ci.yml`.
5. Inserta la fila en `public.templates` con una migración nueva (ver `supabase/migrations/20261021000100_catalogo_plantillas.sql`).

## Probar localmente

```bash
cd templates/base
npm install
npx expo config --type public   # muestra la configuración resultante del brand.json
npx expo start
```
