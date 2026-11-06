// La pantalla guarda el texto con marcadores [[f0]] y cada campo como argumento propio.
// Así no dependemos de que Journey Builder resuelva {{...}} dentro de un texto más largo.
const PLACEHOLDER = /\[\[(f\d+)\]\]/g;

function parseFieldMap(raw) {
  try {
    const fields = JSON.parse(raw || "[]");
    return Array.isArray(fields) ? fields : [];
  } catch {
    return [];
  }
}

// Un valor sin resolver (el binding literal) también cuenta como dato faltante.
const hasValue = (value) => value !== undefined && value !== null && value !== "" && !/^\{\{.*\}\}$/.test(String(value));

export function renderTemplate(template, args) {
  const fallbacks = Object.fromEntries(parseFieldMap(args.fieldMap).map((f) => [f.id, f.fallback ?? ""]));
  return String(template ?? "").replace(PLACEHOLDER, (_, id) => (hasValue(args[id]) ? String(args[id]) : fallbacks[id] ?? ""));
}

// Forma del request de AWS End User Messaging (SendMessages) para un contacto.
export function buildAwsRequest(args) {
  const ios = String(args.platform ?? "").toLowerCase() === "ios";
  const channel = ios ? "APNS" : "GCM";
  const link = args.action === "OPEN_APP" ? "" : renderTemplate(args.url, args);

  const message = {
    Title: renderTemplate(args.title, args),
    Body: renderTemplate(args.body, args),
    Action: args.action || "OPEN_APP",
    // El deep link también va en Data para que la app lo lea siempre en el mismo lugar.
    Data: { ...(link && { deeplink: link }) }
  };
  if (link) message.Url = link;
  if (args.imageUrl) message[ios ? "MediaUrl" : "ImageUrl"] = args.imageUrl;

  return {
    MessageRequest: {
      Addresses: { [args.deviceToken]: { ChannelType: channel } },
      MessageConfiguration: { [ios ? "APNSMessage" : "GCMMessage"]: message }
    }
  };
}
