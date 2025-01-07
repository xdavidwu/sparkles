export const managedByLabel = {
  'apps.kubernetes.io/managed-by': 'sparkles',
};

const namespace = 'sparkles.xdavidwu.link';

// on ResourceQuota to exclude from QuotasUsage
export const excludeFromVisualizationLabel = `${namespace}/exclude-from-visualization`;

// on ChartVersion to pre-fill platform-specific default Helm values
export const defaultCustomValuesAnnotation = `${namespace}/default-custom-values`;

export const tokenHandleSecretType = `${namespace}/token-handle`;
export const tokenNoteAnnotation = `token.${namespace}/note`;
export const tokenExpiresAtAnnotation = `token.${namespace}/expires-at`;

// on Pod to cache fscreds inspection
export const containerFsuidAnnotationPrefix = `fsuid.container.${namespace}/`;
export const containerFsgidAnnotationPrefix = `fsgid.container.${namespace}/`;
