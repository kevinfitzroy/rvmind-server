import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { TcpCanClient } from "./tcpClient";
import { CanFrame, FrameMatcher, MatcherHandler } from "./types";

@Injectable()
export class CanReceiverService implements OnModuleInit {
    private readonly logger = new Logger(CanReceiverService.name);
    private matchers: MatcherHandler[] = [];
    private socket: TcpCanClient;

    async onModuleInit() {
        this.socket = new TcpCanClient({
            port: 8500,
            host: "192.168.8.155",
        });
        await this.socket.connect();
        this.logger.log("CAN Receiver Service initialized and connected to socket.");
        this.receiveFrames().catch(error => {
            this.logger.error('接收帧时发生错误:', error);
        });
    }

    private async receiveFrames() {
        for await (const frame of this.socket.receiveFrames()) {
            this.handleFrame(frame);
        }
    }

    // 注册通用匹配器
    registerMatcher(matcher: FrameMatcher, callback: (frame: CanFrame) => void) {
        this.matchers.push({
            matcher,
            callback,
        });
    }

    private handleFrame(frame: CanFrame) {
        for (const { matcher, callback } of this.matchers) {
            if (matcher(frame)) {
                try {
                    callback(frame);
                } catch (error) {
                    this.logger.error(`处理报文时出错: ${error.message}`);
                }
            }
        }
    }
}