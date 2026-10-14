// --> Entrypoint de la app,

import "dotenv/config";
import app from "./app.js";
import { env } from "./shared/config/env.js";

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} ${env.NODE_ENV}]`);
}); // --> Abre el puerto y empieza a escuchar datos
