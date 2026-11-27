import { describe, expect, it } from "vitest";

import {
    OAUTH_SCOPES,
    apiResourceIdentifier,
    isNativeRedirectUri,
    nativeClientRows,
} from "@/lib/auth/oauth-client";
import { signedOAuthQuery } from "@/lib/auth/oauth-query";

const resource = apiResourceIdentifier("https://fet.example.com");
const input = {
    clientId: "invented-ios",
    name: "Invented iOS",
    redirectUris: ["fet-test://oauth/callback"],
    resource,
};

describe("native client registration rows", () => {
    it("guard: registers a public PKCE native client linked to the API resource", () => {
        const now = new Date("2026-11-27T00:00:00Z");
        const { client, resource: row, link } = nativeClientRows(input, now);

        expect(client).toMatchObject({
            clientId: "invented-ios",
            tokenEndpointAuthMethod: "none",
            requirePKCE: true,
            applicationType: "native",
            grantTypes: ["authorization_code", "refresh_token"],
            responseTypes: ["code"],
            skipConsent: false,
            redirectUris: ["fet-test://oauth/callback"],
            scopes: OAUTH_SCOPES,
        });
        expect(client).not.toHaveProperty("clientSecret");
        expect(OAUTH_SCOPES).toContain("fet:api");
        expect(row).toMatchObject({
            identifier: "https://fet.example.com/api/v1",
            allowedScopes: OAUTH_SCOPES,
        });
        expect(link).toMatchObject({
            clientId: "invented-ios",
            resourceId: "https://fet.example.com/api/v1",
        });
    });

    it.each([
        "https://fet.example.com/callback",
        "http://fet.example.com/callback",
        "fet-test://oauth/callback#frag",
        "not a uri",
    ])("guard: refuses the web or malformed redirect %s", (uri) => {
        expect(isNativeRedirectUri(uri)).toBe(false);
        expect(() =>
            nativeClientRows({ ...input, redirectUris: [uri] }, new Date()),
        ).toThrow();
    });

    it("accepts an http loopback redirect", () => {
        expect(isNativeRedirectUri("http://127.0.0.1:8976/callback")).toBe(
            true,
        );
    });
});

describe("signedOAuthQuery", () => {
    it("rebuilds a signed query with repeated params", () => {
        expect(
            signedOAuthQuery({
                client_id: "c",
                resource: ["a", "b"],
                sig: "s",
            }),
        ).toBe("client_id=c&resource=a&resource=b&sig=s");
    });

    it("pin: ignores a URL without a signature", () => {
        expect(signedOAuthQuery({ reason: "session-expired" })).toBeUndefined();
    });
});
