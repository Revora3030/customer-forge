/**
 * Revora's own business workspace. The platform owner does not pay their own
 * platform the setup fee, so this single workspace is treated as set up.
 * It is fixed by id (not a column an owner could edit), and it never counts
 * as a paying customer in analytics — it only unlocks publishing.
 */
export const PLATFORM_OWNER_ORG_ID = "e0c08aa2-a95f-4049-8ce0-ffbb869dae10";

export const isPlatformOwnerOrg = (id: string | null | undefined): boolean =>
  id === PLATFORM_OWNER_ORG_ID;
