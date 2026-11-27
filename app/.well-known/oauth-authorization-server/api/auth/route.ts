import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { authProvider } from "@/auth";

export const GET = oauthProviderAuthServerMetadata(authProvider);
