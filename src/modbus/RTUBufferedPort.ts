import { EventEmitter } from "events";
import { SerialPort } from "serialport";

function crc16(buffer) {
    let crc = 0xFFFF;
    let odd;

    for (let i = 0; i < buffer.length; i++) {
        crc = crc ^ buffer[i];

        for (let j = 0; j < 8; j++) {
            odd = crc & 0x0001;
            crc = crc >> 1;
            if (odd) {
                crc = crc ^ 0xA001;
            }
        }
    }

    return crc;
};

/* TODO: const should be set once, maybe */
const EXCEPTION_LENGTH = 5;
const MIN_DATA_LENGTH = 6;
const MIN_WRITE_DATA_LENGTH = 4;
const MAX_BUFFER_LENGTH = 256;
const CRC_LENGTH = 2;
const READ_DEVICE_IDENTIFICATION_FUNCTION_CODE = 43;
const REPORT_SERVER_ID_FUNCTION_CODE = 17;
const LENGTH_UNKNOWN = "unknown";
const BITS_TO_NUM_OF_OBJECTS = 7;

interface FC43Result {
    hasAllData: boolean;
    bufLength?: number;
}

// Helper function -> Bool
// BIT | TYPE
// 8 | OBJECTID
// 9 | length of OBJECTID
// 10 -> n | the object
// 10 + n + 1 | new object id
const calculateFC43Length = (buffer: Buffer, numObjects: number, i: number, bufferLength: number): FC43Result => {
    const result: FC43Result = { hasAllData: true };
    let currentByte = 8 + i; // current byte starts at object id.
    if (numObjects > 0) {
        for (let j = 0; j < numObjects; j++) {
            if (bufferLength < currentByte) {
                result.hasAllData = false;
                break;
            }
            const objLength = buffer[currentByte + 1];
            if (!objLength) {
                result.hasAllData = false;
                break;
            }
            currentByte += 2 + objLength;
        }
    }
    if (currentByte + CRC_LENGTH > bufferLength) {
        // still waiting on the CRC!
        result.hasAllData = false;
    }
    if (result.hasAllData) {
        result.bufLength = currentByte + CRC_LENGTH;
    }
    return result;
};

export class RTUBufferedPort extends EventEmitter {
    private _buffer: Buffer;
    private _id: number;
    private _cmd: number;
    private _length: number | string;
    private _client: SerialPort;

    /**
     * Simulate a modbus-RTU port using buffered serial connection.
     *
     * @param path
     * @param options
     * @constructor
     */
    constructor(options: any) {
        super();

        // internal buffer
        this._buffer = Buffer.alloc(0);
        this._id = 0;
        this._cmd = 0;
        this._length = 0;

        // create the SerialPort
        this._client = new SerialPort(options);

        // attach an error listner on the SerialPort object
        this._client.on("error", (error: Error) => {
            this.emit("error", error);
        });

        // attach a close listner on the SerialPort object
        this._client.on("close", () => {
            this.emit("close");
        });

        // register the port data event
        this._client.on("data", (data: Buffer) => {
            // add data to buffer
            this._buffer = Buffer.concat([this._buffer, data]);


            // check if buffer include a complete modbus answer
            const expectedLength = this._length;
            let bufferLength = this._buffer.length;

            // if expected length is unknown, we need to check the buffer length
            // check data length
            if (expectedLength !== LENGTH_UNKNOWN &&
                (expectedLength as number) < MIN_DATA_LENGTH ||
                bufferLength < EXCEPTION_LENGTH
            ) { return; }

            // check buffer size for MAX_BUFFER_SIZE
            if (bufferLength > MAX_BUFFER_LENGTH) {
                this._buffer = this._buffer.slice(-MAX_BUFFER_LENGTH);
                bufferLength = MAX_BUFFER_LENGTH;
            }

            // loop and check length-sized buffer chunks
            const maxOffset = bufferLength - EXCEPTION_LENGTH;

            for (let i = 0; i <= maxOffset; i++) {
                const unitId = this._buffer[i];
                const functionCode = this._buffer[i + 1];

                // Hack: Special handling for unitId 0x51
                if (unitId === 0x51 && this._id === 0x81) {
                    if (functionCode === this._cmd) {
                        let frameLength: number;

                        if (typeof this._length === 'string' || i + this._length > bufferLength) {
                            return;
                        }
                        frameLength = this._length;

                        const adjustedBuffer = this._adjustBufferFor0x51(this._buffer, i, frameLength);
                        this.emit("data", adjustedBuffer);
                        this._buffer = this._buffer.slice(i + frameLength);
                        return;
                    }
                }

                // check if unitId matches
                if (unitId !== this._id) continue;
                if (functionCode === this._cmd && functionCode === READ_DEVICE_IDENTIFICATION_FUNCTION_CODE) {
                    if (bufferLength <= BITS_TO_NUM_OF_OBJECTS + i) {
                        return;
                    }
                    const numObjects = this._buffer[7 + i];
                    const result = calculateFC43Length(this._buffer, numObjects, i, bufferLength);
                    if (result.hasAllData) {
                        this._emitData(i, result.bufLength!);
                        return;
                    }
                } else if (functionCode === this._cmd && functionCode === REPORT_SERVER_ID_FUNCTION_CODE) {
                    const contentLength = this._buffer[i + 2];
                    this._emitData(i, contentLength + 5); // length + serverID + status + contentLength + CRC
                    return;
                } else {
                    if (functionCode === this._cmd && i + (expectedLength as number) <= bufferLength) {
                        this._emitData(i, expectedLength as number);
                        return;
                    }
                    if (functionCode === (0x80 | this._cmd) && i + EXCEPTION_LENGTH <= bufferLength) {
                        this._emitData(i, EXCEPTION_LENGTH);
                        return;
                    }
                }

                // frame header matches, but still missing bytes pending
                if (functionCode === (0x7f & this._cmd)) break;
            }
        });
    }

