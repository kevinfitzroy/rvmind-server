
import ModbusRTU from "modbus-serial";
const client = new ModbusRTU();
async function main_modbus_rtu() {
    await client.connectRTUBuffered("/dev/ttyS9", { baudRate: 115200,parity: 'none', stopBits: 1, dataBits: 8 });
    client.setTimeout(2000);
    await write(65);
    await new Promise(resolve => setTimeout(resolve, 500));
    await write(1);
    await new Promise(resolve => setTimeout(resolve, 500));
    await write(97);
    // for (let i = 0; i < 128; i++) {
    //    sleep 500ms
    // }
}

async function write(id) {
    client.setID(id);
    try{
        const data = await client.readCoils(0, 8)
        console.log("************Read coils id:", id, data.data);
    }catch(err) {
        console.error("Error reading coils id:", id, err);
    }
    // write the values 0, 0xffff to registers starting at address 5
    // on device number 1.
    // client.writeRegisters(5, [0, 0xffff]).then(read);
    // client.readCoils(0, 8).then((data) => {
    //     console.log("************Read coils:", data.data);
    // }).catch((err) => {
    //     console.error("Error reading coils id:", id);
    // });
}

main_modbus_rtu();