import * as net from 'net';
import { resolveNpubService } from './ncc-resolver.js';
import { createRemoteSigner } from './remote-signer.js';

const SOCKS_VERSION = 0x05;
const AUTH_NO_AUTH = 0x00;
const AUTH_USERPASS = 0x02;
const CMD_CONNECT = 0x01;
const ATYPE_IPV4 = 0x01;
const ATYPE_DOMAIN = 0x03;
const ATYPE_IPV6 = 0x04;

export function startSocksServer(initialPort: number = 1080, options: any = {}) {
  const server = net.createServer((clientSocket) => {
    let handshakeState: 'version' | 'auth' | 'request' | 'piping' = 'version';
    let sessionSigner: any = null;

    clientSocket.on('error', () => { /* ignore */ });
    clientSocket.on('close', () => {
        if (sessionSigner && typeof sessionSigner.close === 'function') {
            sessionSigner.close().catch(() => {});
        }
    });

    clientSocket.on('data', async (data) => {
      try {
        let currentData = data;

        // 1. Handle Handshake Version & Method Selection
        if (handshakeState === 'version') {
          if (currentData[0] !== SOCKS_VERSION) {
            console.log(`[SOCKS] ⚠️  Invalid handshake version: ${currentData[0]}. Expected ${SOCKS_VERSION}.`);
            clientSocket.destroy();
            return;
          }
          
          const nmethods = currentData[1];
          const methods = currentData.slice(2, 2 + nmethods);
          
          if (methods.includes(AUTH_USERPASS)) {
             clientSocket.write(Buffer.from([SOCKS_VERSION, AUTH_USERPASS]));
             handshakeState = 'auth';
          } else {
             clientSocket.write(Buffer.from([SOCKS_VERSION, AUTH_NO_AUTH]));
             handshakeState = 'request';
          }
          
          if (currentData.length <= 2 + nmethods) return;
          currentData = currentData.slice(2 + nmethods);
        }

        // 2. Handle Username/Password Authentication
        if (handshakeState === 'auth') {
           if (currentData.length < 2) return;
           if (currentData[0] !== 0x01) { // Auth version 1
               clientSocket.destroy();
               return;
           }
           const ulen = currentData[1];
           if (currentData.length < 2 + ulen + 1) return;
           const username = currentData.slice(2, 2 + ulen).toString();
           const plen = currentData[2 + ulen];
           if (currentData.length < 2 + ulen + 1 + plen) return;
           const password = currentData.slice(3 + ulen, 3 + ulen + plen).toString();
           
           console.log(`[SOCKS] 🔐 Auth attempt for user: ${username}`);
           
           if (username.startsWith('bunker://') || username.includes('@')) {
               try {
                   sessionSigner = await createRemoteSigner(username);
                   console.log(`[SOCKS] ✅ Auth successful for ${username}`);
                   clientSocket.write(Buffer.from([0x01, 0x00])); // Success
                   handshakeState = 'request';
               } catch (err: any) {
                   console.log(`[SOCKS] ❌ Auth failed for ${username}: ${err.message}`);
                   clientSocket.write(Buffer.from([0x01, 0x01])); // Failure
                   clientSocket.destroy();
                   return;
               }
           } else {
               // Allow normal auth with success
               clientSocket.write(Buffer.from([0x01, 0x00]));
               handshakeState = 'request';
           }
           
           if (currentData.length <= 3 + ulen + plen) return;
           currentData = currentData.slice(3 + ulen + plen);
        }

        // 3. Process Request
        if (handshakeState === 'request') {
            if (currentData.length < 4) return;
            if (currentData[0] !== SOCKS_VERSION || currentData[1] !== CMD_CONNECT) return;

            let offset = 4;
            let host = '';
            const atype = currentData[3];

            if (atype === ATYPE_IPV4) {
              host = currentData.slice(offset, offset + 4).join('.');
              offset += 4;
            } else if (atype === ATYPE_DOMAIN) {
              const length = currentData[offset];
              host = currentData.slice(offset + 1, offset + 1 + length).toString();
              offset += 1 + length;
            } else if (atype === ATYPE_IPV6) {
              const parts = [];
              for (let i = 0; i < 8; i++) {
                parts.push(currentData.readUInt16BE(offset + i * 2).toString(16));
              }
              host = parts.join(':');
              offset += 16;
            }

            const destPort = currentData.readUInt16BE(offset);
            
            const typeStr = atype === ATYPE_DOMAIN ? 'DOMAIN' : (atype === ATYPE_IPV4 ? 'IPv4' : 'IPv6');
            console.log(`[SOCKS] 📥 Request: [${typeStr}] ${host}:${destPort}`);

            // Interception Logic
            if (host === 'proxy-test.ncc' || host === 'test.ncc') {
                handleInternalTestResponse(clientSocket);
                handshakeState = 'piping';
                return;
            }

            if (host === 'local-sidecar.ncc') {
                await handleDirectConnection(clientSocket, '127.0.0.1', 3000);
                handshakeState = 'piping';
                return;
            }

            const isNpub = (h: string) => /npub1[a-z0-9]{58}/i.test(h);
            let targetNpub: string | null = null;

            const lowerHost = host.toLowerCase();
            if (lowerHost.endsWith('.nostr')) targetNpub = lowerHost.replace('.nostr', '');
            else if (lowerHost.endsWith('.ncc')) targetNpub = lowerHost.replace('.ncc', '');
            else if (lowerHost.startsWith('ncc:')) targetNpub = lowerHost.replace('ncc:', '');
            else if (lowerHost.startsWith('ncc-')) targetNpub = lowerHost.replace('ncc-', '');
            else if (isNpub(lowerHost)) targetNpub = lowerHost;

            if (targetNpub && isNpub(targetNpub)) {
              console.log(`[NCC-VPN] 🎯 INTERCEPTING NCC IDENTITY: ${targetNpub}`);
              await handleNostrConnection(clientSocket, targetNpub, destPort, {
                  bootstrapRelays: options.bootstrapRelays,
                  nsec: options.authorizedNsec,
                  signer: sessionSigner || options.signer
              });
            } else {
              await handleDirectConnection(clientSocket, host, destPort);
            }
            handshakeState = 'piping';
        }
      } catch (err: any) {
        console.error(`[SOCKS] Server Error: ${err.message}`);
        if (clientSocket.writable) {
          clientSocket.write(Buffer.from([SOCKS_VERSION, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        }
        clientSocket.destroy();
      }
    });
  });

  let port = initialPort;
  const tryListen = () => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`[NCC-VPN] SOCKS5 Proxy active on 127.0.0.1:${port}`);
    });
  };

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      port++;
      tryListen();
    }
  });

  tryListen();
}

