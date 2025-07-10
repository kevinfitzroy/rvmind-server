import { Socket } from 'net';
import { EventEmitter } from 'events';
import { SocketOptions } from './types';
import { CanFrame } from './types';
import { parseCanFrame, createCanFrame } from './canProtocol';

export class TcpCanClient extends EventEmitter {
  private socket: Socket;
  private buffer: Buffer = Buffer.alloc(0);
  private frameQueue: CanFrame[] = [];
  private resolveQueue: ((frame: CanFrame) => void)[] = [];
  private isConnected = false;

  constructor(private options: SocketOptions) {
    super();
    this.socket = new Socket();
    this.setupEventHandlers();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.connect(this.options, () => {
        this.isConnected = true;
        resolve();
      });
      this.socket.once('error', reject);
    });
  }

  // 设置事件处理器
  private setupEventHandlers() {
    this.socket.on('data', (data: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      this.processBuffer();
    });

    this.socket.on('close', () => {
      this.isConnected = false;
      this.emit('disconnect');
      // 清理待处理的Promise
      this.resolveQueue.forEach(resolve => {
        // 可以传递一个特殊的错误帧或null来指示连接断开
      });
      this.resolveQueue = [];
    });

    this.socket.on('error', (error) => {
      this.isConnected = false;
      this.emit('error', error);
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

  // 修改后的 receiveFrames，添加连接状态检查
  async *receiveFrames(): AsyncGenerator<CanFrame> {
    while (this.isConnected) {
      if (this.frameQueue.length > 0) {
        yield this.frameQueue.shift()!;
      } else {
        try {
          const frame = await new Promise<CanFrame>((resolve, reject) => {
            if (!this.isConnected) {
              reject(new Error('连接已断开'));
              return;
            }
            this.resolveQueue.push(resolve);
          });
          yield frame;
        } catch (error) {
          // 连接断开时退出生成器
          break;
        }
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
    this.isConnected = false;
    return new Promise((resolve) => {
      this.socket.end(() => resolve());
    });
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}