    /**
     * Hack: Adjust buffer for unitId 0x51 and recalculate CRC
     * 
     * @param {Buffer} buffer The original buffer
     * @param {number} start The start index
     * @param {number} length The length of the frame
     * @returns {Buffer} The adjusted buffer
     */
    private _adjustBufferFor0x51(buffer: Buffer, start: number, length: number): Buffer {
        const frame = buffer.slice(start, start + length);
        const adjustedFrame = Buffer.from(frame);

        // 调整unitId为期望的ID
        adjustedFrame[0] = this._id;

        // 重新计算CRC (去掉最后2字节的旧CRC)
        const dataWithoutCrc = adjustedFrame.slice(0, -2);
        const newCrc = crc16(dataWithoutCrc);

        // 写入新的CRC (小端序)
        adjustedFrame.writeUInt16LE(newCrc, adjustedFrame.length - 2);

        return adjustedFrame;
    }

    /**
     * Check if port is open.
     *
     * @returns {boolean}
     */
    get isOpen(): boolean {
        return this._client.isOpen;
    }

    /**
     * Emit the received response, cut the buffer and reset the internal vars.
     *
     * @param {number} start The start index of the response within the buffer.
     * @param {number} length The length of the response.
     * @private
     */
    private _emitData(start: number, length: number): void {
        const buffer = this._buffer.slice(start, start + length);
        this.emit("data", buffer);
        this._buffer = this._buffer.slice(start + length);
    }

    /**
     * Simulate successful port open.
     *
     * @param callback
     */
    open(callback?: ErrorCallback): void {
        this._client.open(callback);
    }

    /**
     * Simulate successful close port.
     *
     * @param callback
     */
    close(callback?: ErrorCallback): void {
        this._client.close(callback);
        this.removeAllListeners("data");
    }

    /**
     * Send data to a modbus slave.
     *
     * @param {Buffer} data
     */
    write(data: Buffer): void {
        if (data.length < MIN_WRITE_DATA_LENGTH) {
            return;
        }

        let length: number | null = null;

        // remember current unit and command
        this._id = data[0];
        this._cmd = data[1];

        // calculate expected answer length
        switch (this._cmd) {
            case 1:
            case 2:
                length = data.readUInt16BE(4);
                this._length = 3 + parseInt(((length - 1) / 8 + 1).toString()) + 2;
                break;
            case 3:
            case 4:
                length = data.readUInt16BE(4);
                this._length = 3 + 2 * length + 2;
                break;
            case 5:
            case 6:
            case 15:
            case 16:
                this._length = 6 + 2;
                break;
            case 17:
                // response is device specific
                this._length = LENGTH_UNKNOWN;
                break;
            case 43:
                // this function is super special
                // you know the format of the code response
                // and you need to continuously check that all of the data has arrived before emitting
                // see onData for more info.
                this._length = LENGTH_UNKNOWN;
                break;
            default:
                // raise and error ?
                this._length = 0;
                break;
        }

        // send buffer to slave
        this._client.write(data);

        // modbusSerialDebug({
        //     action: "send serial rtu buffered",
        //     data: data,
        //     unitid: this._id,
        //     functionCode: this._cmd,
        //     length: this._length
        // });
    }
}

/**
 * RTU buffered port for Modbus.
 *
 * @type {RTUBufferedPort}
 */
export default RTUBufferedPort;
