import {
  AuthenticationV1Api, AuthenticationV1beta1Api,
  V1StatusFromJSON,
  type V1SelfSubjectReview,
  Configuration, FetchError, ResponseError,
  type InitOverrideFunction, type HTTPRequestInit, type HTTPHeaders, type RequestContext, type Middleware,
} from '@xdavidwu/kubernetes-client-typescript-fetch';

/*
 * enums in openapi codegen uses exhaustive enums on types,
 * which is not forward-compatible, thus trimmed for now
 * https://github.com/kubernetes/kubernetes/issues/109177
 *
 * let's add it back by hand without wiring up types
 */

// meta/v1

export enum V1IncludeObjectPolicy {
  NONE = 'None',
  METADATA = 'Metadata',
  OBJECT = 'Object',
}

// XXX kubernetes does not really use type alias on meta/v1 yet, but has
// k8s.io/apimachinery/pkg/watch.EventType on watch.Event
// is ERROR used on-wire?
export enum V1WatchEventType {
  ADDED = 'ADDED',
  MODIFIED = 'MODIFIED',
  DELETED = 'DELETED',
  BOOKMARK = 'BOOKMARK',
}

export enum V1StatusStatus {
  SUCCESS = 'Success',
  FAILURE = 'Failure',
}

export enum V1StatusReason {
  UNKNOWN = '',
  UNAUTHORIZED = 'Unauthorized',
  FORBIDDEN = 'Forbidden',
  NOT_FOUND = 'NotFound',
  ALREADY_EXISTS = 'AlreadyExists',
  CONFLICT = 'Conflict',
  GONE = 'Gone',
  INVALID = 'Invalid',
  SERVER_TIMEOUT = 'ServerTimeout',
  TIMEOUT = 'Timeout',
  TOO_MANY_REQUESTS = 'TooManyRequests',
  BAD_REQUESTS = 'BadRequests',
  METHOD_NOT_ALLOWED = 'MethodNotAllowed',
  NOT_ACCEPTABLE = 'NotAcceptable',
  REQUEST_ENTITY_TOO_LARGE = 'RequestEntityTooLarge',
  UNSUPPORTED_MEDIA_TYPE = 'UnsupportedMediaType',
  INTERNAL_ERROR = 'InternalError',
  EXPIRED = 'Expired',
  SERVICE_UNAVAILABLE = 'ServiceUnavailable',
}

// core/v1

export enum V1PodStatusPhase {
  PENDING = 'Pending',
  RUNNING = 'Running',
  SUCCEEDED = 'Succeeded',
  FAILED = 'Failed',
  UNKNOWN = 'Unknown',
}

export enum V1ConditionStatus {
  TRUE = 'True',
  FALSE = 'False',
  UNKNOWN = 'Unknown',
}

// batch/v1

export enum V1JobConditionType {
  SUSPENDED = 'Suspended',
  COMPLETE = 'Complete',
  FAILED = 'Failed',
  FAILURE_TARGET = 'FailureTarget',
  SUCCESS_CRITERIA_MET = 'SuccessCriteriaMet',
}

// apiextensions/v1

export enum V1CustomResourceDefinitionConditionType {
  ESTABLISHED = 'Established',
  NAMES_ACCEPTED = 'NamesAccepted',
  NON_STRUCTURAL_SCHEMA = 'NonStructuralSchema',
  TERMINATING = 'Terminating',
  KUBERNETES_API_APPROVAL_POLICY_CONFORMANT = 'KubernetesAPIApprovalPolicyConformant',
}

export type ChainableInitOverrideFunction = (...p: Parameters<InitOverrideFunction>) =>
  (Promise<Awaited<ReturnType<InitOverrideFunction>> & HTTPRequestInit & { headers: HTTPHeaders }>);

const overrideHeader = (key: string, value: string): ChainableInitOverrideFunction =>
  async (context) => {
    const overridden = {
      ...context.init,
      headers: context.init.headers ?? {},
    };
    overridden.headers[key] = value;
    return overridden;
  };

export const asYAML = overrideHeader('Accept', 'application/yaml');
export const fromYAML = overrideHeader('Content-Type', 'application/yaml');
export const fromYAMLSSA = overrideHeader('Content-Type', 'application/apply-patch+yaml');

interface ConditionConvention {
  type: string;
  status: string;
}

export const matchCondition = (
  conditions: (Array<ConditionConvention> | undefined),
  condition: string, status: V1ConditionStatus,
): boolean => conditions?.some((c) => c.type === condition && c.status === status) ?? false;

export const hasCondition = (
  object: { status?: { conditions?: Array<ConditionConvention> }},
  condition: string, status: V1ConditionStatus,
): boolean => matchCondition(object.status?.conditions, condition, status);

const identityOverrideFn: InitOverrideFunction = async ({ init }) => init;

export const chainOverrideFunction = (
  a: ChainableInitOverrideFunction,
  b?: RequestInit | InitOverrideFunction,
): InitOverrideFunction =>
  async (c) => {
    const fn = b === undefined ? identityOverrideFn : (
      typeof b === 'function' ? b : async () => b);
    return await fn({ init: await a(c), context: c.context });
  };

export class ExtractedRequestContext {
  constructor(public context: RequestContext) {}
}

export const extractRequestContext: Middleware['pre'] = (context) => {
  throw new ExtractedRequestContext(context);
};

