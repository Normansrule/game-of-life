/// <reference lib="webworker" />
import { type Command, createRunner } from './gaRunner';

const handle = createRunner((m) => postMessage(m), () => self.performance.now());
self.onmessage = (e: MessageEvent<Command>) => handle(e.data);
