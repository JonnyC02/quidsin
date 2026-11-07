export interface HealthCheckable {
  ping(): Promise<boolean>;
}
