const io = require('socket.io-client');

// 连接到WebSocket服务器
const socket = io('wss://aec3-240e-878-c4-a5f5-c8c2-9dfc-8baa-10fe.ngrok-free.app/relay', {
    transports: ['websocket']
});

socket.on('connect', () => {
    console.log('✅ WebSocket 连接成功!');
    console.log('客户端ID:', socket.id);
    
    // 测试获取设备状态
    console.log('\n📡 发送获取设备状态请求...');
    socket.emit('getDeviceStatus', { deviceId: 'outdoor_light' }); // 替换为实际的设备ID
    
    // 测试订阅设备
    setTimeout(() => {
        console.log('\n📋 订阅设备...');
        socket.emit('subscribeDevice', { deviceId: 'outdoor_light' });
    }, 1000);
});

socket.on('disconnect', () => {
    console.log('❌ WebSocket 连接断开');
});

socket.on('error', (error) => {
    console.error('💥 WebSocket 错误:', error);
});

// 监听初始状态
socket.on('initialState', (data) => {
    console.log('\n🔄 接收到初始状态:', JSON.stringify(data, null, 2));
});

// 监听状态变化
socket.on('stateChanged', (event) => {
    console.log('\n🎯 状态变化事件:', JSON.stringify(event, null, 2));
});

// 监听设备状态响应
socket.on('deviceStatus', (data) => {
    console.log('\n📊 设备状态响应:', JSON.stringify(data, null, 2));
});

// 监听订阅确认
socket.on('subscribed', (data) => {
    console.log('\n✅ 订阅成功:', JSON.stringify(data, null, 2));
});

// 监听取消订阅确认
socket.on('unsubscribed', (data) => {
    console.log('\n❌ 取消订阅:', JSON.stringify(data, null, 2));
});

// 监听错误
socket.on('error', (error) => {
    console.error('\n💥 服务器错误:', JSON.stringify(error, null, 2));
});

// 保持连接并每10秒请求一次状态
setInterval(() => {
    console.log('\n🔄 定期请求设备状态...');
    socket.emit('getDeviceStatus', { deviceId: 'outdoor_light' });
}, 10000);

// 优雅退出
process.on('SIGINT', () => {
    console.log('\n👋 正在关闭连接...');
    socket.disconnect();
    process.exit(0);
});

console.log('🚀 WebSocket 测试客户端启动中...');
console.log('正在连接到: ws://localhost:3000/relay');
console.log('按 Ctrl+C 退出');
