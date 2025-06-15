import { FrameFormat, FrameType, CanFrame } from './types';

const FRAME_SIZE = 13;
const MAX_DLC = 8;

export function createCanFrame(frame: CanFrame): Uint8Array {
  validateFrame(frame);

  const canFrame = new Uint8Array(FRAME_SIZE);
  // Frame Info
  canFrame.set(
    Uint8Array.from([
      (frame.format << 7) | (frame.type << 6) | (frame.dlc & 0x0f),
    ]),
    0,
  );

  // Frame ID
  const idBuffer = new ArrayBuffer(4);
  const view = new DataView(idBuffer);
  view.setUint32(0, frame.id);
  canFrame.set(new Uint8Array(idBuffer), 1);

  // Data
  canFrame.set(frame.data, 5);
  return canFrame;
}

export function parseCanFrame(buffer: Buffer): CanFrame {
  if (buffer.length !== FRAME_SIZE) {
    throw new Error(
      `CAN Frame must be 13 bytes, current length: ${buffer.length}`,
    );
  }

  const infoByte = buffer[0];
  const format: FrameFormat = (infoByte >> 7) & 0x01;
  const type: FrameType = (infoByte >> 6) & 0x01;
  const dlc = infoByte & 0x0f;

  if (dlc > 8) {
    throw new Error(`unvalid DLC value: ${dlc}, allowed range 0-8`);
  }

  // resolve 4 bytes for ID, 2nd byte to 5th byte
  // 1st byte is reserved for frame info
  // 2nd byte to 5th byte , big endian
  const idBuffer = new Uint8Array(4);
  buffer.copy(idBuffer, 0, 1, 5);
  const idView = new DataView(idBuffer.buffer);
  let id = idView.getUint32(0);

  switch (format) {
    case FrameFormat.STD:
      id &= 0x7ff; // standard frame reserve 11 bits
      if (id > 0x7ff) {
        throw new Error(
          `Standard Frame ID out of range (0x${id.toString(16)} > 0x7FF)`,
        );
      }
      break;
    case FrameFormat.EXT:
      id &= 0x1fffffff; // extend frame reserve 29 bits
      if (id > 0x1fffffff) {
        throw new Error(
          `Extended Frame ID out of range (0x${id.toString(16)} > 0x1FFFFFFF)`,
        );
      }
      break;
  }

  // reserve 8 bytes for data, 6th byte to 13th byte
  const dataBytes = buffer.subarray(5, 5 + 8);
  const validData = dataBytes.subarray(0, dlc);

  return {
    format,
    type,
    dlc,
    id,
    data: validData,
  };
}

function validateFrame(frame: CanFrame): void {
  if (frame.dlc > MAX_DLC || frame.dlc < 0) {
    throw new Error(`DLC must be between 0-${MAX_DLC}`);
  }
  if (frame.format === FrameFormat.STD && frame.id > 0x7ff) {
    throw new Error('Standard ID must be <= 0x7FF');
  }
  if (frame.format === FrameFormat.EXT && frame.id > 0x1fffffff) {
    throw new Error('Extended ID must be <= 0x1FFFFFFF');
  }
}
2;