// setting UA does not work on chromium, thus explicit setting is needed
// https://crbug.com/571722
export const setFieldManager: Middleware['pre'] = async (context) => {
  switch (context.init.method) {
  case 'POST':
  case 'PUT':
  case 'PATCH':
    break;
  default:
    return;
  }

  const url = new URL(context.url, origin);
  const params = url.searchParams;
  // allow to override for e.g. helm
  if (params.get('fieldManager') == null) {
    params.set('fieldManager', import.meta.env.VITE_APP_BRANDING ?? 'Sparkles');
    url.search = `?${params.toString()}`;
    context.url = url.toString();
  }
  return context;
};

export const setTableIncludeObjectPolicy:
  (p: V1IncludeObjectPolicy) => Middleware['pre'] = (policy) =>
    async (context) => {
      const url = new URL(context.url, origin);
      const params = url.searchParams;
      params.set('includeObject', policy);
      url.search = `?${params.toString()}`;
      context.url = url.toString();
      return context;
    };

export const errorIsResourceNotFound = async (err: unknown) => {
  if (err instanceof ResponseError && err.response.status === 404) {
    const status = V1StatusFromJSON(await err.response.json());
    if (status.status === V1StatusStatus.FAILURE && status.reason === V1StatusReason.NOT_FOUND) {
      return true;
    }
  }
  return false;
};

export const errorIsAlreadyExists = async (err: unknown) => {
  if (err instanceof ResponseError && err.response.status === 409) {
    const status = V1StatusFromJSON(await err.response.json());
    if (status.status === V1StatusStatus.FAILURE && status.reason === V1StatusReason.ALREADY_EXISTS) {
      return true;
    }
  }
  return false;
};

export const errorIsTypeUnsupported = async (err: unknown) => {
  if (err instanceof ResponseError && err.response.status === 404) {
    const status = V1StatusFromJSON(await err.response.json());
    if (status.status === V1StatusStatus.FAILURE && status.reason === V1StatusReason.NOT_FOUND &&
        status.message === 'the server could not find the requested resource') {
      return true;
    }
  }
  return false;
};

export const rawErrorIsAborted = (err: unknown) =>
  err instanceof DOMException && err.name === 'AbortError';

export const errorIsAborted = (err: unknown) =>
  err instanceof FetchError && rawErrorIsAborted(err.cause);

// v1beta1 and v1 SelfSubjectReview is actually the same
export const doSelfSubjectReview = async (config: Configuration): Promise<V1SelfSubjectReview> => {
  const v1Api = new AuthenticationV1Api(config);
  try {
    return await v1Api.createSelfSubjectReview({ body: {} });
  } catch (err) {
    if (await errorIsTypeUnsupported(err)) {
      const v1beta1Api = new AuthenticationV1beta1Api(config);
      return await v1beta1Api.createSelfSubjectReview({ body: {} });
    } else {
      throw err;
    }
  }
};

export const extractWarnings = (response: Response) => {
  if (!response.headers.has('Warning')) {
    return [];
  }
  const v = response.headers.get('Warning')!;
  console.log(`Kubernetes API Warning: ${response.url}: ${v}`);

  // warn-code SP warn-agent SP warn-text [SP warn-date], ...

  // k8s.io/apiserver/pkg/endpoints.filters/recorder.AddWaring
  // warn-code is always 299
  // warn-agent is settable, but no one use it yet, thus always -
  // warn-date is not used
  let rest = v.trim();
  const errorOut = (msg: string) => {
    throw new Error(`Invalid warning header: ${msg}: ${v}`);
  }
  const msgs = [];
  while (rest.length) {
    const agentTextDateRest = rest.substring(4);
    const textDateRest = agentTextDateRest.substring(agentTextDateRest.indexOf(' ') + 1);
    if (textDateRest[0] != '"') {
      errorOut('Expected quoted-string');
    }

    let msg = '';
    let escaped = false;
    let i = 1;
    for (;; i++) {
      if (i >= textDateRest.length) {
        errorOut('Unclosed quoted-string');
      }
      if (escaped) {
        msg += textDateRest[i];
        escaped = false;
      } else if (textDateRest[i] == '"') {
        break
      } else {
        escaped = textDateRest[i] == '\\';
        if (!escaped) {
          msg += textDateRest[i];
        }
      }
    }
    msgs.push(msg);
    i++;
    if (i >= textDateRest.length) {
      break;
    }

    if (textDateRest[i] == ',') {
      rest = textDateRest.substring(i + 1).trimStart();
    } else {
      errorOut('warn-date is not supported' + textDateRest[i]);
    }
  }
  return msgs;
};

export const serializeFetchError = (e: FetchError) => ({
  type: 'FetchError',
  cause: e.cause,
  msg: e.message,
});

export const deserializeFetchError = (e: ReturnType<typeof serializeFetchError>) =>
  new FetchError(e.cause, e.msg);

export const serializeResponseError = async (e: ResponseError) => ({
  type: 'ResponseError',
  msg: e.message,

  // fetch(body, options)
  body: await e.response.arrayBuffer(),
  status: e.response.status,
  statusText: e.response.statusText,
  headers: Array.from(e.response.headers.entries()),

  url: e.response.url,
});

export const deserializeResponseError = (e: Awaited<ReturnType<typeof serializeResponseError>>) =>
  new ResponseError(
    Object.defineProperty(new Response(e.body, e),
      'url', { value: e.url }),
    e.msg,
  );
