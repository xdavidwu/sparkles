import { SftpClientCore, MAX_READ_BLOCK_LENGTH } from '@xdavidwu/websocket-sftp/lib/sftp-client';
import type { IChannel } from '@xdavidwu/websocket-sftp/lib/channel';
import type { IFilesystem } from '@xdavidwu/websocket-sftp/lib/fs-api';
import type { SftpStatusCode } from '@xdavidwu/websocket-sftp/lib/sftp-enums';
import { Buffer } from 'buffer';
import { Streams } from '@/utils/wsstream';
import type { ExceptLast, Last, ParametersExceptFirst, OnlyRequired } from '@/utils/lang';

globalThis.Buffer = Buffer;

export const sftpFromWsstream = async (ws: WebSocket): Promise<SftpClientCore> => {
  ws.binaryType = 'arraybuffer';

  const sftp = new SftpClientCore();
  let buffer = Buffer.from([]);

  const channel: IChannel = {
    on: (type, callback) => {
      if (type == 'message') {
        ws.onmessage = (ev) => {
          const b = Buffer.from(ev.data as ArrayBuffer);
          if (b[0] == Streams.STDOUT && b.length > 1) {
            const msg = b.slice(1);
            buffer = Buffer.concat([buffer, msg], buffer.length + msg.length);

            while (buffer.length > 4) {
              const size = buffer[0] * 0x1000000 + buffer[1] * 0x10000 + buffer[2] * 0x100 + buffer[3];
              if (buffer.length >= size + 4) {
                console.log('packet', size, buffer.slice(0, size + 4));
                callback(buffer.slice(0, size + 4));
                buffer = buffer.slice(size + 4);
              } else {
                break;
              }
            }
          }
        };
      } else if (type == 'close') {
        ws.onclose = () => callback();
      }
      return channel;
    },
    send: (b) => {
      console.log('send', b);
      ws.send(new Uint8Array([Streams.STDIN, ...b]));
    },
    close: () => ws.close(),
  };
  channel.on('message', (b: Buffer) => sftp._process(b));
  channel.on('close', () => sftp.end());

  return new Promise((resolve, reject) => {
    ws.onopen = () => {
      sftp._init(channel, { ...console, fatal: console.log, level: () => 0 }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(sftp);
        }
      });
    };
  });
};

type SftpClientOps = keyof OnlyRequired<IFilesystem>;
type ExtractOpRes<op extends SftpClientOps> = ParametersExceptFirst<Last<Parameters<SftpClientCore[op]>>>;
type ExtractOpParams<op extends SftpClientOps> = ExceptLast<Parameters<SftpClientCore[op]>>;

export const asPromise = <T extends SftpClientOps> (
  sftp: SftpClientCore, op: T, params: ExtractOpParams<T>,
): Promise<ExtractOpRes<T>> => new Promise((resolve, reject) => {
  console.log(op, ...params);
  // @ts-expect-error spread must be used with tuple type, but not narrowed down enough (union of tuples)
  sftp[op](...params, (err, ...r) => {
    if (err) {
      reject(err);
    } else {
      resolve(r as ExtractOpRes<T>); // not narrowed down enough by ts
    }
  });
});

// lib/sftp-client, SftpClientCore.createError
export interface SftpError extends Error {
  errno: number;
  code: string;
  nativeCode: SftpStatusCode;
  description: string;

  // from SftpCommandInfo
  path?: string;
  oldPath?: string;
  newPath?: string;
  targetPath?: string;
  linkPath?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fromHandle?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toHandle?: any;
};

const chunkSize = MAX_READ_BLOCK_LENGTH;
export const readAsStream = (
  sftp: SftpClientCore, handle: Parameters<SftpClientCore['read']>[0],
  offset: number = 0, length: number = Number.POSITIVE_INFINITY,
  progress?: (offset: number) => unknown,
) => {
  let closed = false;
  return new ReadableStream({
    pull: async (ctrl) => {
      if (length > 0) {
        const wanted = length < chunkSize ? length : chunkSize;
        try {
          const [buffer, read] = await asPromise(sftp, 'read', [handle, Buffer.alloc(wanted), 0, wanted, offset]);
          if (read == 0) {
            ctrl.close();
            await asPromise(sftp, 'close', [handle]);
            closed = true;
            return;
          }
          offset += read;
          length -= read;
          progress?.(offset);
          ctrl.enqueue(buffer.subarray(0, read));
        } catch (e) {
          ctrl.close();
          await asPromise(sftp, 'close', [handle]);
          closed = true;
          throw e;
        }
      } else {
        ctrl.close();
        await asPromise(sftp, 'close', [handle]);
        closed = true;
      }
    },
    cancel: async () => {
      if (!closed) {
        await asPromise(sftp, 'close', [handle]);
      }
    },
  });
};
