import { OUTCOMES } from "./config-json.js";
import { buildAwsRequest } from "./message.js";

export const sendMode = (env = process.env) => env.SEND_MODE || "simulado";

// Sin cuenta de AWS, no sale nada: la respuesta depende del token para poder probar las tres ramas.
//   token que empieza con "invalid" -> PERMANENT_FAILURE
//   token que empieza con "error"   -> TEMPORARY_FAILURE
//   cualquier otro                  -> SUCCESSFUL
async function sendSimulated(request) {
  const [token] = Object.keys(request.MessageRequest.Addresses);
  if (/^invalid/i.test(token)) return { DeliveryStatus: "PERMANENT_FAILURE" };
  if (/^error/i.test(token)) return { DeliveryStatus: "TEMPORARY_FAILURE" };
  return { DeliveryStatus: "SUCCESSFUL" };
}

// Para enviar de verdad: sumar acá la llamada a SendMessages y devolver el resultado del token.
const SENDERS = { simulado: sendSimulated };

export function outcomeFor(deliveryStatus) {
  if (deliveryStatus === "SUCCESSFUL") return OUTCOMES.ENVIADO;
  if (deliveryStatus === "PERMANENT_FAILURE") return OUTCOMES.TOKEN_INVALIDO;
  return OUTCOMES.ERROR;
}

export async function sendPush(args, env = process.env) {
  const send = SENDERS[sendMode(env)];
  if (!send) throw new Error(`SEND_MODE desconocido: ${sendMode(env)}`);
  const request = buildAwsRequest(args);
  const result = await send(request);
  return { request, deliveryStatus: result.DeliveryStatus, outcome: outcomeFor(result.DeliveryStatus) };
}
