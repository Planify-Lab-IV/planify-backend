// Definicion del servidor antes de correrlo

import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./shared/config/env.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json()); // --> Middlewares

app.get("/health", (_req, res) => res.json({ status: "ok" }));

export default app;
