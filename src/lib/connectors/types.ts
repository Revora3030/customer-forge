export type ConnectorStatus = "not_connected" | "connected" | "degraded";

export type ConnectorCategory =
  | "automation"
  | "analytics"
  | "seo"
  | "website"
  | "calendar"
  | "crm"
  | "messaging"
  | "payments"
  | "creative"
  | "infrastructure";

/**
 * Revora owns these contracts. Providers are replaceable implementations.
 * No connector is allowed to become a source of truth for tenant data.
 */
export interface ConnectorDefinition {
  id: string;
  name: string;
  category: ConnectorCategory;
  status: ConnectorStatus;
  freeFirst: boolean;
  requiredSecrets: string[];
  capabilities: string[];
}

export interface ConnectorContext {
  organizationId: string;
  userId: string;
  requestId?: string;
}

export interface ConnectorHealth {
  status: ConnectorStatus;
  checkedAt: string;
  message?: string;
}

export interface GrowthEvent {
  organizationId: string;
  event: string;
  occurredAt?: string;
  source?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface AutomationConnector {
  definition: ConnectorDefinition;
  health(context: ConnectorContext): Promise<ConnectorHealth>;
  emit(event: GrowthEvent): Promise<void>;
}
