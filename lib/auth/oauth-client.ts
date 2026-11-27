import type { PrismaClient } from "@prisma/client";

// Relative imports only: `prisma/seed-dev.ts` loads this module under plain Node.

export const OAUTH_SCOPES = [
    "openid",
    "profile",
    "email",
    "offline_access",
    "fet:api",
];
export const API_RESOURCE_NAME = "Fast Expense Tracker API v1";

/** The RFC 8707 resource (JWT audience) for `/api/v1`, from the app origin. */
export function apiResourceIdentifier(baseURL: string): string {
    return new URL("/api/v1", baseURL).href;
}

export type NativeClientInput = {
    clientId: string;
    name: string;
    redirectUris: string[];
    resource: string;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** A private-use scheme (`app://…`) or an http loopback, per RFC 8252. */
export function isNativeRedirectUri(uri: string): boolean {
    let url: URL;
    try {
        url = new URL(uri);
    } catch {
        return false;
    }
    if (url.hash || url.username || url.password) return false;
    if (url.protocol === "https:") return false;
    if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname);
    return true;
}

/**
 * The rows that register a public native client: the API resource, the client,
 * and the link between them. A later migration INSERT copies these values.
 */
export function nativeClientRows(input: NativeClientInput, now: Date) {
    if (
        input.redirectUris.length === 0 ||
        !input.redirectUris.every(isNativeRedirectUri)
    ) {
        throw new Error("A native client needs private-use or loopback URIs");
    }
    return {
        resource: {
            id: crypto.randomUUID(),
            identifier: input.resource,
            name: API_RESOURCE_NAME,
            allowedScopes: OAUTH_SCOPES,
            dpopBoundAccessTokensRequired: false,
            disabled: false,
            policyVersion: 1,
            createdAt: now,
            updatedAt: now,
        },
        client: {
            id: crypto.randomUUID(),
            clientId: input.clientId,
            name: input.name,
            redirectUris: input.redirectUris,
            tokenEndpointAuthMethod: "none",
            applicationType: "native",
            grantTypes: ["authorization_code", "refresh_token"],
            responseTypes: ["code"],
            requirePKCE: true,
            skipConsent: false,
            disabled: false,
            dpopBoundAccessTokens: false,
            scopes: OAUTH_SCOPES,
            clientCredentialsScopes: [],
            createdAt: now,
            updatedAt: now,
        },
        link: {
            id: crypto.randomUUID(),
            clientId: input.clientId,
            resourceId: input.resource,
            createdAt: now,
        },
    };
}

/**
 * Registers a public native client server-side. Insert-only: rows that already
 * exist stay as they are, so a rerun writes nothing.
 */
export async function registerNativeClient(
    db: PrismaClient,
    input: NativeClientInput,
): Promise<{ created: boolean }> {
    const rows = nativeClientRows(input, new Date());
    return db.$transaction(async (tx) => {
        await tx.oAuthResource.createMany({
            data: [rows.resource],
            skipDuplicates: true,
        });
        const { count } = await tx.oAuthClient.createMany({
            data: [rows.client],
            skipDuplicates: true,
        });
        await tx.oAuthClientResource.createMany({
            data: [rows.link],
            skipDuplicates: true,
        });
        return { created: count === 1 };
    });
}
