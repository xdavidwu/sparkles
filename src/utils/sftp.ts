import { SftpClientCore } from '@xdavidwu/websocket-sftp/lib/sftp-client';
import type { IChannel } from '@xdavidwu/websocket-sftp/lib/channel';
import type { IFilesystem } from '@xdavidwu/websocket-sftp/lib/fs-api';
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
          console.log('receive.raw', b);
          if (b[0] == Streams.STDOUT && b.length > 1) {
            console.log('receive', b);
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

const chunkSize = 16 * 1024;
export async function* readAsGenerator(
  sftp: SftpClientCore, handle: Parameters<SftpClientCore['read']>[0], offset: number, length: number,
) {
  while (length > 0) {
    const wanted = length < chunkSize ? length : chunkSize;
    const [buffer, read] = await asPromise(sftp, 'read', [handle, Buffer.alloc(wanted), 0, wanted, offset]);
    offset += read;
    length -= read;
    yield buffer;
  }
  await asPromise(sftp, 'close', [handle]);
};