import jwt from "jsonwebtoken";

export class AuthError extends Error {}

// Journey Builder manda el cuerpo como un JWT firmado con el JWT Signing Secret del Installed Package.
// ALLOW_UNSIGNED solo existe para probar en local: se ignora en Vercel.
export function decodeRequest(rawBody, env = process.env) {
  const body = (rawBody ?? "").trim();
  const secret = env.JWT_SIGNING_SECRET;

  if (secret) {
    try {
      return jwt.verify(body, secret, { algorithms: ["HS256"] });
    } catch (error) {
      throw new AuthError(`JWT inválido: ${error.message}`);
    }
  }

  if (env.ALLOW_UNSIGNED === "true" && !env.VERCEL) {
    try {
      return JSON.parse(body || "{}");
    } catch {
      throw new AuthError("Sin JWT_SIGNING_SECRET solo se acepta JSON.");
    }
  }

  throw new AuthError("Falta configurar JWT_SIGNING_SECRET.");
}