function handleInternalTestResponse(clientSocket: net.Socket) {
    clientSocket.write(Buffer.from([SOCKS_VERSION, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
    clientSocket.once('data', () => {
        const response = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n✅ NCC Proxy Interception Successful!\n";
        clientSocket.write(response);
        clientSocket.end();
    });
}

async function handleNostrConnection(clientSocket: net.Socket, npub: string, port: number, resolverOptions: any = {}) {
  let serviceId = 'api';
  if (port === 7777 || port === 8888 || port === 80) serviceId = 'relay';
  
  try {
    const { endpoint } = await resolveNpubService(npub, serviceId, resolverOptions);
    console.log(`[NCC-VPN] 🔓 Resolved ${npub} -> ${endpoint}`);

    const targetUrl = new URL(endpoint);
    if (targetUrl.hostname.endsWith('.onion')) {
        await handleOnionConnection(clientSocket, endpoint, port);
    } else {
        await handleDirectConnection(clientSocket, targetUrl.hostname, parseInt(targetUrl.port) || port);
    }
  } catch (err: any) {
    console.error(`[NCC-VPN] ❌ Resolution failed for ${npub}: ${err.message}`);
    const response = Buffer.from([SOCKS_VERSION, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
    if (clientSocket.writable) clientSocket.write(response);
    clientSocket.destroy();
  }
}

async function handleOnionConnection(clientSocket: net.Socket, targetUrl: string, port: number) {
    const { SocksClient } = await import('socks');
    try {
        const parsed = new URL(targetUrl);
        const info = await SocksClient.createConnection({
            proxy: { host: '127.0.0.1', port: 9050, type: 5 },
            command: 'connect',
            destination: { host: parsed.hostname, port: parseInt(parsed.port) || 80 }
        });
        const remoteSocket = info.socket;
        clientSocket.write(Buffer.from([SOCKS_VERSION, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        clientSocket.pipe(remoteSocket);
        remoteSocket.pipe(clientSocket);
    } catch (err: any) {
        const response = Buffer.from([SOCKS_VERSION, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
        if (clientSocket.writable) clientSocket.write(response);
        clientSocket.destroy();
    }
}

async function handleDirectConnection(clientSocket: net.Socket, host: string, port: number) {
  const remoteSocket = net.createConnection({ host, port }, () => {
    if (clientSocket.writable) {
        clientSocket.write(Buffer.from([SOCKS_VERSION, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
    }
  });
  remoteSocket.on('error', () => {
    if (clientSocket.writable) {
        const response = Buffer.from([SOCKS_VERSION, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
        clientSocket.write(response);
    }
    clientSocket.destroy();
  });
  clientSocket.pipe(remoteSocket);
  remoteSocket.pipe(clientSocket);
}