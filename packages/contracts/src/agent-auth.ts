import type { ApiKeyScope } from "./resources";

export const AgentRegistrationTypes = [
  "anonymous",
  "identity_assertion",
  "service_auth",
] as const;

export type AgentRegistrationType = (typeof AgentRegistrationTypes)[number];

export const AgentRegistrationStatuses = [
  "anonymous_unclaimed",
  "claimed",
  "expired",
  "pending_claim",
  "provider_first_link",
  "provider_revoked",
  "provider_verified",
  "revoked",
] as const;

export type AgentRegistrationStatus = (typeof AgentRegistrationStatuses)[number];

export const AgentCredentialPhases = [
  "post_claim",
  "pre_claim",
  "provider_verified",
] as const;

export type AgentCredentialPhase = (typeof AgentCredentialPhases)[number];

export type AgentScope = ApiKeyScope | "agent:bootstrap";

export const AgentBootstrapScopes = ["agent:bootstrap"] as const;

export type AgentActorKind = "agent_credential" | "api_key" | "human";

export type CredentialActorAttribution = {
  readonly actorKind: AgentActorKind;
  readonly credentialId?: string;
  readonly registrationId?: `areg_${string}`;
};

export type OAuthProtectedResourceMetadata = {
  readonly authorization_servers: readonly string[];
  readonly bearer_methods_supported: readonly ["header"];
  readonly resource: string;
  readonly resource_name: string;
  readonly scopes_supported: readonly AgentScope[];
};

export type AgentAuthMetadata = {
  readonly auth_md_uri: string;
  readonly claim_endpoint: string;
  readonly claim_uri: string;
  readonly credential_types_supported: readonly ["access_token"];
  readonly events_endpoint: string;
  readonly events_supported: readonly [
    "https://schemas.workos.com/events/agent/auth/identity/assertion/revoked",
  ];
  readonly anonymous?: {
    readonly claim_uri: string;
    readonly credential_types_supported: readonly ["access_token"];
  };
  readonly identity_assertion?: {
    readonly assertion_types_supported: readonly (
      | "urn:ietf:params:oauth:token-type:id-jag"
      | "verified_email"
    )[];
    readonly claim_uri?: string;
    readonly credential_types_supported: readonly ["access_token"];
  };
  readonly identity_types_supported: readonly (
    | "anonymous"
    | "identity_assertion"
    | "service_auth"
  )[];
  readonly identity_endpoint: string;
  readonly register_uri: string;
  readonly registration_types_supported: readonly AgentRegistrationType[];
  readonly revocation_uri: string;
  readonly service_documentation: string;
  readonly service_auth?: {
    readonly claim_uri: string;
    readonly credential_types_supported: readonly ["access_token"];
  };
  readonly skill: string;
  readonly token_uri: string;
  readonly workos_posture: "existing_account_only" | "invited_signup" | "self_serve";
};

export type OAuthAuthorizationServerMetadata = {
  readonly agent_auth: AgentAuthMetadata;
  readonly authorization_servers: readonly string[];
  readonly authorization_endpoint: string;
  readonly bearer_methods_supported: readonly ["header"];
  readonly grant_types_supported: readonly (
    | "urn:ietf:params:oauth:grant-type:jwt-bearer"
    | "urn:crownest:params:oauth:grant-type:claim"
  )[];
  readonly issuer: string;
  readonly jwks_uri: string;
  readonly revocation_endpoint: string;
  readonly response_types_supported: readonly ["none"];
  readonly resource: string;
  readonly resource_name: string;
  readonly scopes_supported: readonly AgentScope[];
  readonly token_endpoint: string;
};

export type AgentIdentityRequest =
  | {
      readonly agent_context_id?: string;
      readonly agent_platform?: string;
      readonly requested_scopes?: readonly AgentScope[];
      readonly type: "anonymous";
    }
  | {
      readonly agent_context_id?: string;
      readonly agent_platform?: string;
      readonly login_hint: string;
      readonly requested_scopes?: readonly AgentScope[];
      readonly type: "service_auth";
    }
  | {
      readonly assertion: string;
      readonly requested_scopes?: readonly AgentScope[];
      readonly type: "identity_assertion";
    };

