// Domain entities
export type { Frequency } from './domain/entities/frequency.js';
export { FREQUENCIES } from './domain/entities/frequency.js';
export type { Visibility } from './domain/entities/visibility.js';
export type { User } from './domain/entities/user.js';
export type { Tenant } from './domain/entities/tenant.js';
export type { Session } from './domain/entities/session.js';
export type { RecurringMoneyItem } from './domain/entities/recurring-money-item.js';
export type { IncomeSource } from './domain/entities/income.js';
export type { RecurringExpense } from './domain/entities/expense.js';
export type { Account, AccountType } from './domain/entities/account.js';
export type { PlaidItem, PlaidItemStatus, EncryptedPayload } from './domain/entities/plaid-item.js';
export type { Transaction } from './domain/entities/transaction.js';
export type { TenantMembership, TenantRole } from './domain/entities/tenant-membership.js';
export type { TenantInvite, InviteStatus } from './domain/entities/tenant-invite.js';
export type { AuditEvent, AuditAction } from './domain/entities/audit-event.js';

// Domain errors
export {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  InvalidCredentialsError,
  ValidationError,
} from './domain/errors.js';

// Visibility
export { canView, type VisibilityScoped } from './domain/visibility-rules.js';

// Calculations
export {
  monthlyEquivalentDecimal,
  monthlyEquivalentMinorUnits,
} from './domain/calculations/monthly-equivalent.js';
export {
  sumMonthlyEquivalents,
  remainingMonthlyIncome,
  type MoneyFrequencyItem,
} from './domain/calculations/dashboard-totals.js';
export { nextOccurrence, toIsoDateString } from './domain/calculations/next-occurrence.js';

// Ports
export type { UserRepository, GoogleProfile } from './ports/user-repository.js';
export type { TenantRepository } from './ports/tenant-repository.js';
export type { SessionRepository, NewSession } from './ports/session-repository.js';
export type { GoogleIdentity, GoogleIdentityVerifier } from './ports/google-identity.js';
export type {
  RecurringMoneyItemRepository,
  NewRecurringMoneyItem,
  RecurringMoneyItemPatch,
} from './ports/recurring-money-item-repository.js';
export type { IncomeRepository } from './ports/income-repository.js';
export type { ExpenseRepository } from './ports/expense-repository.js';
export type { AccountRepository, NewAccount, AccountPatch } from './ports/account-repository.js';
export { type Clock, SystemClock } from './ports/clock.js';
export { type IdGenerator, RandomUuidGenerator } from './ports/id-generator.js';
export type {
  BankingProvider,
  LinkTokenRequest,
  PlaidAccountInfo,
  ExchangeResult,
  PlaidTransactionData,
  SyncPage,
} from './ports/banking-provider.js';
export { type EncryptionService, AesGcmEncryptionService } from './ports/encryption-service.js';
export {
  type EntitlementChecker,
  type GatedFeature,
  AllowAllEntitlementChecker,
} from './ports/entitlement-checker.js';
export type { JobQueue, SyncJob } from './ports/job-queue.js';
export type { PlaidItemRepository, NewPlaidItem } from './ports/plaid-item-repository.js';
export type {
  TransactionRepository,
  NewTransaction,
  TransactionFilter,
} from './ports/transaction-repository.js';
export type { TenantMembershipRepository } from './ports/tenant-membership-repository.js';
export type { TenantInviteRepository, NewTenantInvite } from './ports/tenant-invite-repository.js';
export type { AuditEventRepository, NewAuditEvent } from './ports/audit-event-repository.js';

// Application services
export type { AuthContext } from './application/auth-context.js';
export {
  AuthService,
  type AuthServiceDeps,
  type AuthServiceConfig,
  type SessionIssued,
} from './application/auth.service.js';
export {
  RecurringMoneyItemService,
  type RecurringMoneyItemServiceDeps,
  type CreateRecurringMoneyItemInput,
  type UpdateRecurringMoneyItemInput,
} from './application/recurring-money-item.service.js';
export { IncomeService } from './application/income.service.js';
export { ExpenseService } from './application/expense.service.js';
export {
  AccountService,
  type AccountServiceDeps,
  type CreateAccountInput,
  type UpdateAccountInput,
} from './application/account.service.js';
export {
  DashboardService,
  type DashboardServiceDeps,
  type DashboardSummary,
  type UpcomingPayment,
} from './application/dashboard.service.js';
export {
  BankConnectionService,
  type BankConnectionServiceDeps,
  type BankConnectionServiceConfig,
} from './application/bank-connection.service.js';
export {
  TransactionSyncService,
  type TransactionSyncServiceDeps,
  type SyncJobInput,
} from './application/transaction-sync.service.js';
export { TransactionService, type TransactionServiceDeps } from './application/transaction.service.js';
export {
  PlaidWebhookService,
  type PlaidWebhookServiceDeps,
  type PlaidWebhookPayload,
} from './application/plaid-webhook.service.js';
export {
  TenantMembershipService,
  type TenantMembershipServiceDeps,
  type MemberSummary,
} from './application/tenant-membership.service.js';
