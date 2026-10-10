import type { NextFunction, Request, Response } from "express";
import { auditActorFromRequest, auditRouteEvent } from "./routes/_helpers.js";
import { query } from "./db.js";
import { getAppConfigByTenant } from "./db-adapter.js";
import { getLicenceInfo, shouldEnforceLicence } from "./licenceMiddleware.js";
import { featureSetForPackage, getHostedPackage, hasPackageFeature, JPOS_PACKAGES, type PackageFeature } from "../shared/packageCatalog.js";

// Package (plan) limits shared by single-record routes and batch imports.
export async function getTenantPackageContext(tenantId: string) {
    const info = getLicenceInfo();
    if (shouldEnforceLicence() && info.payload) {
        const tier = info.payload.tier;
        const pkg = getHostedPackage(tier);
        const catalogPackage = JPOS_PACKAGES.find((p) => p.id === tier) || pkg;
        return {
            source: "licence",
            package: {
                ...catalogPackage,
                id: tier,
                maxRegisters: info.payload.maxRegisters,
                features: info.payload.features,
            },
        };
    }
    const cfg = await getAppConfigByTenant(tenantId);
    const tier = cfg?.business?.packageTier || process.env.JPOS_HOSTED_PACKAGE_TIER || "free";
    const pkg = getHostedPackage(tier);
    return {
        source: "hosted",
        package: {
            ...pkg,
            features: featureSetForPackage(pkg.id),
        },
    };
}
export async function getTenantPackageUsage(tenantId: string) {
    const [productRows, staffRows, customerRows, registerRows] = await Promise.all([
        query<any>("SELECT COUNT(*) AS count FROM products WHERE tenant_id = $1", [tenantId]),
        query<any>("SELECT COUNT(*) AS count FROM staff WHERE tenant_id = $1", [tenantId]),
        query<any>("SELECT COUNT(*) AS count FROM customers WHERE tenant_id = $1", [tenantId]),
        query<any>("SELECT COUNT(*) AS count FROM cash_sessions WHERE tenant_id = $1 AND status = 'open'", [tenantId]),
    ]);
    return {
        products: Number(productRows[0]?.count || 0),
        staff: Number(staffRows[0]?.count || 0),
        customers: Number(customerRows[0]?.count || 0),
        activeRegisters: Number(registerRows[0]?.count || 0),
    };
}
export function limitReached(current: number, limit: number) {
    return limit !== -1 && current >= limit;
}
export function packageLimitResponse(res: Response, details: {
    packageId: string;
    limitName: string;
    limit: number;
    current?: number;
}) {
    return res.status(403).json({
        error: "Package limit reached",
        package: details.packageId,
        limitName: details.limitName,
        limit: details.limit,
        current: details.current,
        upgrade: "Upgrade your MasePOS package to unlock more capacity",
    });
}

export type PackageUsageKey = "products" | "staff" | "customers" | "activeRegisters";
export type PackageLimitKey = "maxProducts" | "maxStaff" | "maxCustomers" | "maxRegisters";

/** How many more records the tenant's package allows; Infinity when unlimited. */
export async function remainingPackageCapacity(tenantId: string, usageKey: PackageUsageKey, limitKey: PackageLimitKey): Promise<number> {
    const [context, usage] = await Promise.all([getTenantPackageContext(tenantId), getTenantPackageUsage(tenantId)]);
    const limit = Number((context.package as any)[limitKey]);
    if (limit === -1 || !Number.isFinite(limit)) return Infinity;
    return Math.max(0, limit - Number((usage as any)[usageKey] || 0));
}

export async function requirePackageCapacity(req: Request, res: Response, next: NextFunction, usageKey: "products" | "staff" | "customers" | "activeRegisters", limitKey: "maxProducts" | "maxStaff" | "maxCustomers" | "maxRegisters", limitName: string) {
    try {
        const context = await getTenantPackageContext(String(req.params.tenantId));
        const usage = await getTenantPackageUsage(String(req.params.tenantId));
        const limit = Number((context.package as any)[limitKey]);
        if (limitReached(Number((usage as any)[usageKey]), limit)) {
            void auditRouteEvent(req, "permission.denied", "security", {
                attemptedAction: `package.capacity.${usageKey}`,
                reason: "package_limit_reached",
                package: context.package.id,
                limitName,
                limit,
                current: Number((usage as any)[usageKey]),
            }, auditActorFromRequest(req).staffId, "permission");
            packageLimitResponse(res, {
                packageId: context.package.id,
                limitName,
                limit,
                current: Number((usage as any)[usageKey]),
            });
            return;
        }
        next();
    }
    catch (err) {
        next(err);
    }
}
export function requirePackageFeature(feature: PackageFeature) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const context = await getTenantPackageContext(String(req.params.tenantId));
            if (!hasPackageFeature(context.package.features, feature)) {
                void auditRouteEvent(req, "permission.denied", "security", {
                    attemptedAction: `package.feature.${feature}`,
                    reason: "feature_not_available",
                    package: context.package.id,
                    feature,
                }, auditActorFromRequest(req).staffId, "permission");
                return res.status(403).json({
                    error: "Feature not available on your package",
                    package: context.package.id,
                    feature,
                    upgrade: "Upgrade your MasePOS package to unlock this feature",
                });
            }
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
