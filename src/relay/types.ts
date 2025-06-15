export enum RELAY_TYPE {
  ZQWL_RELAY_16,
  ZQWL_RELAY_8,
  ZQWL_RELAY_4,
}
//INPUT or RELAY
export enum RELAY_STATE {
  ON = 0x01,
  OFF = 0x00,
}
export interface RelayOptions {
  relayAddr: number;
  relayType: RELAY_TYPE;
}

export interface RelayDriver {
  readRelayState(): Promise<RELAY_STATE[]>;
  readInputState(): Promise<RELAY_STATE[]>;
  writeRelayOn(index: number): Promise<boolean>;
  writeRelayOff(index: number): Promise<boolean>;
}

export interface StateChangeEvent {
  deviceId: string;
  address: number;
  port: string;
  relayStates?: RELAY_STATE[];
  inputStates?: RELAY_STATE[];
  timestamp: number;
  changedRelayIndexes?: number[];
  changedInputIndexes?: number[];
}

export interface RelayStateChange {
  index: number;
  oldState: RELAY_STATE;
  newState: RELAY_STATE;
}

export interface InputStateChange {
  index: number;
  oldState: RELAY_STATE;
  newState: RELAY_STATE;
}
