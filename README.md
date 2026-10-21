# APK

Generador de APKs Android a partir de plantillas Expo: eliges una plantilla, llenas un formulario (nombre, dirección, teléfono, título, logo) y obtienes un `.apk` instalable.

**Arquitectura y decisiones:** [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)

## Estructura

| Carpeta | Qué contiene |
|---|---|
| `packages/template-config` | Esquema compartido (zod) del formulario y de `brand.json`, generador del identificador Android |
| `templates/` | Plantillas Expo; cada una lee `brand.json` ([contrato](templates/README.md)) |
| `supabase/migrations` | Tablas, RLS, buckets de Storage y Realtime |
| `apps/web` | Panel Next.js (Fase 3, pendiente) |

## Desarrollo

```bash
pnpm install
pnpm test        # esquemas y generador de ids
pnpm typecheck
```

## Supabase

1. Crea el proyecto en supabase.com y activa **Authentication → Providers → Anonymous sign-ins**.
2. Aplica las migraciones:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
   Si el CLI pide `supabase/config.toml`, ejecuta antes `npx supabase init` (no toca las migraciones).
3. Copia `.env.example` a `.env` y completa las llaves.
