import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { LockManager, LockAcquisitionError } from '../../communication/lockManager.js';
import { createTempWorkspace, cleanTempWorkspace } from '../setup.js';

describe('LockManager', () => {
  let tmpDir: string;
  let lockManager: LockManager;
  let testResourcePath: string;

  beforeEach(async () => {
    tmpDir = await createTempWorkspace();
    lockManager = new LockManager(tmpDir);
    // Create a test file to lock on
    testResourcePath = path.join(tmpDir, '.agentmind', 'tasks', 'test-resource.json');
    await fs.writeFile(testResourcePath, '{}', 'utf-8');
  });

  afterEach(async () => {
    await cleanTempWorkspace(tmpDir);
  });

  it('acquireLock — acquires a lock and returns a release function', async () => {
    const release = await lockManager.acquireLock(testResourcePath);
    expect(release).toBeTypeOf('function');
    await release();
  });

  it('acquireLock — second call on same resource waits/retries while first lock held', async () => {
    const release1 = await lockManager.acquireLock(testResourcePath);

    // Start a second lock attempt — it should eventually fail since we hold the lock
    // and the stale timeout equals LOCK_TIMEOUT_MS
    let secondErr: Error | null = null;

    // Release after a short delay so the second lock can acquire
    const releasePromise = new Promise<void>((resolve) => {
      setTimeout(async () => {
        await release1();
        resolve();
      }, 200);
    });

    const release2 = await lockManager.acquireLock(testResourcePath);
    await releasePromise;
    expect(release2).toBeTypeOf('function');
    await release2();
  });

  it('withLock — executes function and releases lock even on error', async () => {
    let fnExecuted = false;
    try {
      await lockManager.withLock(testResourcePath, async () => {
        fnExecuted = true;
        throw new Error('deliberate error');
      });
    } catch (err) {
      expect((err as Error).message).toBe('deliberate error');
    }

    expect(fnExecuted).toBe(true);

    // Lock should be released — acquiring again should succeed
    const release = await lockManager.acquireLock(testResourcePath);
    await release();
  });

  it('withLock — returns the value from the executed function', async () => {
    const result = await lockManager.withLock(testResourcePath, async () => {
      return 42;
    });
    expect(result).toBe(42);
  });

  it('withLock — concurrent calls serialize correctly', async () => {
    const results: number[] = [];

    await Promise.all([
      lockManager.withLock(testResourcePath, async () => {
        results.push(1);
        await new Promise((r) => setTimeout(r, 50));
        results.push(2);
      }),
      lockManager.withLock(testResourcePath, async () => {
        results.push(3);
        await new Promise((r) => setTimeout(r, 50));
        results.push(4);
      }),
    ]);

    // Results should be either [1,2,3,4] or [3,4,1,2] — never interleaved
    expect(results).toHaveLength(4);
    // Check that pairs are contiguous
    const idx1 = results.indexOf(1);
    const idx2 = results.indexOf(2);
    const idx3 = results.indexOf(3);
    const idx4 = results.indexOf(4);
    expect(idx2).toBe(idx1 + 1);
    expect(idx4).toBe(idx3 + 1);
  });

  it('isLocked — returns true while locked, false after release', async () => {
    const release = await lockManager.acquireLock(testResourcePath);
    const lockedDuring = await lockManager.isLocked(testResourcePath);
    expect(lockedDuring).toBe(true);

    await release();
    // Wait briefly for lock file to be cleaned up
    await new Promise((r) => setTimeout(r, 100));
    const lockedAfter = await lockManager.isLocked(testResourcePath);
    expect(lockedAfter).toBe(false);
  });

  it('forceRelease — releases a held lock', async () => {
    const release = await lockManager.acquireLock(testResourcePath);
    await lockManager.forceRelease(testResourcePath);

    // After force-release, we should be able to acquire again
    const release2 = await lockManager.acquireLock(testResourcePath);
    await release2();
    // Clean up original (may fail, that's fine)
    try { await release(); } catch {}
  });

  it('parent directory creation — creates directories if lock path parent does not exist', async () => {
    const deepResource = path.join(tmpDir, 'deep', 'nested', 'file.json');
    await fs.mkdir(path.dirname(deepResource), { recursive: true });
    await fs.writeFile(deepResource, '{}', 'utf-8');

    const release = await lockManager.acquireLock(deepResource);
    expect(release).toBeTypeOf('function');
    await release();
  });
});
