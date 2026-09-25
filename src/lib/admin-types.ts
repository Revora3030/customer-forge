/** Client-safe types shared between admin UI and admin server functions. */

export type NewClientService = {
  name: string;
  description?: string | undefined;
  price?: number | undefined;
  duration_minutes?: number | undefined;
  bookable?: boolean | undefined;
};

export type NewClientInput = {
  business_name: string;
  owner_name: string;
  owner_email: string;
  phone?: string;
  industry?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  service_area?: string;
  hours?: Record<string, string>;
  logo_url?: string;
  hero_image_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  tagline?: string;
  description?: string;
  services?: NewClientService[];
  images?: string[];
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  linkedin?: string;
  google_business?: string;
  review_link?: string;
  desired_domain?: string;
  plan_id?: string;
  conversion_goal?: string;
  support_email?: string;
};

export type ClientSummary = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  plan_id: string | null;
  subscription_status: string;
  is_suspended: boolean;
  is_demo: boolean;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  city: string | null;
  custom_domain: string | null;
  domain_status: string;
  publish_state: string;
  leads: number;
  appointments: number;
  readinessScore: number;
};

export type PlatformMetrics = {
  clients: number;
  active: number;
  suspended: number;
  trialing: number;
  published: number;
  domainsLive: number;
  leads30d: number;
  bookings30d: number;
  mrr: number;
};
