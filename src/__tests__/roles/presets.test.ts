import { describe, it, expect } from 'vitest';
import {
  ROLE_PRESETS,
  getRoleById,
  getRolePresetOptions,
  LEAD_DECIDES_OPTION,
  CUSTOM_ROLE_OPTION,
} from '../../roles/presets.js';

describe('Role Presets', () => {
  it('defines exactly 8 role presets', () => {
    expect(ROLE_PRESETS).toHaveLength(8);
  });

  it('every preset has required fields', () => {
    for (const role of ROLE_PRESETS) {
      expect(role.id).toBeTruthy();
      expect(role.name).toBeTruthy();
      expect(role.description).toBeTruthy();
      expect(role.systemPrompt).toBeTruthy();
      expect(role.expertise.length).toBeGreaterThan(0);
      expect(role.allowedTools.length).toBeGreaterThan(0);
      expect(role.icon).toBeTruthy();
    }
  });

  it('getRoleById — returns matching role', () => {
    const backend = getRoleById('backend-dev');
    expect(backend).toBeDefined();
    expect(backend!.name).toBe('Backend Developer');
  });

  it('getRoleById — returns undefined for unknown id', () => {
    expect(getRoleById('nonexistent')).toBeUndefined();
  });

  it('getRolePresetOptions — returns compact objects with id, name, icon, description', () => {
    const options = getRolePresetOptions();

    expect(options).toHaveLength(8);
    for (const opt of options) {
      expect(opt).toHaveProperty('id');
      expect(opt).toHaveProperty('name');
      expect(opt).toHaveProperty('icon');
      expect(opt).toHaveProperty('description');
    }
  });

  // ─── Read-only role enforcement ──────────────────────────────

  it('security-reviewer has restricted tools (no writeFile/editFile)', () => {
    const role = getRoleById('security-reviewer')!;

    expect(role.allowedTools).not.toContain('*');
    expect(role.allowedTools).not.toContain('writeFile');
    expect(role.allowedTools).not.toContain('editFile');
    expect(role.allowedTools).toContain('readFile');
  });

  it('code-reviewer has restricted tools (no writeFile/editFile)', () => {
    const role = getRoleById('code-reviewer')!;

    expect(role.allowedTools).not.toContain('*');
    expect(role.allowedTools).not.toContain('writeFile');
    expect(role.allowedTools).not.toContain('editFile');
    expect(role.allowedTools).toContain('readFile');
  });

  // ─── Sentinel options ────────────────────────────────────────

  it('LEAD_DECIDES_OPTION has id "auto"', () => {
    expect(LEAD_DECIDES_OPTION.id).toBe('auto');
    expect(LEAD_DECIDES_OPTION.name).toBe('Let Lead Decide');
  });

  it('CUSTOM_ROLE_OPTION has id "custom"', () => {
    expect(CUSTOM_ROLE_OPTION.id).toBe('custom');
    expect(CUSTOM_ROLE_OPTION.name).toBe('Custom Role');
  });
});
