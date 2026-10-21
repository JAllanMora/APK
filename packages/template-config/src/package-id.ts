import { androidPackage } from "./schema";

/**
 * Genera el applicationId Android de una solicitud. Cada app generada necesita uno distinto:
 * si dos APKs comparten identificador, al instalar la segunda Android la trata como una
 * actualización de la primera (y falla si la firma difiere).
 *
 * DEBE producir lo mismo que el trigger public.app_requests_set_android_package en SQL:
 *   namespace || '.a' || left(replace(id::text, '-', ''), 16)
 * La "a" inicial garantiza que el segmento no empiece por dígito.
 */
export function androidPackageFor(requestId: string, namespace: string): string {
  const hex = requestId.toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`requestId no es un UUID: ${requestId}`);
  }
  return androidPackage.parse(`${namespace}.a${hex.slice(0, 16)}`);
}
