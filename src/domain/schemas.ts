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
  schemaVersion: z.literal(2),
  profiles: z.array(AccountProfileSchema),
});

export const ExportBundleSchema = z.strictObject({
  format: z.literal("switchaccounts"),
  schemaVersion: z.literal(2),
  exportedAt: IsoDateSchema,
  profiles: z.array(AccountProfileSchema),
});

export const ExportScopeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("all") }),
  z.strictObject({ type: z.literal("site"), registrableDomain: z.string().min(1) }),
  z.strictObject({ type: z.literal("profile"), profileId: z.string().uuid() }),
]);

export const BackgroundRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("getCurrentSite"), tabId: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("listProfiles"), registrableDomain: z.string().min(1) }),
  z.strictObject({ type: z.literal("createProfile"), tabId: z.number().int().nonnegative(), name: z.string().min(1) }),
  z.strictObject({ type: z.literal("overwriteProfile"), tabId: z.number().int().nonnegative(), profileId: z.string().uuid() }),
  z.strictObject({ type: z.literal("switchProfile"), tabId: z.number().int().nonnegative(), profileId: z.string().uuid() }),
  z.strictObject({ type: z.literal("deleteProfile"), profileId: z.string().uuid() }),
  z.strictObject({ type: z.literal("resetSite"), tabId: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal("updateProfile"), profile: AccountProfileSchema }),
  z.strictObject({ type: z.literal("importProfiles"), bundle: ExportBundleSchema }),
  z.strictObject({ type: z.literal("exportProfiles"), scope: ExportScopeSchema }),
  z.strictObject({ type: z.literal("listAllProfiles") }),
  z.strictObject({ type: z.literal("listGrantedSites") }),
  z.strictObject({ type: z.literal("removeGrantedSite"), origins: z.array(z.string()).min(1) }),
]);
