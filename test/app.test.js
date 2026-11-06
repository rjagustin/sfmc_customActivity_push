import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { buildAwsRequest, renderTemplate } from "../src/message.js";

const SECRET = "secreto-de-prueba";
let server, base;

before(async () => {
  process.env.JWT_SIGNING_SECRET = SECRET;
  await new Promise((resolve) => { server = createApp().listen(0, resolve); });
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const args = (over = {}) => ({
  contactKey: "C-1", deviceToken: "abc123", platform: "Android",
  title: "[[f0]], hola", body: "Tenés [[f1]] puntos", imageUrl: "", action: "OPEN_APP", url: "",
  fieldMap: JSON.stringify([{ id: "f0", path: "x.Nombre", fallback: "Cliente" }, { id: "f1", path: "x.Puntos", fallback: "" }]),
  f0: "Lucía", f1: "100", ...over
});
const signed = (payload, secret = SECRET, options = {}) => jwt.sign(payload, secret, options);
const post = (path, body) => fetch(`${base}/${path}`, { method: "POST", headers: { "Content-Type": "application/jwt" }, body });
const execute = async (over) => (await post("execute", signed({ inArguments: [args(over)] }))).json();

test("config.json usa el host y declara las tres ramas", async () => {
  const res = await fetch(`${base}/config.json`, { headers: { "x-forwarded-host": "demo.vercel.app" } });
  const config = await res.json();
  assert.equal(config.type, "RESTDECISION");
  assert.equal(config.arguments.execute.url, "https://demo.vercel.app/execute");
  assert.equal(config.arguments.execute.useJwt, true);
  assert.deepEqual(config.outcomes.map((o) => o.arguments.branchResult), ["enviado", "token_invalido", "error"]);
});

test("rechaza firma incorrecta, body sin firmar y algoritmo none", async () => {
  assert.equal((await post("execute", signed({ inArguments: [args()] }, "otro"))).status, 401);
  assert.equal((await post("execute", JSON.stringify({ inArguments: [args()] }))).status, 401);
  const none = jwt.sign({ inArguments: [args()] }, "", { algorithm: "none" });
  assert.equal((await post("execute", none)).status, 401);
  assert.equal((await post("publish", "x")).status, 401);
});

test("no acepta sin firmar en Vercel aunque ALLOW_UNSIGNED esté activo", async () => {
  const { decodeRequest, AuthError } = await import("../src/jwt.js");
  assert.throws(() => decodeRequest("{}", { ALLOW_UNSIGNED: "true", VERCEL: "1" }), AuthError);
  assert.deepEqual(decodeRequest("{}", { ALLOW_UNSIGNED: "true" }), {});
});

test("execute elige la rama según el resultado", async () => {
  assert.deepEqual(await execute(), { branchResult: "enviado" });
  assert.deepEqual(await execute({ deviceToken: "invalid-1" }), { branchResult: "token_invalido" });
  assert.deepEqual(await execute({ deviceToken: "error-1" }), { branchResult: "error" });
});

test("sin token o con binding sin resolver va a token_invalido", async () => {
  assert.deepEqual(await execute({ deviceToken: "" }), { branchResult: "token_invalido" });
  assert.deepEqual(await execute({ deviceToken: "{{Event.X.Token}}" }), { branchResult: "token_invalido" });
});

test("los endpoints de ciclo de vida responden 200 con JWT válido", async () => {
  for (const name of ["save", "publish", "validate", "stop"]) {
    assert.equal((await post(name, signed({}))).status, 200);
  }
});

test("reemplaza marcadores y usa el texto alternativo", () => {
  assert.equal(renderTemplate("[[f0]], hola", args()), "Lucía, hola");
  assert.equal(renderTemplate("[[f0]], hola", args({ f0: "" })), "Cliente, hola");
  assert.equal(renderTemplate("[[f0]], hola", args({ f0: "{{Event.X.Nombre}}" })), "Cliente, hola");
  assert.equal(renderTemplate("sin [[f9]] dato", args()), "sin  dato");
});

test("arma el mensaje de Android con imagen y deep link", () => {
  const { MessageRequest: m } = buildAwsRequest(args({
    imageUrl: "https://x.com/a.jpg", action: "DEEP_LINK", url: "miapp://p/[[f1]]"
  }));
  const g = m.MessageConfiguration.GCMMessage;
  assert.equal(m.Addresses.abc123.ChannelType, "GCM");
  assert.equal(g.Title, "Lucía, hola");
  assert.equal(g.ImageUrl, "https://x.com/a.jpg");
  assert.equal(g.Url, "miapp://p/100");
  assert.equal(g.Data.deeplink, "miapp://p/100");
});

test("arma el mensaje de iOS con MediaUrl y sin enlace para OPEN_APP", () => {
  const { MessageRequest: m } = buildAwsRequest(args({ platform: "iOS", imageUrl: "https://x.com/a.jpg", url: "miapp://no" }));
  const a = m.MessageConfiguration.APNSMessage;
  assert.equal(m.Addresses.abc123.ChannelType, "APNS");
  assert.equal(a.MediaUrl, "https://x.com/a.jpg");
  assert.equal(a.Url, undefined);
});
