import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../lib/authGuard.js";
import { isValidIanaTimeZone } from "../lib/timezone.js";

const patchBody = z
  .object({
    timezone: z
      .string()
      .min(2)
      .max(64)
      .refine(isValidIanaTimeZone, "invalid_timezone")
      .optional(),
    latitude: z.number().gte(-90).lte(90).optional(),
    longitude: z.number().gte(-180).lte(180).optional(),
    clearLocation: z.literal(true).optional(),
  })
  .superRefine((d, ctx) => {
    const hasTz = d.timezone !== undefined;
    const hasPair =
      d.latitude !== undefined && d.longitude !== undefined;
    const clear = d.clearLocation === true;
    if (!hasTz && !hasPair && !clear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "no_fields",
        path: [],
      });
    }
    if (d.latitude !== undefined && d.longitude === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "longitude_required",
        path: ["longitude"],
      });
    }
    if (d.longitude !== undefined && d.latitude === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "latitude_required",
        path: ["latitude"],
      });
    }
  });

const usersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authenticate);

  app.get("/users/me", async (req) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.userId! },
      select: {
        id: true,
        timezone: true,
        latitude: true,
        longitude: true,
        createdAt: true,
      },
    });
    return user;
  });

  app.patch("/users/me", async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body" });
    }
    const p = parsed.data;
    const data: Prisma.UserUpdateInput = {};
    if (p.timezone !== undefined) data.timezone = p.timezone;
    if (p.clearLocation === true) {
      data.latitude = null;
      data.longitude = null;
    } else if (p.latitude !== undefined && p.longitude !== undefined) {
      data.latitude = p.latitude;
      data.longitude = p.longitude;
    }
    const user = await app.prisma.user.update({
      where: { id: req.userId! },
      data,
      select: {
        id: true,
        timezone: true,
        latitude: true,
        longitude: true,
        createdAt: true,
      },
    });
    return user;
  });
};

export default usersRoutes;
