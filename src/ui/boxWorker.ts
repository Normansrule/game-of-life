/// <reference lib="webworker" />
import { type BoxCommand, createBoxRunner } from './boxRunner';

const handle = createBoxRunner((m) => postMessage(m));
self.onmessage = (e: MessageEvent<BoxCommand>) => handle(e.data);
