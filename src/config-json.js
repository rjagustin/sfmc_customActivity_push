// Máximo de campos personalizables por mensaje. Cada uno viaja como argumento propio (f0, f1, ...).
export const MAX_FIELDS = 20;

export const OUTCOMES = {
  ENVIADO: "enviado",
  TOKEN_INVALIDO: "token_invalido",
  ERROR: "error"
};

const text = (direction = "in") => ({ dataType: "Text", direction, access: "visible", isNullable: true });

export function buildConfig(baseUrl) {
  const url = (path) => `${baseUrl}/${path}`;
  const endpoint = (path) => ({ url: url(path), useJwt: true });

  const fieldSchema = Array.from({ length: MAX_FIELDS }, (_, i) => ({ [`f${i}`]: text() }));

  return {
    workflowApiVersion: "1.1",
    metaData: { icon: "images/icon.svg", category: "message" },
    type: "RESTDECISION",
    lang: {
      "en-US": { name: "AWS Mobile Push", description: "Envía una notificación push con texto, imagen y deep link." },
      "es-ES": { name: "AWS Mobile Push", description: "Envía una notificación push con texto, imagen y deep link." }
    },
    arguments: {
      execute: {
        inArguments: [],
        outArguments: [],
        url: url("execute"),
        useJwt: true,
        timeout: 10000,
        // Sin reintentos: un reintento tras un timeout puede duplicar la notificación.
        retryCount: 0,
        retryDelay: 1000,
        concurrentRequests: 5
      }
    },
    configurationArguments: {
      save: endpoint("save"),
      publish: endpoint("publish"),
      validate: endpoint("validate"),
      stop: endpoint("stop")
    },
    userInterfaces: {
      configInspector: { size: "scm-lg", emptyIframe: true }
    },
    outcomes: [
      { arguments: { branchResult: OUTCOMES.ENVIADO }, metaData: { label: "Enviado" } },
      { arguments: { branchResult: OUTCOMES.TOKEN_INVALIDO }, metaData: { label: "Token inválido" } },
      { arguments: { branchResult: OUTCOMES.ERROR }, metaData: { label: "Error" } }
    ],
    schema: {
      arguments: {
        execute: {
          inArguments: [
            { contactKey: text() },
            { deviceToken: text() },
            { platform: text() },
            { title: text() },
            { body: text() },
            { imageUrl: text() },
            { action: text() },
            { url: text() },
            { fieldMap: text() },
            ...fieldSchema
          ],
          outArguments: []
        }
      }
    }
  };
}
