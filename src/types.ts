/**
 * Type definitions for Saudi BidPilot and Cloudflare D1 integration.
 */

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
  error?: string;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface Env {
  DB: D1Database;
  BIDPILOT_ADMIN_TOKEN?: string;
  ZERO_COST_ONLY?: string;
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export interface OpportunityRecord {
  id: string;
  fingerprint?: string;
  source_id: string;
  kind: string;
  title: string;
  title_en?: string;
  organization: string;
  organization_en?: string;
  reference?: string;
  source_url: string;
  apply_url?: string | null;
  apply_verified?: boolean;
  registration_url?: string | null;
  registration_verified?: boolean;
  award_url?: string | null;
  contractor_url?: string | null;
  status: string;
  deadline?: string | null;
  deadline_at?: string | null;
  deadline_time?: string | null;
  published_at?: string | null;
  city?: string;
  description?: string;
  description_en?: string;
  requirements?: string[] | string;
  documents?: unknown[];
  sectors?: string[];
  confidence: number;
  last_verified: string;
  verification_method?: string;
  verification_status?: string;
  verification_error?: string | null;
  verification_note?: string;
  application_instructions?: string;
  application_email?: string;
  competition_number?: string;
  document_fee?: string;
  tender_type?: string;
  inquiries_deadline?: string;
  bid_opening_date?: string;
  contact_name?: string;
  contact_phone?: string;
  login_required?: boolean;
  status_basis?: string;
  evidence_path?: string;
  source_status?: string;
  last_refresh_attempt?: string;
  last_refresh_result?: string;
  last_verification_attempt?: string;
  isSaudiSpecific?: boolean;
  actionType?: string;
  mainContractor?: string;
  mainContractorEn?: string;
  main_contractor?: string;
  contacts?: Array<{ company: string; value: string; sourceUrl: string }>;
  workTypeEvidence?: string;
  [key: string]: unknown;
}

export interface SourceRecord {
  id: string;
  name: string;
  url: string;
  status: 'LIVE' | 'AUTH_REQUIRED' | 'BLOCKED' | 'DEGRADED' | 'MANUAL_IMPORT' | 'UNAVAILABLE';
  scope?: string;
  extraction_method?: string;
  automatic_runtime_verified?: boolean;
  last_attempt?: string;
  last_success?: string;
  records_imported?: number;
  notes?: string;
  public_access?: string;
  reason?: string;
  message?: string;
}

export interface SessionRecord {
  id: string;
  csrf: string;
  created_at: string;
  expires_at: string;
}

export interface CompanyProfile {
  name: string;
  size: 'small' | 'medium' | 'large';
  city: string;
  sectors: string[];
  services: string;
  workers: number;
  target_cities: string[];
  certifications: string[];
  contract_min: number;
  contract_max: number;
}

export interface TrackingRecord {
  stage: 'saved' | 'reviewing' | 'preparing' | 'submitted' | 'won' | 'lost';
  notes: string;
  updated_at: string;
}

export interface RunRecord {
  id: number;
  started_at: string;
  finished_at?: string | null;
  status: string;
  data: string;
}
