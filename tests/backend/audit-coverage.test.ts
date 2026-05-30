import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('immutable audit coverage instrumentation', () => {
  it('records authentication and security audit events', () => {
    const source = readRepoFile('server/auth-handler.ts');

    expect(source).toContain('auth.login_succeeded');
    expect(source).toContain('auth.login_failed');
    expect(source).toContain('auth.logout');
    expect(source).toContain('staff.password_set');
    expect(source).toContain('permission.denied');
  });

  it('records high-risk route mutations and denied role checks', () => {
    const source = readRepoFile('server/app.ts');

    expect(source).toContain('function denyWithAudit');
    expect(source).toContain('settings.app_updated');
    expect(source).toContain('settings.logo_uploaded');
    expect(source).toContain('customer.created');
    expect(source).toContain('customer.updated');
    expect(source).toContain('customer.deleted');
    expect(source).toContain('staff.created');
    expect(source).toContain('staff.updated');
    expect(source).toContain('staff.deleted');
    expect(source).toContain('cash_session.opened');
    expect(source).toContain('cash_session.updated');
    expect(source).toContain('cash_session.reviewed');
    expect(source).toContain('ai.settings_updated');
    expect(source).toContain('ai.provider_tested');
    expect(source).toContain('ai.inventory_steps_applied');
  });

  it('records cash movement audit rows at each server insertion path', () => {
    expect(readRepoFile('server/app.ts')).toContain('cash_movement.recorded');
    expect(readRepoFile('server/mariadb-crud.ts')).toContain('cash_movement.recorded');
    expect(readRepoFile('server/managerCash.ts')).toContain('cash_movement.recorded');
  });
});
