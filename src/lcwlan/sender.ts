import { FrameMatcher, FrameReceiver } from "./receiver";
import { TcpCanClient } from "./tcpClient";
import { CanFrame } from "./types";

export class FrameSender {
  constructor(private receiver: FrameReceiver, private socket: TcpCanClient) {}

  // 带响应收集的发送
  async sendWithCollect(
    frame: CanFrame,
    matcher: FrameMatcher,
    timeout?: number
  ): Promise<CanFrame> {
    // regiest matcher first, than send frame
    const request = this.receiver.request((resp) => {
      return matcher(resp);
    }, timeout);
    await this.socket.sendFrame(frame);
    return request;
  }
}
