declare function listReleasesForNamespace(namespace: string): Promise<string>;

interface ConnectionConfig {
  basePath: string,
  accessToken?: string | null,
  impersonation: { asUser?: string, asGroup?: string },
}

declare function configConnection(config: ConnectionConfig): void;
