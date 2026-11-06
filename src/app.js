import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { buildConfig, OUTCOMES } from "./config-json.js";
import { CONTACT_ATTRIBUTES } from "./contact-attributes.js";
import { AuthError, decodeRequest } from "./jwt.js";
import { sendMode, sendPush } from "./sender.js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const baseUrl = (req) =>
  (process.env.PUBLIC_URL || `https://${req.headers["x-forwarded-host"] || req.headers.host}`).replace(/\/$/, "");

const mask = (token) => (token ? `${String(token).slice(0, 8)}…` : "(sin token)");

// El JWT llega como texto plano, sea cual sea el Content-Type.
const rawBody = express.text({ type: () => true, limit: "256kb" });

// Une los objetos de inArguments en uno solo.
const flatten = (inArguments) => Object.assign({}, ...(Array.isArray(inArguments) ? inArguments : []));

function authenticated(handler) {
  return async (req, res) => {
    let payload;
    try {
      payload = decodeRequest(req.body);
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      console.warn(`${req.path}: ${error.message}`);
      return res.status(401).json({ error: "No autorizado" });
    }
    return handler(req, res, payload);
  };
}

async function execute(req, res, payload) {
  const args = flatten(payload.inArguments);
  const context = { journey: payload.journeyId, activity: payload.activityId, contact: args.contactKey };

  // Un binding sin resolver llega como texto literal: es lo mismo que no tener token.
  if (!args.deviceToken || /^\{\{.*\}\}$/.test(args.deviceToken)) {
    console.log("execute", { ...context, outcome: OUTCOMES.TOKEN_INVALIDO, reason: "sin token" });
    return res.status(200).json({ branchResult: OUTCOMES.TOKEN_INVALIDO });
  }

  const started = performance.now();
  try {
    const { deliveryStatus, outcome } = await sendPush(args);
    console.log("execute", {
      ...context, token: mask(args.deviceToken), mode: sendMode(), deliveryStatus, outcome,
      ms: Math.round(performance.now() - started)
    });
    return res.status(200).json({ branchResult: outcome });
  } catch (error) {
    console.error("execute", { ...context, token: mask(args.deviceToken), error: error.message });
    return res.status(200).json({ branchResult: OUTCOMES.ERROR });
  }
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  app.get("/config.json", (req, res) => res.json(buildConfig(baseUrl(req))));
  app.get("/api/contact-attributes", (_req, res) => res.json(CONTACT_ATTRIBUTES));

  app.post("/execute", rawBody, authenticated(execute));
  for (const name of ["save", "publish", "validate", "stop"]) {
    app.post(`/${name}`, rawBody, authenticated((_req, res) => res.status(200).json({})));
  }

  app.use(express.static(publicDir));
  return app;
}
