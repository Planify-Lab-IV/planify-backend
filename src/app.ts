//

import express from "express";
import helmet from "helmet";
import cors from "cors";
import { join } from "node:path";
import { env, getAvatarStorageMode } from "./shared/config/env.js";
import routes from "./routes/router.js";
import { errorHandler } from "./shared/middlewares/error.middleware.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

if (getAvatarStorageMode(env) === "local") {
  app.use(
    "/uploads",
    express.static(join(process.cwd(), "uploads"), {
      setHeaders(response) {
        response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      },
    }),
  );
}

app.use(routes);

app.use(errorHandler);

export default app;
