import * as crypto from 'crypto';

/**
 * Generate a sequential task ID.
 * @param counter - The sequential number (1-based). Padded to 3 digits.
 * @returns A task ID like `task-001`, `task-042`.
 */
export function generateTaskId(counter: number): string {
  return `task-${String(counter).padStart(3, '0')}`;
}

/**
 * Generate a unique agent ID from a role identifier.
 * @param roleId - The role slug, e.g. `'backend-dev'`.
 * @returns An agent ID like `backend-dev-a1b2c3d4`.
 */
export function generateAgentId(roleId: string): string {
  const short = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `${roleId}-${short}`;
}

/**
 * Generate a unique message ID.
 * @returns A message ID like `msg-550e8400-e29b-41d4-a716-446655440000`.
 */
export function generateMessageId(): string {
  return `msg-${crypto.randomUUID()}`;
}

/**
 * Generate a unique team ID.
 * @returns A team ID like `team-550e8400-e29b-41d4-a716-446655440000`.
 */
export function generateTeamId(): string {
  return `team-${crypto.randomUUID()}`;
}
