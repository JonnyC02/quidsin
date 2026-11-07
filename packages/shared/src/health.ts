export type HealthState = 'ok' | 'error';

export interface HealthStatus {
  status: HealthState;
  uptimeSeconds: number;
  timestamp: string;
}
