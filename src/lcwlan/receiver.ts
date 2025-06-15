import { TcpCanClient } from './tcpClient';
import { CanFrame } from './types';

export type FrameMatcher = (frame: CanFrame) => boolean;
type MatcherHandler = {
  matcher: FrameMatcher;
  callback: (frame: CanFrame) => void;
};
interface PendingRequest {
  resolve: (frames: CanFrame) => void;
  reject: (reason: Error) => void;
  matcher: FrameMatcher;
  timeout: number;
  timestamp: number;
}

export class FrameReceiver {
  //临时订阅，用于期待有响应的情况
  private pendingRequests = new Map<symbol, PendingRequest>();
  private cleanupInterval: NodeJS.Timeout;
  private matchers: MatcherHandler[] = [];

  constructor(
    private socket: TcpCanClient,
    private timeout = 3000,
  ) {
    this.cleanupInterval = setInterval(() => this.cleanup(), 1000);
    this.init();
  }

  async init() {
    for await (const frame of this.socket.receiveFrames()) {
      this.handleFrame(frame);
      console.log('received frame:', frame);
    }
  }

  // 注册通用匹配器
  // 长期订阅
  registerMatcher(matcher: FrameMatcher, callback: (frame: CanFrame) => void) {
    this.matchers.push({
      matcher,
      callback,
    });
  }

  // 发送请求并等待响应
  async request(
    matcher: FrameMatcher,
    collectTimeout = this.timeout,
  ): Promise<CanFrame> {
    return new Promise((resolve, reject) => {
      const requestId = Symbol();

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        matcher,
        timeout: collectTimeout,
        timestamp: Date.now(),
      });
    });
  }

  // 处理接收到的帧
  handleFrame(frame: CanFrame) {
    // 处理等待中的请求
    for (const [id, req] of this.pendingRequests) {
      if (req.matcher(frame)) {
        req.resolve(frame); // 立即返回第一个匹配的帧
        // delete this id from pendingRequests
        this.pendingRequests.delete(id);
      }
    }
    console.log('rt frame:', frame);
    // 处理订阅匹配器
    for (const { matcher, callback } of this.matchers) {
      if (matcher(frame)) {
        callback(frame);
      }
    }
  }

  private cleanup() {
    const now = Date.now();

    // 清理超时请求
    for (const [id, req] of this.pendingRequests) {
      if (now - req.timestamp > req.timeout) {
        req.reject(new Error('request timeout'));
        this.pendingRequests.delete(id);
      }
    }
  }
}
