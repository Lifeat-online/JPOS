import '@testing-library/jest-dom';

// jsdom doesn't implement these APIs by default; tests that touch them
// stub them locally. The defaults below are explicit so failures are loud.
if (typeof window !== 'undefined') {
    if (!window.matchMedia) {
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: (query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => false,
            }),
        });
    }
    if (!('ResizeObserver' in window)) {
        // @ts-expect-error - minimal stub for recharts ResponsiveContainer
        window.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
}

// Provide a stable, deterministic JWT secret for tests that touch the
// auth module. The real secret in production is loaded from the
// environment in server/auth-handler.ts; this only affects unit tests.
process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret-test-secret';
process.env.JWT_EXPIRES_IN ||= '8h';
process.env.REFRESH_TOKEN_EXPIRES_IN ||= '7d';
process.env.NODE_ENV ||= 'test';
process.env.PAYFAST_SANDBOX ||= 'true';
process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '5432';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_DATABASE ||= 'jimmy_pos';
process.env.CORS_ORIGINS ||= '';
process.env.TRUST_PROXY_HOPS ||= '0';
// NOTE: do NOT set API_RATE_LIMIT_PERMIN here. The securityHardening
// module reads it at import time; forcing it to '0' would make the
// apiRateLimit middleware a no-op for the rest of the process. The
// rate-limit suite sets it explicitly per-test and resets state.
