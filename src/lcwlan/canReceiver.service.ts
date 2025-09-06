import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { TcpCanClient } from "./tcpClient";
import { CanFrame, FrameMatcher, MatcherHandler } from "./types";

@Injectable()
export class CanReceiverService implements OnModuleInit {
    private readonly logger = new Logger(CanReceiverService.name);
    private matchers: MatcherHandler[] = [];
    private socket: TcpCanClient;
    private socket2: TcpCanClient; // 新增第二个连接
    private isConnected = false;
    private isConnected2 = false; // 第二个连接状态
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private baseReconnectDelay = 1000; // 1秒基础延迟
    private maxReconnectDelay = 60000; // 最大60秒延迟
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isReceiving = false;
    private isReceiving2 = false; // 第二个连接接收状态

    async onModuleInit() {
        await this.connectWithRetry();
    }

    private async connectWithRetry() {
        try {
            if (this.socket) {
                try {
                    await this.socket.disconnect();
                } catch (error) {
                    // 忽略断开连接时的错误
                }
            }

            this.socket = new TcpCanClient({
                port: 8500,
                host: "192.168.8.155",
            });
            
            // 监听断开事件
            this.socket.on('disconnect', () => {
                this.logger.warn('TCP连接已断开');
                this.isConnected = false;
                this.isReceiving = false;
                this.scheduleReconnect();
            });

            this.socket.on('error', (error) => {
                this.logger.error('TCP连接错误:', error);
                this.isConnected = false;
                this.isReceiving = false;
                this.scheduleReconnect();
            });

            await this.socket.connect();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.logger.log("CAN Receiver Service initialized and connected to socket.");
            
            // 启动帧接收
            this.startReceiving();
        } catch (error) {
            this.logger.error('连接失败:', error);
            this.isConnected = false;
            this.scheduleReconnect();
        }
    }

    private startReceiving() {
        if (this.isReceiving) return;
        
        this.isReceiving = true;
        this.receiveFrames().catch(error => {
            this.logger.error('接收帧时发生错误:', error);
            this.isReceiving = false;
            if (this.isConnected) {
                this.scheduleReconnect();
            }
        });
    }

    private startReceiving2() {
        if (this.isReceiving2) return;
        
        this.isReceiving2 = true;
        this.receiveFrames2().catch(error => {
            this.logger.error('第二个连接接收帧时发生错误:', error);
            this.isReceiving2 = false;
        });
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error(`重连失败，已达到最大重试次数 ${this.maxReconnectAttempts}`);
            return;
        }

        const delay = Math.min(
            this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelay
        );

        this.reconnectAttempts++;
        this.logger.log(`${delay}ms 后进行第 ${this.reconnectAttempts} 次重连尝试`);

        this.reconnectTimer = setTimeout(async () => {
            await this.connectWithRetry();
        }, delay);
    }

    // 手动重连
    async reconnect() {
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.socket) {
            try {
                this.socket.disconnect();
            } catch (error) {
                // 忽略断开连接时的错误
            }
        }
        
        await this.connectWithRetry();
    }

    // 手动连接第二个端口
    async connectSecondPort(): Promise<boolean> {
        if (this.isConnected2) {
            this.logger.warn('第二个端口已经连接');
            return true;
        }

        try {
            if (this.socket2) {
                try {
                    await this.socket2.disconnect();
                } catch (error) {
                    // 忽略断开连接时的错误
                }
            }

            this.socket2 = new TcpCanClient({
                port: 8400,
                host: "192.168.8.155",
            });

            // 监听第二个连接的断开事件
            this.socket2.on('disconnect', () => {
                this.logger.warn('第二个TCP连接已断开');
                this.isConnected2 = false;
                this.isReceiving2 = false;
            });

            this.socket2.on('error', (error) => {
                this.logger.error('第二个TCP连接错误:', error);
                this.isConnected2 = false;
                this.isReceiving2 = false;
            });

            await this.socket2.connect();
            this.isConnected2 = true;
            this.logger.log("第二个CAN连接已建立 (端口: 8400)");

            // 启动第二个连接的帧接收
            this.startReceiving2();
            return true;
        } catch (error) {
            this.logger.error('第二个端口连接失败:', error);
            this.isConnected2 = false;
            return false;
        }
    }

    // 手动断开第二个端口
    async disconnectSecondPort(): Promise<void> {
        if (!this.isConnected2 || !this.socket2) {
            this.logger.warn('第二个端口未连接');
            return;
        }

        try {
            this.isConnected2 = false;
            this.isReceiving2 = false;
            await this.socket2.disconnect();
            this.logger.log("第二个CAN连接已断开");
        } catch (error) {
            this.logger.error('断开第二个端口时发生错误:', error);
        }
    }

    // 获取连接状态
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            isReceiving: this.isReceiving,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            socketConnected: this.socket?.getConnectionStatus() || false,
            // 新增第二个连接状态
            isConnected2: this.isConnected2,
            isReceiving2: this.isReceiving2,
            socket2Connected: this.socket2?.getConnectionStatus() || false
        };
    }

    private async receiveFrames() {
        for await (const frame of this.socket.receiveFrames()) {
            this.handleFrame(frame);
        }
    }

    private async receiveFrames2() {
        for await (const frame of this.socket2.receiveFrames()) {
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

    // 发送帧到指定连接
    async sendFrame(frame: CanFrame, useSecondPort: boolean = false): Promise<void> {
        const targetSocket = useSecondPort ? this.socket2 : this.socket;
        const isTargetConnected = useSecondPort ? this.isConnected2 : this.isConnected;

        if (!isTargetConnected || !targetSocket) {
            throw new Error(`目标连接${useSecondPort ? '(端口8400)' : '(端口8500)'}未建立`);
        }

        return targetSocket.sendFrame(frame);
    }
}