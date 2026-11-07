export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';

  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  readonly code = 'CONFLICT';

  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class InvalidCredentialsError extends Error {
  readonly code = 'INVALID_CREDENTIALS';

  constructor(message = 'Invalid email or password') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';

  constructor(
    message = 'Validation failed',
    readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
