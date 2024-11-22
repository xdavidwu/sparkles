export const v4Channel = 'v4.channel.k8s.io';
export const v5Channel = 'v5.channel.k8s.io';
export const supportedProtocols = [
  v5Channel, v4Channel,
];

export enum Streams {
  STDIN = 0,
  STDOUT = 1,
  STDERR = 2,
  ERROR = 3,
  RESIZE = 4,
  CLOSE = 255,
}

const base64url = (s: string) => btoa(s).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\\/g, '_');

// k8s.io/kubelet/pkg/cri/streaming/remotecommand.createWebSocketStreams
export const connect = (url: string, token?: string | null) =>
  new WebSocket(url, token ? supportedProtocols.concat([
    // https://github.com/kubernetes/kubernetes/pull/47740
    `base64url.bearer.authorization.k8s.io.${base64url(token)}`
  ]) : supportedProtocols);
