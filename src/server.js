import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 5520;
createApp().listen(port, () => console.log(`Custom activity en http://localhost:${port}`));
