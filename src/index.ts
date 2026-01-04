import WebSocket from 'ws';
globalThis.WebSocket = WebSocket as any;

import { startSocksServer } from './socks-server.js';
import { createRemoteSigner } from './remote-signer.js';
import * as net from 'net';

async function checkTor() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 9050 }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
  });
}

async function main() {
  console.log('--- NCC-VPN Service ---');
  
  const torRunning = await checkTor();
  if (!torRunning) {
    console.warn('[Warning] Tor daemon not detected on 127.0.0.1:9050.');
    console.warn('[Warning] .onion resolution will fail.');
  } else {
    console.log('[Info] Tor daemon detected.');
  }

  let signer = null;
  const bunkerUrl = process.env.BUNKER;
  if (bunkerUrl) {
    try {
        console.log('[Info] Initializing Remote Signer (Bunker)...');
        signer = await createRemoteSigner(bunkerUrl);
        console.log('[Info] Remote Signer Ready.');
    } catch (err: any) {
        console.error(`[Error] Failed to initialize Remote Signer: ${err.message}`);
    }
  }

  const port = parseInt(process.env.PORT || '1080');
  startSocksServer(port, {
      signer,
      authorizedNsec: process.env.NSEC
  });
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
