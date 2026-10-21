# Arquitectura afinada

Este documento revisa el plan original (Panel Next.js → Supabase → Orquestador → EAS Build) y fija las decisiones que faltaban para que el flujo funcione de punta a punta sin intervención manual.

## Flujo completo

```
Navegador (Next.js)                Supabase                    GitHub Actions                 EAS Build (Expo)
───────────────────                ────────                    ──────────────                 ────────────────
1. Sesión anónima ───────────────► Auth (usuario anónimo)
2. Sube logo ────────────────────► Storage brand-assets/<uid>/…
3. Guarda formulario ────────────► app_requests (RLS: solo lo suyo)
4. "Crear y Compilar APK"
   POST /api/builds (servidor) ──► rpc request_build() → builds.status = queued
                               └─► POST /repos/…/dispatches {build_id} ──► 5. workflow build-apk.yml
                                   builds.status = dispatched               a. lee build + solicitud (service_role)
                                                                            b. descarga imágenes a templates/<t>/assets/brand/
                                                                            c. escribe templates/<t>/brand.json
                                                                            d. escribe credentials.json + keystore (secretos)
                                                                            e. eas build --profile apk --non-interactive --no-wait
                                                                            f. builds.status = building, eas_build_id ──► 6. compila APK
7. Escucha builds por Realtime ◄── builds (status/artifact_url) ◄── Edge Function eas-webhook ◄────── webhook BUILD terminado
   (En cola → Compilando → Listo)                                  (verifica expo-signature, copia APK
                                                                     a Storage apks/, status = completed)
```

## Huecos del plan original y cómo se resuelven

### 1. Cómo dispara la web el pipeline (Fase 4)
GitHub Actions no escucha a Supabase. La web llama a la API de GitHub `repository_dispatch` desde una **ruta de servidor de Next.js** (nunca desde el navegador, porque requiere un token). El payload lleva solo `build_id`; el workflow lee todo lo demás de Supabase. Así nadie puede inyectar datos en el workflow saltándose la validación de la base de datos.

Alternativa descartada: Database Webhook de Supabase → Edge Function → GitHub. Añade una pieza más sin ganar nada, porque la web ya tiene un servidor (Vercel).

### 2. Identificador Android único por app
Si dos APKs generadas comparten `android.package`, Android trata la segunda como actualización de la primera y la sobrescribe (o falla). Cada solicitud recibe `com.apkgen.a<16 hex del id>`, asignado por un trigger en la base de datos. El usuario no puede elegirlo ni cambiarlo. El mismo algoritmo vive en `packages/template-config/src/package-id.ts`.

### 3. Firma del APK (keystore)
Con `eas build --non-interactive`, EAS no puede crear un keystore nuevo para cada `applicationId` distinto, y cada app generada tiene uno distinto. Por eso las plantillas usan `credentialsSource: "local"`: un único keystore, guardado en secretos de GitHub, que el workflow escribe como `credentials.json` antes de compilar. Hay que generarlo una sola vez (`keytool -genkeypair …`) y **no perderlo nunca**: sin él, las apps ya instaladas no podrán actualizarse.

### 4. Un proyecto EAS por plantilla, no por app
El `slug` de Expo debe coincidir con el proyecto EAS. Por eso `slug` y `projectId` son fijos por plantilla, y lo que cambia por app es `name`, `android.package`, iconos y textos. Resultado: 5 proyectos EAS (uno por plantilla), no uno por cliente.

### 5. Contrato idéntico en las 5 plantillas
El pipeline escribe **un único archivo**, `brand.json`, más las imágenes en `assets/brand/`. Cada `app.config.ts` lo lee y lo expone en `Constants.expoConfig.extra.brand`. El esquema (zod) está en `packages/template-config` y CI valida el `brand.json` de cada plantilla. Ver `templates/README.md`.

### 6. Notificación de fin de compilación (Fase 5)
EAS envía un webhook (`eas webhook:create --event BUILD`) firmado con HMAC-SHA1 en la cabecera `expo-signature`. Lo recibe una Edge Function de Supabase que verifica la firma, busca el build por `eas_build_id` y actualiza el estado. Así no gastamos minutos de Actions esperando a que termine EAS (`--no-wait`).

### 7. Los enlaces de EAS caducan
La URL del artefacto de EAS no es permanente (depende de la retención del plan). La Edge Function copia el `.apk` al bucket público `apks` y guarda ese enlace en `artifact_url`. Si el APK es demasiado grande para la Edge Function, el plan B es que el workflow use `--wait` y suba el APK él mismo.

### 8. "Solo sus registros" requiere identidad
RLS necesita un `auth.uid()`. Sin pedir registro, la web inicia una **sesión anónima de Supabase Auth** al cargar. Cada visitante ve y edita solo sus solicitudes, builds e imágenes. Hay que activar *Anonymous sign-ins* en Supabase (Authentication → Providers) y conviene activar CAPTCHA para evitar abuso.

### 9. Quién puede cambiar el estado
El navegador solo puede crear builds a través de `request_build()`, que valida propiedad, evita dos builds simultáneos de la misma app y limita a 5 builds por usuario cada 24 h. Los cambios de estado (`building`, `completed`, `failed`) solo los hace `service_role`, desde Actions o la Edge Function.

### 10. Progreso en vivo sin polling
La tabla `builds` está en la publicación de Supabase Realtime; la pantalla de espera se suscribe a su fila. Se mantiene un polling lento como respaldo.

### 11. Imágenes
- Icono: PNG cuadrado de 1024×1024 sin transparencia en los bordes (el adaptive icon de Android recorta un círculo).
- Splash: PNG; si no se sube, se usa el icono.
- El bucket `brand-assets` acepta PNG/JPEG/WebP de hasta 5 MB. El workflow debe convertir y redimensionar a PNG (por ejemplo con `sharp`) antes de compilar.

### 12. Costes y límites
- **EAS Build gratis**: un número limitado de builds al mes en cola de baja prioridad, con esperas que pueden ser largas. Para uso real hace falta un plan de pago. Revisa los límites actuales en expo.dev/pricing.
- **GitHub Actions**: con `--no-wait` cada ejecución dura pocos minutos. En repositorio privado consume la cuota mensual gratuita.
- **Supabase gratis**: 1 GB de Storage. Un APK pesa entre 30 y 80 MB, así que conviene borrar APKs antiguos (por ejemplo, de más de 30 días).

## Secretos y dónde viven

| Secreto | Vercel | GitHub Actions | Edge Function |
|---|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | ✓ (públicos) | | |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ (solo servidor) | ✓ | ✓ (automático) |
| `GITHUB_DISPATCH_TOKEN` | ✓ | | |
| `EXPO_TOKEN` | | ✓ | |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | | ✓ | |
| `EAS_PROJECT_ID_<PLANTILLA>` | | ✓ | |
| `EAS_WEBHOOK_SECRET` | | | ✓ |

## Estado de las fases

| Fase | Estado | Dónde |
|---|---|---|
| 1. Plantillas estandarizadas | Contrato y plantilla de referencia `base` listos; faltan las 5 plantillas reales | `templates/`, `packages/template-config` |
| 2. Modelo de datos | Migraciones listas (tablas, RLS, storage, realtime) | `supabase/migrations` |
| 3. Web Next.js | Pendiente | `apps/web` |
| 4. Pipeline | Pendiente | `.github/workflows/build-apk.yml` |
| 5. Webhook y entrega | Pendiente | `supabase/functions/eas-webhook` |
