import { randomUUID } from 'node:crypto';

export interface IdGenerator {
  generate(): string;
}

export class RandomUuidGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}
