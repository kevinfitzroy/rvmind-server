import net from "net";

const client: net.Socket = net.connect(
  { port: 8400, host: "192.168.8.254" },
  () => {
    console.log("已连接到服务器");

    const frameData = createCanFrame(
      FrameFormat.STD,
      FrameType.DATA,
      8,
      0x15,
      Uint8Array.from([0x1,0x2])
    );
    console.log(frameData);

    client.write(Buffer.from(frameData));
  }
);

// 处理数据接收
client.on("data", (data: Buffer) => {
  console.log("收到服务器回复:", data.toString("utf8"));
  client.end();
});

// 处理连接关闭
client.on("end", () => {
  console.log("已断开与服务器的连接");
});

// 错误处理（建议添加）
client.on("error", (err: Error) => {
  console.error("连接错误:", err.message);
});

enum FrameType {
  DATA = 0,
  REMOTE = 1,
}

enum FrameFormat {
  STD = 0,
  EXT = 1,
}

function createFrameInfo(
  framtFormat: FrameFormat,
  frameType: FrameType,
  dlc = 8
): Uint8Array {
  if (dlc > 8 || dlc < 0) {
    throw Error("dlc must be between 0 and 8");
  }
  return Uint8Array.from([(framtFormat << 7) | (frameType << 6) | dlc]);
}
function createFrameId(id: number, frameFormat: FrameFormat): Uint8Array {
  if (id < 0) {
    throw Error("id must be greater than 0");
  }
  if (frameFormat === FrameFormat.STD && id > 0x7ff) {
    throw Error("id must be between 0 and 0x7ff");
  }
  if (frameFormat === FrameFormat.EXT && id > 0x1fffffff) {
    throw Error("id must be between 0 and 0x1fffffff");
  }

  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  // 写入 32 位有符号整数（若需无符号，请使用 setUint32）
  view.setUint32(0, id);
  return new Uint8Array(buffer);
}
function createCanFrame(
  frameFormat: FrameFormat,
  frameType: FrameType,
  dlc: number,
  id: number,
  data: Uint8Array
): Uint8Array {
  const canFrame = new Uint8Array(13);
  canFrame.set(createFrameInfo(frameFormat, frameType, dlc), 0);
  canFrame.set(createFrameId(id, frameFormat), 1);
  canFrame.set(data, 5);

  return canFrame;
}