export type AgentClaimCeremony = {
  readonly claim_expires_at: string;
  readonly interval: number;
  readonly registration_id: `areg_${string}`;
  readonly user_code: string;
  readonly verification_uri: string;
};

export type AgentIdentityResponse =
  | {
      readonly claim: AgentClaimCeremony;
      readonly claim_token: string;
      readonly registration_type: "service_auth";
      readonly status: "authorization_pending";
    }
  | {
      readonly claim_token: string;
      readonly expires_at: string;
      readonly identity_assertion: string;
      readonly registration_id: `areg_${string}`;
      readonly registration_type: "anonymous";
      readonly scope: string;
      readonly status: "anonymous_unclaimed";
    }
  | {
      readonly identity_assertion: string;
      readonly registration_id: `areg_${string}`;
      readonly registration_type: "identity_assertion";
      readonly scope: string;
      readonly status: "provider_verified";
    }
  | {
      readonly claim: AgentClaimCeremony;
      readonly error: "interaction_required";
      readonly registration_id: `areg_${string}`;
      readonly registration_type: "identity_assertion";
      readonly status: "provider_first_link";
    };

export type AgentIdentityClaimRequest = {
  readonly claim_token: string;
  readonly email: string;
};

export type AgentIdentityClaimResponse = {
  readonly claim: AgentClaimCeremony;
  readonly status: "authorization_pending";
};

export type AgentTokenRequest =
  | {
      readonly claim_token: string;
      readonly grant_type: "urn:crownest:params:oauth:grant-type:claim";
    }
  | {
      readonly assertion: string;
      readonly grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer";
      readonly scope?: string;
    };

export type AgentTokenSuccessResponse = {
  readonly access_token: string;
  readonly expires_in: number;
  readonly identity_assertion?: string;
  readonly scope: string;
  readonly token_type: "Bearer";
};

export type AgentTokenPendingResponse = {
  readonly error:
    | "authorization_denied"
    | "authorization_pending"
    | "expired_token"
    | "slow_down";
  readonly error_description: string;
  readonly interval?: number;
};

export type AgentTokenResponse = AgentTokenPendingResponse | AgentTokenSuccessResponse;

export type AgentRevokeRequest = {
  readonly token: string;
  readonly token_type_hint?: "access_token";
};

export type AgentRevokeResponse = {
  readonly revoked: boolean;
};

export type AgentBootstrapResponse = {
  readonly auth_md_uri: string;
  readonly capabilities: readonly string[];
  readonly pricing_uri: string;
  readonly scopes: readonly AgentScope[];
  readonly templates_uri: string;
};

export type AgentRegistration = {
  readonly agentContextId?: string;
  readonly agentPlatform?: string;
  readonly assertionExpiresAt?: string;
  readonly assertionsValidAfter?: string;
  readonly claimEmail?: string;
  readonly claimTokenExpiresAt?: string;
  readonly claimedAt?: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly grantedScopes: readonly AgentScope[];
  readonly id: `areg_${string}`;
  readonly lastUsedAt?: string;
  readonly orgId?: `org_${string}`;
  readonly postClaimScopes: readonly AgentScope[];
  readonly preClaimScopes: readonly AgentScope[];
  readonly projectId?: `prj_${string}`;
  readonly providerAudience?: string;
  readonly providerId?: `agp_${string}`;
  readonly providerIssuer?: string;
  readonly providerSubject?: string;
  readonly registrationType: AgentRegistrationType;
  readonly revokedAt?: string;
  readonly status: AgentRegistrationStatus;
  readonly tokensValidAfter?: string;
  readonly updatedAt: string;
  readonly userId?: `usr_${string}`;
};

