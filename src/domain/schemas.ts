import { z } from "zod";
import { normalizeProfileName } from "./profiles";
import { validateCookieDomain } from "./cookies";

const IsoDateSchema = z.string().datetime({ offset: true });

export const CookiePartitionKeySchema = z.strictObject({
  topLevelSite: z.string().url().optional(),
  hasCrossSiteAncestor: z.boolean().optional(),
});

export const CookieSnapshotSchema = z.strictObject({
  name: z.string().min(1),
  value: z.string(),
  domain: z.string().min(1),
  hostOnly: z.boolean(),
  path: z.string().startsWith("/"),
  secure: z.boolean(),
  httpOnly: z.boolean(),
  sameSite: z.enum(["no_restriction", "lax", "strict", "unspecified"]),
  session: z.boolean(),
  expirationDate: z.number().finite().positive().optional(),
  storeId: z.string(),
  partitionKey: CookiePartitionKeySchema.optional(),
}).superRefine((cookie, ctx) => {
  if (cookie.sameSite === "no_restriction" && !cookie.secure) {
    ctx.addIssue({ code: "custom", message: "SameSite=None requires Secure" });
  }
  if (!cookie.session && cookie.expirationDate === undefined) {
    ctx.addIssue({ code: "custom", message: "Persistent cookie requires expirationDate" });
  }
});

export const WebStorageSnapshotSchema = z.strictObject({
  origin: z.string().url(),
  localStorage: z.record(z.string(), z.string()),
  sessionStorage: z.record(z.string(), z.string()),
});

export const AccountProfileSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  normalizedName: z.string().min(1),
  note: z.string(),
  registrableDomain: z.string().min(1),
  cookies: z.array(CookieSnapshotSchema),
  webStorageByOrigin: z.record(z.string(), WebStorageSnapshotSchema),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
}).superRefine((profile, ctx) => {
  if (normalizeProfileName(profile.name) !== profile.normalizedName) {
    ctx.addIssue({ code: "custom", path: ["normalizedName"], message: "normalizedName mismatch" });
  }
  profile.cookies.forEach((cookie, index) => {
    if (!validateCookieDomain(cookie.domain, profile.registrableDomain)) {
      ctx.addIssue({ code: "custom", path: ["cookies", index, "domain"], message: "Cookie outside site scope" });
    }
  });
  Object.entries(profile.webStorageByOrigin).forEach(([origin, storage]) => {
    if (origin !== storage.origin) {
      ctx.addIssue({ code: "custom", path: ["webStorageByOrigin", origin], message: "Origin key mismatch" });
    }
  });
});

export const ProfileRepositorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  profiles: z.array(AccountProfileSchema),
});

export const ExportBundleSchema = z.strictObject({
  format: z.literal("switchaccounts"),
  schemaVersion: z.literal(1),
  exportedAt: IsoDateSchema,
  profiles: z.array(AccountProfileSchema),
});
