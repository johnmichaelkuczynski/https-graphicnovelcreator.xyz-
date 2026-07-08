import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { setupAuth } from "./auth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Wire up authentication (trust proxy, session store, passport, and the
// /api/auth/* + /api/admin/* routes). Must run before the API router so that
// req.isAuthenticated() is available to the auth-gated /api/ai/* routes.
setupAuth(app);

app.use("/api", router);

export default app;
