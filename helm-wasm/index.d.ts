interface ConnectionConfig {
  basePath: string,
  accessToken?: string | null,
  impersonation: { asUser?: string, asGroup?: string },
}

declare function configConnection(config: ConnectionConfig): void;
declare function renderTemplate(charts: Array<string>, values: string): Promise<string>;
