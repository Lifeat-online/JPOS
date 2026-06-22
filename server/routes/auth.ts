import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import {
  handleLogin, handleLogout, handleRefreshToken, handleRevokeRefreshTokens,
  handleGetMe, handleSetupPassword,
  handleTwoFactorStatus, handleTwoFactorSetup, handleTwoFactorConfirm, handleTwoFactorDisable,
} from "../auth-handler.js";
import { validateSchema, LoginSchema, PasswordSetupSchema } from "../validation.js";
import { authRateLimit, sensitiveRouteRateLimit } from "./_helpers.js";

export const authRouter = Router();

authRouter.post("/login", authRateLimit, validateSchema(LoginSchema), handleLogin);
authRouter.post("/logout", handleLogout);
authRouter.post("/refresh", authRateLimit, handleRefreshToken);
authRouter.post("/refresh-tokens/revoke", requireAuth, handleRevokeRefreshTokens);
authRouter.get("/me", requireAuth, handleGetMe);
authRouter.post("/setup-password", sensitiveRouteRateLimit, requireAuth, validateSchema(PasswordSetupSchema), handleSetupPassword);
authRouter.get("/2fa", requireAuth, handleTwoFactorStatus);
authRouter.post("/2fa/setup", sensitiveRouteRateLimit, requireAuth, handleTwoFactorSetup);
authRouter.post("/2fa/confirm", sensitiveRouteRateLimit, requireAuth, handleTwoFactorConfirm);
authRouter.post("/2fa/disable", sensitiveRouteRateLimit, requireAuth, handleTwoFactorDisable);
