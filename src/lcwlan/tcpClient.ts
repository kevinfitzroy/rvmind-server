import net from 'net';
import { SocketOptions } from './types';
import { CanFrame } from './types';
import { parseCanFrame, createCanFrame } from './canProtocol';

export class TcpCanClient {
  private socket: net.Socket;
  private buffer: Buffer = Buffer.alloc(0);
  private frameQueue: CanFrame[] = [];
  private resolveQueue: ((frame: CanFrame) => void)[] = [];

  constructor(private options: SocketOptions) {
    this.socket = new net.Socket();
    this.setupDataHandler();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.connect(this.options, () => resolve());
      this.socket.once('error', reject);
    });
  }

  // 持续监听数据流
  private setupDataHandler() {
    this.socket.on('data', (data: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      this.processBuffer();
    });
  }

  // 自动处理缓冲区中的所有完整帧
  private processBuffer() {
    while (this.buffer.length >= 13) {
      try {
        const frame = parseCanFrame(this.buffer.subarray(0, 13));
        this.buffer = this.buffer.subarray(13);

        if (this.resolveQueue.length > 0) {
          const resolve = this.resolveQueue.shift()!;
          resolve(frame);
        } else {
          this.frameQueue.push(frame);
        }
      } catch (e) {
        console.error('解析帧失败:', e);
        break;
      }
    }
  }

  // 修改后的 receiveFrames
  async *receiveFrames(): AsyncGenerator<CanFrame> {
    while (true) {
      if (this.frameQueue.length > 0) {
        yield this.frameQueue.shift()!;
      } else {
        yield await new Promise((resolve) => {
          this.resolveQueue.push(resolve);
        });
      }
    }
  }

  async sendFrame(frame: CanFrame): Promise<void> {
    const buffer = createCanFrame(frame);
    console.log('Sending frame:', buffer);
    return new Promise((resolve, reject) => {
      this.socket.write(buffer, (err) => {
        err ? reject(err) : resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.end(() => resolve());
    });
  }
}