export type AgentCredential = {
  readonly credentialId: `acred_${string}`;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastUsedAt?: string;
  readonly orgId?: `org_${string}`;
  readonly phase: AgentCredentialPhase;
  readonly projectId?: `prj_${string}`;
  readonly registrationId: `areg_${string}`;
  readonly revokedAt?: string;
  readonly scope: readonly AgentScope[];
  readonly tokenDisplayPrefix: string;
  readonly userId?: `usr_${string}`;
};

export type AgentClaimAttemptStatus =
  | "confirmed"
  | "denied"
  | "expired"
  | "pending"
  | "superseded";

export type AgentClaimAttempt = {
  readonly claimAttemptId: `aclaim_${string}`;
  readonly confirmedAt?: string;
  readonly createdAt: string;
  readonly email?: string;
  readonly expiresAt: string;
  readonly lastPollAt?: string;
  readonly pollIntervalSeconds: number;
  readonly pollSlowdownCount: number;
  readonly registrationId: `areg_${string}`;
  readonly status: AgentClaimAttemptStatus;
};

export type AgentProviderBindingStatus =
  | "active"
  | "disabled"
  | "pending_first_link"
  | "revoked";

export type AgentProviderBinding = {
  readonly approvedAt?: string;
  readonly approvedByUserId?: `usr_${string}`;
  readonly audience: string;
  readonly bindingId: `apbind_${string}`;
  readonly disabledAt?: string;
  readonly issuer: string;
  readonly orgId: `org_${string}`;
  readonly projectId: `prj_${string}`;
  readonly providerId: `agp_${string}`;
  readonly revokedAt?: string;
  readonly scopeCeiling: readonly AgentScope[];
  readonly status: AgentProviderBindingStatus;
  readonly subject: string;
  readonly userId: `usr_${string}`;
};

export type AgentTrustedProvider = {
  readonly allowedRegistrationModes: readonly AgentRegistrationType[];
  readonly audiences: readonly string[];
  readonly createdAt: string;
  readonly defaultScopes: readonly AgentScope[];
  readonly disabledAt?: string;
  readonly enabled: boolean;
  readonly issuer: string;
  readonly jwksUri: string;
  readonly maxScopes: readonly AgentScope[];
  readonly name: string;
  readonly providerId: `agp_${string}`;
  readonly updatedAt: string;
};

export type AgentProviderKeyCacheEntry = {
  readonly expiresAt: string;
  readonly fetchedAt: string;
  readonly issuer: string;
  readonly jwk: Readonly<Record<string, unknown>>;
  readonly jwksUri: string;
  readonly kid: string;
  readonly providerId: `agp_${string}`;
};

export type AgentProviderAssertionReplay = {
  readonly assertionExpiresAt: string;
  readonly audience: string;
  readonly issuer: string;
  readonly jti: string;
  readonly providerId: `agp_${string}`;
  readonly seenAt: string;
  readonly status: "accepted" | "expired" | "replayed";
  readonly subject: string;
};

export type AgentSecurityEventRecord = {
  readonly audience?: string;
  readonly errorCode?: string;
  readonly eventId: string;
  readonly eventTypes: readonly string[];
  readonly issuer: string;
  readonly jti: string;
  readonly processedAt?: string;
  readonly providerId: `agp_${string}`;
  readonly receivedAt: string;
  readonly status: "accepted" | "failed" | "ignored";
  readonly subject?: string;
};

export type AgentSigningKey = {
  readonly activatedAt?: string;
  readonly createdAt: string;
  readonly disabledAt?: string;
  readonly keyId: string;
  readonly notAfter?: string;
  readonly privateKeySecretName?: string;
  readonly publicJwk: Readonly<Record<string, unknown>>;
  readonly retiringAt?: string;
  readonly status: "current" | "disabled" | "retiring";
};

export type AgentAccessDashboardRegistration = AgentRegistration & {
  readonly activeCredentialCount: number;
  readonly credentials: readonly AgentCredential[];
};
