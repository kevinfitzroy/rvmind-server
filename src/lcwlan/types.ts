export enum FrameType {
  DATA = 0,
  REMOTE = 1,
}

export enum FrameFormat {
  STD = 0,
  EXT = 1,
}

export interface CanFrame {
  format: FrameFormat;
  type: FrameType;
  dlc: number;
  id: number;
  data: Uint8Array;
  // timestamp: number;
}
//canFrame toString
export function canFrameToString(frame: CanFrame): string {
  const format = frame.format === FrameFormat.STD ? "STD" : "EXT";
  const type = frame.type === FrameType.DATA ? "DATA" : "REMOTE";
  const dlc = frame.dlc;
  const id = frame.id.toString(16).toUpperCase();
  const data = Array.from(frame.data)
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
  return `Format: ${format}, Type: ${type}, DLC: ${dlc}, ID: ${id}, Data: ${data}`;
}
import * as net from "net";

export type SocketOptions = net.TcpSocketConnectOpts;
