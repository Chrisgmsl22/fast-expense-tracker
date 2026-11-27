import { randomUUID } from "node:crypto";
import type { BetterAuthOptions } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import bcrypt from "bcryptjs";
import { IDLE_TIMEOUT_MS, IDLE_TIMEOUT_SECONDS } from "@/lib/auth/idle-session";
import {
    API_RESOURCE_NAME,
    OAUTH_SCOPES,
    apiResourceIdentifier,
} from "@/lib/auth/oauth-client";

const apiResource = process.env.AUTH_URL
    ? apiResourceIdentifier(process.env.AUTH_URL)
    : undefined;

export const authConfig = {
    secret: process.env.AUTH_SECRET,
    baseURL: process.env.AUTH_URL,
    user: { modelName: "User" },
    account: { modelName: "Account" },
    verification: { modelName: "Verification" },
    emailAndPassword: {
        enabled: true,
        disableSignUp: true,
        minPasswordLength: 1,
        password: {
            hash: (password) => bcrypt.hash(password, 10),
            verify: ({ hash, password }) => bcrypt.compare(password, hash),
        },
    },
    session: {
        modelName: "Session",
        expiresIn: IDLE_TIMEOUT_SECONDS,
        disableSessionRefresh: true,
        cookieCache: { enabled: false },
    },
    databaseHooks: {
        session: {
            create: {
                before: async (session) => ({
                    data: {
                        ...session,
                        // Better Auth gives rememberMe:false a separate 24-hour lifetime.
                        expiresAt: new Date(
                            Math.min(
                                session.expiresAt.getTime(),
                                Date.now() + IDLE_TIMEOUT_MS,
                            ),
                        ),
                    },
                }),
            },
        },
    },
    advanced: { database: { generateId: () => randomUUID() } },
    rateLimit: { enabled: true, storage: "database", modelName: "RateLimit" },
    plugins: [
        jwt({
            disableSettingJwtHeader: true,
            schema: { jwks: { modelName: "Jwks" } },
        }),
        oauthProvider({
            loginPage: "/login",
            consentPage: "/consent",
            scopes: [...OAUTH_SCOPES],
            grantTypes: ["authorization_code", "refresh_token"],
            accessTokenExpiresIn: 3600,
            refreshTokenExpiresIn: 2_592_000,
            refreshTokenReuseInterval: 0,
            resources: apiResource
                ? [
                      {
                          identifier: apiResource,
                          name: API_RESOURCE_NAME,
                          allowedScopes: [...OAUTH_SCOPES],
                      },
                  ]
                : [],
            resourceSeedMode: "insertOnly",
            clientPrivileges: () => false,
            schema: {
                oauthClient: { modelName: "OAuthClient" },
                oauthResource: { modelName: "OAuthResource" },
                oauthClientResource: { modelName: "OAuthClientResource" },
                oauthRefreshToken: { modelName: "OAuthRefreshToken" },
                oauthAccessToken: { modelName: "OAuthAccessToken" },
                oauthConsent: { modelName: "OAuthConsent" },
                oauthClientAssertion: { modelName: "OAuthClientAssertion" },
            },
        }),
    ],
    disabledPaths: [
        "/sign-up/email",
        "/change-password",
        "/set-password",
        "/reset-password",
        "/request-password-reset",
        "/change-email",
        "/delete-user",
        "/update-user",
        "/token",
        "/oauth2/create-client",
        "/oauth2/get-client",
        "/oauth2/get-clients",
        "/oauth2/update-client",
        "/oauth2/delete-client",
        "/oauth2/client/rotate-secret",
    ],
} satisfies BetterAuthOptions;
