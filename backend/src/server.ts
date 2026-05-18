import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "./config.js";
import prismaPlugin from "./plugins/prisma.js";
import authRoutes from "./routes/auth.js";
import diagnoseRoutes from "./routes/diagnose.js";
import healthRoutes from "./routes/health.js";
import internalJobsRoutes from "./routes/internalJobs.js";
import plantsRoutes from "./routes/plants.js";
import soilEstimateRoutes from "./routes/soilEstimate.js";
import subscribeRoutes from "./routes/subscribe.js";
import tasksRoutes from "./routes/tasks.js";
import usersRoutes from "./routes/users.js";
import weatherRoutes from "./routes/weather.js";

const config = loadConfig();

const app = Fastify({
  logger: true,
  genReqId: (req) => {
    const h = req.headers["x-request-id"];
    const id = Array.isArray(h) ? h[0] : h;
    if (typeof id === "string" && id.length > 0 && id.length < 200) return id;
    return randomUUID();
  },
});

await app.register(cors, { origin: true });
await app.register(prismaPlugin);
await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(usersRoutes);
await app.register(weatherRoutes);
await app.register(diagnoseRoutes);
await app.register(soilEstimateRoutes);
await app.register(plantsRoutes);
await app.register(tasksRoutes);
await app.register(subscribeRoutes);
await app.register(internalJobsRoutes);

await app.listen({ port: config.PORT, host: "0.0.0.0" });

