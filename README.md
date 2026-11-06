# Push al celular: custom activity de Journey Builder

Activity de tipo split que manda una notificación push con texto personalizado, imagen y deep link, y sigue por una de tres ramas: `enviado`, `token_invalido` o `error`.

**El envío está simulado (`SEND_MODE=simulado`): no sale ninguna notificación.** El punto para conectar AWS End User Messaging es `SENDERS` en `src/sender.js`.

## Estructura

| Ruta | Qué hay |
|---|---|
| `src/app.js` | Endpoints: `config.json`, `execute`, `save`, `publish`, `validate`, `stop` |
| `src/config-json.js` | Definición de la activity |
| `src/jwt.js` | Validación de la firma de Journey Builder |
| `src/message.js` | Arma el mensaje con los datos de cada contacto |
| `src/sender.js` | Envío (simulado) y elección de la rama |
| `src/contact-attributes.js` | Atributos de Contact Builder del buscador. **Hay que reemplazarlos por los del cliente** |
| `public/` | Pantalla de configuración |
| `mockup/` | Mockup original, no se usa en la app |

## Probar en local

```bash
cp .env.example .env
npm install
npm run dev
```

Abrí <http://localhost:5520>. Fuera de Journey Builder, la pantalla usa datos de ejemplo.

```bash
npm test
```

## Publicar en Vercel

1. Importá el proyecto en Vercel. No hace falta configurar build.
2. Cargá las variables `SEND_MODE=simulado` y `JWT_SIGNING_SECRET`. El secreto se obtiene en el paso siguiente, así que después hay que volver a publicar.
3. Verificá que `https://tu-proyecto.vercel.app/config.json` devuelva el JSON con tu dominio.

## Configurar en SFMC

1. En Setup → Apps → Installed Packages, creá un paquete.
2. Agregá un componente **Journey Builder Activity**:
   - Nombre: `Push al celular`
   - Categoría: Messages
   - Endpoint URL: `https://tu-proyecto.vercel.app`
3. Copiá el **JWT Signing Secret** del paquete a `JWT_SIGNING_SECRET` en Vercel y volvé a publicar.
4. Reemplazá los atributos en `src/contact-attributes.js`.
5. Prepará una Data Extension de entrada con el Contact Key, el token del dispositivo y la plataforma (`Android` o `iOS`).

## Probar las ramas en un journey

El modo simulado decide por el token del contacto:

| El token empieza con | Rama |
|---|---|
| `invalid` | `token_invalido` |
| `error` | `error` |
| Otro valor | `enviado` |

Un token vacío también va a `token_invalido`.

## A validar en la primera prueba con SFMC

Estos puntos no se pudieron confirmar contra la documentación oficial ni contra una cuenta real:

- **JWT:** que `useJwt` mande el cuerpo como JWT HS256 firmado con el JWT Signing Secret.
- **Vercel:** que el cuerpo del JWT llegue intacto a Express.
- **Campos de Journey Data:** el evento `requestSchema` y el formato de su respuesta.
- **Argumentos `f0` a `f19`:** que Journey Builder resuelva los campos declarados, incluidos los de Contact Builder.
- **Campos con espacios:** el formato de la ruta en los campos de Journey Data.
- **Pantalla:** que `emptyIframe` conserve los botones propios y que **Cerrar** funcione con cambios sin guardar.
- **Límites:** `concurrentRequests` y `timeout` aceptados por la cuenta.
