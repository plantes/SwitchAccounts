import type { BackgroundRequest, OperationResult } from "../domain/models";
import { fail } from "../domain/models";
import { BackgroundRequestSchema } from "../domain/schemas";
import type { BackgroundOperations } from "./operations";

type Operations = Pick<BackgroundOperations,
  | "getCurrentSite"
  | "listProfiles"
  | "listAllProfiles"
  | "createProfile"
  | "overwriteProfile"
  | "switchProfile"
  | "deleteProfile"
  | "resetSite"
  | "updateProfile"
  | "importProfiles"
  | "exportProfiles"
  | "listGrantedSites"
  | "removeGrantedSite"
>;

export function createMessageRouter(operations: Operations) {
  return {
    async handle(raw: unknown): Promise<OperationResult<unknown>> {
      const parsed = BackgroundRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return fail("IMPORT_INVALID", "后台消息格式非法。");
      }
      return dispatch(operations, parsed.data as BackgroundRequest);
    },
  };
}

function dispatch(operations: Operations, request: BackgroundRequest): Promise<OperationResult<unknown>> {
  switch (request.type) {
    case "getCurrentSite":
      return operations.getCurrentSite(request.tabId);
    case "listProfiles":
      return operations.listProfiles(request.registrableDomain);
    case "listAllProfiles":
      return operations.listAllProfiles();
    case "createProfile":
      return operations.createProfile(request.tabId, request.name);
    case "overwriteProfile":
      return operations.overwriteProfile(request.tabId, request.profileId);
    case "switchProfile":
      return operations.switchProfile(request.tabId, request.profileId);
    case "deleteProfile":
      return operations.deleteProfile(request.profileId);
    case "resetSite":
      return operations.resetSite(request.tabId);
    case "updateProfile":
      return operations.updateProfile(request.profile);
    case "importProfiles":
      return operations.importProfiles(request.bundle);
    case "exportProfiles":
      return operations.exportProfiles(request.scope);
    case "listGrantedSites":
      return operations.listGrantedSites();
    case "removeGrantedSite":
      return operations.removeGrantedSite(request.origins);
  }
}
