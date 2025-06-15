import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StateChangeEvent } from './types';

@Injectable()
export class RelayEventService {
  constructor(private eventEmitter: EventEmitter2) {}

  emitStateChange(event: StateChangeEvent): void {
    this.eventEmitter.emit('relay.state.changed', event);
  }

  onStateChange(callback: (event: StateChangeEvent) => void): void {
    this.eventEmitter.on('relay.state.changed', callback);
  }

  removeStateChangeListener(callback: (event: StateChangeEvent) => void): void {
    this.eventEmitter.off('relay.state.changed', callback);
  }
}
