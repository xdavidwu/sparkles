interface ConnectionConfig {
  basePath: string,
  accessToken?: string | null,
  impersonation: { asUser?: string, asGroup?: string },
}

declare function _helm_configConnection(config: ConnectionConfig): void;
declare function _helm_renderTemplate(charts: Array<string>, values: string): Promise<string>;
