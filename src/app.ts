//

import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./shared/config/env.js";
import routes from "./routes/router.js";
import { errorHandler } from "./shared/middlewares/error.middleware.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.use(routes);

app.use(errorHandler);

export default app;
