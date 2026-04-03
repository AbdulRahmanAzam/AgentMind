import * as path from 'path';
import * as fs from 'fs/promises';
import lockfile from 'proper-lockfile';
import { AGENTMIND_CONSTANTS } from '../types.js';
import { Logger } from '../utils/logger.js';

/**
 * Error thrown when a file lock cannot be acquired within the timeout.
 */
export class LockAcquisitionError extends Error {
  /** The resource path that could not be locked. */
  readonly resourcePath: string;
  /** The underlying error from proper-lockfile. */
  override readonly cause: unknown;

  constructor(resourcePath: string, cause: unknown) {
    super(`Failed to acquire lock on: ${resourcePath}`);
    this.name = 'LockAcquisitionError';
    this.resourcePath = resourcePath;
    this.cause = cause;
  }
}

/**
 * Advisory file-locking manager built on `proper-lockfile`.
 *
 * Every write to the shared task list or mailbox goes through this
 * manager so that concurrent agents never corrupt each other's data.
 */
export class LockManager {
  private readonly workspaceRoot: string;
  private readonly locksDir: string;
  private initialized = false;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.locksDir = path.join(
      workspaceRoot,
      AGENTMIND_CONSTANTS.LOCKS_DIR,
    );
  }

  /** Ensure the locks directory tree exists (idempotent). */
  private async ensureInit(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await fs.mkdir(this.locksDir, { recursive: true });
    this.initialized = true;
  }

  /**
   * Derive the lockfile path for a given resource.
   * The lockfile lives inside `.agentmind/locks/` and mirrors the
   * relative path of the resource being locked.
   */
  private getLockfilePath(resourcePath: string): string {
    const relative = path.relative(this.workspaceRoot, resourcePath);
    // Replace path separators and dots so we get a flat, safe filename
    const safe = relative.replace(/[/\\]/g, '__').replace(/\./g, '_');
    return path.join(this.locksDir, `${safe}.lock`);
  }

  /**
   * Acquire an advisory lock on a resource file.
   *
   * @param resourcePath - Absolute path to the file to lock.
   * @returns A release function. Call it (and await it) to free the lock.
   * @throws {LockAcquisitionError} If the lock cannot be acquired.
   */
  async acquireLock(
    resourcePath: string,
  ): Promise<() => Promise<void>> {
    await this.ensureInit();

    const lockfilePath = this.getLockfilePath(resourcePath);

    // Ensure the lockfile itself exists (proper-lockfile needs it)
    await this.ensureLockfileExists(lockfilePath);

    Logger.debug(`Lock: acquiring → ${path.basename(resourcePath)}`);

    try {
      const release = await lockfile.lock(lockfilePath, {
        stale: AGENTMIND_CONSTANTS.LOCK_TIMEOUT_MS,
        retries: {
          retries: Math.ceil(
            AGENTMIND_CONSTANTS.LOCK_TIMEOUT_MS /
              AGENTMIND_CONSTANTS.LOCK_RETRY_MS,
          ),
          minTimeout: AGENTMIND_CONSTANTS.LOCK_RETRY_MS,
          maxTimeout: AGENTMIND_CONSTANTS.LOCK_RETRY_MS * 2,
        },
      });

      Logger.debug(`Lock: acquired  ✓ ${path.basename(resourcePath)}`);

      return async () => {
        try {
          await release();
          Logger.debug(
            `Lock: released ✓ ${path.basename(resourcePath)}`,
          );
        } catch {
          // Lock may already have been released or gone stale — safe to ignore
          Logger.debug(
            `Lock: release skipped (already free) ${path.basename(resourcePath)}`,
          );
        }
      };
    } catch (err) {
      throw new LockAcquisitionError(resourcePath, err);
    }
  }

  /**
   * Run a function while holding a lock on the given resource.
   * The lock is ALWAYS released, even if `fn` throws.
   *
   * @param resourcePath - Absolute path to the file to lock.
   * @param fn - Async function to run while the lock is held.
   * @returns The return value of `fn`.
   */
  async withLock<T>(
    resourcePath: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const release = await this.acquireLock(resourcePath);
    try {
      return await fn();
    } finally {
      await release();
    }
  }

  /**
   * Check whether a resource is currently locked.
   *
   * @param resourcePath - Absolute path to the resource.
   * @returns `true` if a lock is held.
   */
  async isLocked(resourcePath: string): Promise<boolean> {
    await this.ensureInit();
    const lockfilePath = this.getLockfilePath(resourcePath);
    try {
      await this.ensureLockfileExists(lockfilePath);
      return await lockfile.check(lockfilePath, {
        stale: AGENTMIND_CONSTANTS.LOCK_TIMEOUT_MS,
      });
    } catch {
      return false;
    }
  }

  /**
   * Force-release a stale lock (crash recovery).
   *
   * @param resourcePath - Absolute path to the resource to unlock.
   */
  async forceRelease(resourcePath: string): Promise<void> {
    await this.ensureInit();
    const lockfilePath = this.getLockfilePath(resourcePath);
    try {
      await lockfile.unlock(lockfilePath);
      Logger.info(`Lock: force-released ${path.basename(resourcePath)}`);
    } catch {
      Logger.debug(
        `Lock: force-release skipped (not locked) ${path.basename(resourcePath)}`,
      );
    }
  }

  /**
   * Create the lockfile sentinel if it doesn't already exist.
   * `proper-lockfile` needs the target file to exist before locking.
   */
  private async ensureLockfileExists(lockfilePath: string): Promise<void> {
    const dir = path.dirname(lockfilePath);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.writeFile(lockfilePath, '', { flag: 'wx' });
    } catch (err: unknown) {
      // EEXIST is fine — file already exists
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw err;
      }
    }
  }
}
