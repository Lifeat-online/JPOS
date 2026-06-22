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
    const appSource = readRepoFile('server/app.ts');
    const settingsSource = readRepoFile('server/routes/settings.ts');
    const cashSource = readRepoFile('server/routes/cash.ts');
    const helpers = readRepoFile('server/routes/_helpers.ts');

    expect(helpers).toContain('function denyWithAudit');
    expect(settingsSource).toContain('settings.app_updated');
    expect(settingsSource).toContain('settings.logo_uploaded');
    expect(appSource).toContain('customer.created');
    expect(appSource).toContain('customer.updated');
    expect(appSource).toContain('customer.deleted');
    expect(appSource).toContain('staff.created');
    expect(appSource).toContain('staff.updated');
    expect(appSource).toContain('staff.deleted');
    expect(cashSource).toContain('cash_session.opened');
    expect(cashSource).toContain('cash_session.updated');
    expect(cashSource).toContain('cash_session.reviewed');
    expect(settingsSource).toContain('ai.settings_updated');
    expect(settingsSource).toContain('ai.provider_tested');
    expect(settingsSource).toContain('ai.inventory_steps_applied');
  });

  it('records cash movement audit rows at each server insertion path', () => {
    expect(readRepoFile('server/routes/cash.ts')).toContain('cash_movement.recorded');
    expect(readRepoFile('server/mariadb-crud.ts')).toContain('cash_movement.recorded');
    expect(readRepoFile('server/managerCash.ts')).toContain('cash_movement.recorded');
  });
});
