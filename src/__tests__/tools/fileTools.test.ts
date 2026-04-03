import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileToolHandlers } from '../../tools/fileTools.js';
import { createTempWorkspace, cleanTempWorkspace } from '../setup.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('FileToolHandlers', () => {
  let tmpDir: string;
  let tools: FileToolHandlers;

  beforeEach(async () => {
    tmpDir = await createTempWorkspace();
    tools = new FileToolHandlers(tmpDir);
  });

  afterEach(async () => {
    await cleanTempWorkspace(tmpDir);
  });

  // ─── readFile ────────────────────────────────────────────────

  it('readFile — reads an existing file', async () => {
    await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'Hello World', 'utf-8');
    const result = await tools.readFile({ path: 'hello.txt' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello World');
    expect(result.filesModified).toEqual([]);
  });

  it('readFile — respects line range', async () => {
    const lines = ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n');
    await fs.writeFile(path.join(tmpDir, 'lines.txt'), lines, 'utf-8');

    const result = await tools.readFile({
      path: 'lines.txt',
      startLine: 2,
      endLine: 4,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('line2');
    expect(result.output).toContain('line4');
    expect(result.output).not.toContain('line5');
  });

  it('readFile — returns error for non-existent file', async () => {
    const result = await tools.readFile({ path: 'nope.txt' });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  // ─── writeFile ───────────────────────────────────────────────

  it('writeFile — creates file and parent directories', async () => {
    const result = await tools.writeFile({
      path: 'sub/dir/test.txt',
      content: 'Created!',
    });

    expect(result.success).toBe(true);
    expect(result.filesModified).toContain('sub/dir/test.txt');

    const written = await fs.readFile(
      path.join(tmpDir, 'sub', 'dir', 'test.txt'),
      'utf-8',
    );
    expect(written).toBe('Created!');
  });

  // ─── editFile ────────────────────────────────────────────────

  it('editFile — replaces matching text', async () => {
    await fs.writeFile(path.join(tmpDir, 'edit.txt'), 'foo bar baz', 'utf-8');

    const result = await tools.editFile({
      path: 'edit.txt',
      oldString: 'bar',
      newString: 'QUX',
    });

    expect(result.success).toBe(true);

    const updated = await fs.readFile(path.join(tmpDir, 'edit.txt'), 'utf-8');
    expect(updated).toBe('foo QUX baz');
  });

  it('editFile — fails when oldString not found', async () => {
    await fs.writeFile(path.join(tmpDir, 'edit.txt'), 'foo bar baz', 'utf-8');

    const result = await tools.editFile({
      path: 'edit.txt',
      oldString: 'MISSING',
      newString: 'REPLACED',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  // ─── listDirectory ──────────────────────────────────────────

  it('listDirectory — lists files and directories', async () => {
    await fs.mkdir(path.join(tmpDir, 'aDir'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'file.txt'), '', 'utf-8');

    const result = await tools.listDirectory({ path: '.' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('aDir/');
    expect(result.output).toContain('file.txt');
  });

  it('listDirectory — directories come before files', async () => {
    await fs.mkdir(path.join(tmpDir, 'zDir'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'aFile.txt'), '', 'utf-8');

    const result = await tools.listDirectory({ path: '.' });

    expect(result.success).toBe(true);
    const lines = result.output.split('\n');
    const dirIdx = lines.findIndex((l) => l.includes('zDir/'));
    const fileIdx = lines.findIndex((l) => l.includes('aFile.txt'));
    expect(dirIdx).toBeLessThan(fileIdx);
  });

  // ─── Security: path traversal ────────────────────────────────

  it('rejects path traversal with ".."', async () => {
    const result = await tools.readFile({ path: '../../../etc/passwd' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('traversal');
  });

  it('rejects absolute paths outside workspace', async () => {
    const result = await tools.readFile({ path: '/etc/passwd' });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects dotdot in nested paths', async () => {
    const result = await tools.writeFile({
      path: 'sub/../../../etc/shadow',
      content: 'evil',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('traversal');
  });
});
