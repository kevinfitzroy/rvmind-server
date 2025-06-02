# Relay Module API Documentation

该模块提供继电器设备的控制和状态监控功能，支持 RESTful API 和 WebSocket 实时通信。

## 目录

- [RESTful API](#restful-api)
- [WebSocket API](#websocket-api)
- [数据类型](#数据类型)
- [错误处理](#错误处理)
- [使用示例](#使用示例)

## RESTful API


### 设备管理

#### 获取所有设备
```http
GET /relay/devices
```

**响应示例:**
```json
[
  {
    "id": "outdoor_light",
    "name": "室外照明设备",
    "type": "ZQWL_RELAY_16",
    "description": "控制室外照明系统",
    "buttons": [
      {
        "id": "outdoor_light_btn1",
        "name": "前院灯",
        "description": "前院照明控制",
        "relayIndex": 0,
        "room": "前院"
      }
    ]
  }
]
```

#### 获取指定设备信息
```http
GET /relay/device/{deviceId}
```

**参数:**
- `deviceId`: 设备ID

**响应示例:**
```json
{
  "id": "outdoor_light",
  "name": "室外照明设备",
  "type": "ZQWL_RELAY_16",
  "address": 1,
  "port": "/dev/ttyS9",
  "description": "控制室外照明系统",
  "buttons": [...]
}
```

#### 获取设备继电器状态
```http
GET /relay/device/{deviceId}/relay-state
```

**响应示例:**
```json
[1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
```

#### 获取设备输入状态
```http
GET /relay/device/{deviceId}/input-state
```

**响应示例:**
```json
[0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
```

#### 获取设备在线状态
```http
GET /relay/device/{deviceId}/online-status
```

**响应示例:**
```json
{
  "success": true,
  "deviceId": "outdoor_light",
  "isOnline": true
}
```

### 房间管理

#### 获取房间分组
```http
GET /relay/rooms
```

**响应示例:**
```json
{
  "rooms": [
    {
      "name": "前院",
      "buttons": [
        {
          "buttonId": "outdoor_light_btn1",
          "deviceId": "outdoor_light",
          "name": "前院灯"
        }
      ]
    },
    {
      "name": "后院",
      "buttons": [...]
    }
  ]
}
```

### 继电器控制

#### 通过设备ID控制继电器

**打开继电器:**
```http
POST /relay/device/{deviceId}/{relayId}/on
```

**关闭继电器:**
```http
POST /relay/device/{deviceId}/{relayId}/off
```

**参数:**
- `deviceId`: 设备ID
- `relayId`: 继电器索引 (0-15)

**响应示例:**
```json
{
  "success": true
}
```

#### 通过按钮ID控制

**打开按钮:**
```http
POST /relay/buttons/{buttonId}/on
```

**关闭按钮:**
```http
POST /relay/buttons/{buttonId}/off
```

**参数:**
- `buttonId`: 按钮ID

**响应示例:**
```json
{
  "success": true,
  "data": {
    "buttonId": "outdoor_light_btn1",
    "deviceId": "outdoor_light",
    "state": "ON"
  }
}
```

## WebSocket API

### 连接信息
```
ws://localhost:3000/relay
```

### 客户端事件 (发送到服务器)

#### 获取设备状态
```javascript
socket.emit('getDeviceStatus', { deviceId: 'outdoor_light' });
```

#### 订阅设备状态变化
```javascript
socket.emit('subscribeDevice', { deviceId: 'outdoor_light' });
```

#### 取消订阅设备
```javascript
socket.emit('unsubscribeDevice', { deviceId: 'outdoor_light' });
```

### 服务器事件 (从服务器接收)

#### 连接时初始状态
```javascript
socket.on('initialState', (data) => {
  console.log('初始状态:', data);
});
```

**数据格式:**
```json
{
  "deviceId": "outdoor_light",
  "relayStates": [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "inputStates": [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "isOnline": true,
  "timestamp": 1703749200000
}
```

#### 状态变化通知
```javascript
socket.on('stateChanged', (event) => {
  console.log('状态变化:', event);
});
```

**数据格式:**
```json
{
  "deviceId": "outdoor_light",
  "address": 1,
  "port": "/dev/ttyS9",
  "relayStates": [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "inputStates": [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "timestamp": 1703749200000,
  "changedRelayIndexes": [0, 2],
  "changedInputIndexes": [1]
}
```

#### 设备状态响应
```javascript
socket.on('deviceStatus', (data) => {
  console.log('设备状态:', data);
});
```

#### 订阅确认
```javascript
socket.on('subscribed', (data) => {
  console.log('订阅成功:', data);
});
```

**数据格式:**
```json
{
  "deviceId": "outdoor_light"
}
```

#### 取消订阅确认
```javascript
socket.on('unsubscribed', (data) => {
  console.log('取消订阅:', data);
});
```

#### 错误处理
```javascript
socket.on('error', (error) => {
  console.error('错误:', error);
});
```

**错误格式:**
```json
{
  "message": "无法获取设备状态: outdoor_light",
  "error": "Device not found"
}
```

## 数据类型

### RELAY_STATE 枚举
```typescript
enum RELAY_STATE {
  ON = 0x01,   // 继电器开启
  OFF = 0x00   // 继电器关闭
}
```

### RELAY_TYPE 枚举
```typescript
enum RELAY_TYPE {
  ZQWL_RELAY_16,  // 16路继电器
  ZQWL_RELAY_8,   // 8路继电器
  ZQWL_RELAY_4    // 4路继电器
}
```

### DeviceConfig 接口
```typescript
interface DeviceConfig {
  id: string;                                          // 设备唯一标识
  name: string;                                        // 设备名称
  type: "ZQWL_RELAY_16" | "ZQWL_RELAY_8" | "ZQWL_RELAY_4"; // 设备类型
  address: number;                                     // Modbus地址
  port: ModbusPort;                                    // 通信端口
  description: string;                                 // 设备描述
  buttons: ButtonConfig[];                             // 按钮配置列表
}
```

### ButtonConfig 接口
```typescript
interface ButtonConfig {
  id: string;          // 按钮唯一标识
  relayIndex: number;  // 对应的继电器索引
  name: string;        // 按钮名称
  description: string; // 按钮描述
  room?: string;       // 所属房间（可选）
}
```

### StateChangeEvent 接口
```typescript
interface StateChangeEvent {
  deviceId: string;              // 设备ID
  address: number;               // Modbus地址
  port: string;                  // 通信端口
  relayStates?: RELAY_STATE[];   // 继电器状态数组
  inputStates?: RELAY_STATE[];   // 输入状态数组
  timestamp: number;             // 时间戳
  changedRelayIndexes?: number[]; // 变化的继电器索引
  changedInputIndexes?: number[]; // 变化的输入索引
}
```

## 错误处理

### HTTP错误响应
```json
{
  "statusCode": 404,
  "message": "Device not found: invalid_device",
  "error": "Not Found"
}
```

### 常见错误码
- `400 Bad Request`: 请求参数错误
- `404 Not Found`: 设备或按钮未找到
- `500 Internal Server Error`: 服务器内部错误（如设备通信失败）

## 使用示例

### JavaScript/Node.js 示例

#### HTTP API 调用
```javascript
// 获取所有设备
const devices = await fetch('http://localhost:3000/relay/devices')
  .then(res => res.json());

// 控制继电器
await fetch('http://localhost:3000/relay/buttons/outdoor_light_btn1/on', {
  method: 'POST'
});

// 获取设备状态
const state = await fetch('http://localhost:3000/relay/device/outdoor_light/relay-state')
  .then(res => res.json());
```

#### WebSocket 客户端
```javascript
import io from 'socket.io-client';

const socket = io('ws://localhost:3000/relay');

// 连接成功
socket.on('connect', () => {
  console.log('WebSocket 连接成功');
  
  // 订阅设备状态变化
  socket.emit('subscribeDevice', { deviceId: 'outdoor_light' });
});

// 监听状态变化
socket.on('stateChanged', (event) => {
  console.log('设备状态变化:', event);
  
  // 更新UI界面
  updateDeviceUI(event.deviceId, event.relayStates);
});

// 监听初始状态
socket.on('initialState', (data) => {
  console.log('设备初始状态:', data);
  initializeDeviceUI(data);
});

// 错误处理
socket.on('error', (error) => {
  console.error('WebSocket错误:', error);
});
```

### curl 命令示例
```bash
# 获取所有设备
curl http://localhost:3000/relay/devices

# 获取设备状态
curl http://localhost:3000/relay/device/outdoor_light/relay-state

# 控制继电器
curl -X POST http://localhost:3000/relay/buttons/outdoor_light_btn1/on
curl -X POST http://localhost:3000/relay/buttons/outdoor_light_btn1/off

# 直接控制设备继电器
curl -X POST http://localhost:3000/relay/device/outdoor_light/0/on
curl -X POST http://localhost:3000/relay/device/outdoor_light/0/off
```

### 前端React示例
```jsx
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function RelayControl() {
  const [socket, setSocket] = useState(null);
  const [deviceStates, setDeviceStates] = useState({});

  useEffect(() => {
    // 建立WebSocket连接
    const newSocket = io('ws://localhost:3000/relay');
    
    newSocket.on('connect', () => {
      console.log('WebSocket连接成功');
    });

    newSocket.on('initialState', (data) => {
      setDeviceStates(prev => ({
        ...prev,
        [data.deviceId]: data
      }));
    });

    newSocket.on('stateChanged', (event) => {
      setDeviceStates(prev => ({
        ...prev,
        [event.deviceId]: {
          ...prev[event.deviceId],
          relayStates: event.relayStates,
          inputStates: event.inputStates,
          timestamp: event.timestamp
        }
      }));
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  const toggleRelay = async (buttonId, currentState) => {
    const action = currentState ? 'off' : 'on';
    try {
      await fetch(`http://localhost:3000/relay/buttons/${buttonId}/${action}`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('控制继电器失败:', error);
    }
  };

  return (
    <div>
      {Object.entries(deviceStates).map(([deviceId, state]) => (
        <div key={deviceId}>
          <h3>{deviceId}</h3>
          <p>在线状态: {state.isOnline ? '在线' : '离线'}</p>
          <div>
            {state.relayStates?.map((relayState, index) => (
              <button
                key={index}
                onClick={() => toggleRelay(`${deviceId}_btn${index}`, relayState)}
                style={{
                  backgroundColor: relayState ? 'green' : 'red',
                  color: 'white',
                  margin: '2px'
                }}
              >
                继电器 {index}: {relayState ? 'ON' : 'OFF'}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default RelayControl;
```

## 实时监控特性

### 自动状态监控
- 系统每3秒自动轮询所有设备状态
- 检测到状态变化时自动通过WebSocket广播
- 支持离线设备检测和恢复

### 优先级队列
- 用户操作（写命令）具有高优先级
- 状态监控使用低优先级，不影响控制响应
- Modbus通信采用队列机制，避免冲突

### 缓存机制
- 状态读取带有1秒缓存，避免频繁查询
- 高优先级请求可绕过缓存获取实时状态
- 写操作立即更新本地缓存

## 配置说明

设备配置文件位于 `devices.json`，格式如下：

```json
[
  {
    "id": "outdoor_light",
    "name": "室外照明设备",
    "type": "ZQWL_RELAY_16",
    "address": 1,
    "port": "MAIN_PORT",
    "description": "控制室外照明系统",
    "buttons": [
      {
        "id": "outdoor_light_btn1",
        "name": "前院灯",
        "description": "前院照明控制",
        "room": "前院"
      }
    ]
  }
]
```

## 注意事项

1. **并发控制**: Modbus通信采用队列机制，同一端口的请求会串行执行
2. **错误重试**: 设备离线时会停止定时监控，恢复后自动重启
3. **内存管理**: WebSocket连接会自动管理，断开时清理相关资源
4. **性能优化**: 状态缓存和优先级队列确保系统响应性能

更多技术细节请参考源码注释和相关模块文档。