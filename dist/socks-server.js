import * as net from 'net';
import { resolveNpubService } from './ncc-resolver.js';
const SOCKS_VERSION = 0x05;
const AUTH_NO_AUTH = 0x00;
const CMD_CONNECT = 0x01;
const ATYPE_IPV4 = 0x01;
const ATYPE_DOMAIN = 0x03;
const ATYPE_IPV6 = 0x04;
export function startSocksServer(initialPort = 1080, options = {}) {
    const server = net.createServer((clientSocket) => {
        let handshakeComplete = false;
        clientSocket.on('error', () => { });
        clientSocket.on('data', async (data) => {
            try {
                let currentData = data;
                // 1. Handle Handshake
                if (!handshakeComplete) {
                    if (currentData[0] !== SOCKS_VERSION) {
                        console.log(`[SOCKS] ⚠️  Invalid handshake version: ${currentData[0]}. Expected ${SOCKS_VERSION}.`);
                        clientSocket.destroy();
                        return;
                    }
                    clientSocket.write(Buffer.from([SOCKS_VERSION, AUTH_NO_AUTH]));
                    handshakeComplete = true;
                    if (currentData.length <= 2 + currentData[1])
                        return;
                    currentData = currentData.slice(2 + currentData[1]);
                }
                // 2. Process Request
                if (currentData.length < 4)
                    return;
                if (currentData[0] !== SOCKS_VERSION || currentData[1] !== CMD_CONNECT)
                    return;
                let offset = 4;
                let host = '';
                const atype = currentData[3];
                if (atype === ATYPE_IPV4) {
                    host = currentData.slice(offset, offset + 4).join('.');
                    offset += 4;
                }
                else if (atype === ATYPE_DOMAIN) {
                    const length = currentData[offset];
                    host = currentData.slice(offset + 1, offset + 1 + length).toString();
                    offset += 1 + length;
                }
                else if (atype === ATYPE_IPV6) {
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
                    return;
                }
                if (host === 'local-sidecar.ncc') {
                    await handleDirectConnection(clientSocket, '127.0.0.1', 3000);
                    return;
                }
                const isNpub = (h) => /npub1[a-z0-9]{58}/i.test(h);
                let targetNpub = null;
                const lowerHost = host.toLowerCase();
                if (lowerHost.endsWith('.nostr'))
                    targetNpub = lowerHost.replace('.nostr', '');
                else if (lowerHost.endsWith('.ncc'))
                    targetNpub = lowerHost.replace('.ncc', '');
                else if (lowerHost.startsWith('ncc:'))
                    targetNpub = lowerHost.replace('ncc:', '');
                else if (lowerHost.startsWith('ncc-'))
                    targetNpub = lowerHost.replace('ncc-', '');
                else if (isNpub(lowerHost))
                    targetNpub = lowerHost;
                if (targetNpub && isNpub(targetNpub)) {
                    console.log(`[NCC-VPN] 🎯 INTERCEPTING NCC IDENTITY: ${targetNpub}`);
                    await handleNostrConnection(clientSocket, targetNpub, destPort, {
                        bootstrapRelays: options.bootstrapRelays,
                        nsec: options.authorizedNsec
                    });
                }
                else {
                    await handleDirectConnection(clientSocket, host, destPort);
                }
            }
            catch (err) {
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
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            port++;
            tryListen();
        }
    });
    tryListen();
}
function handleInternalTestResponse(clientSocket) {
    clientSocket.write(Buffer.from([SOCKS_VERSION, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
    clientSocket.once('data', () => {
        const response = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n✅ NCC Proxy Interception Successful!\n";
        clientSocket.write(response);
        clientSocket.end();
    });
}
async function handleNostrConnection(clientSocket, npub, port, resolverOptions = {}) {
    let serviceId = 'api';
    if (port === 7777 || port === 8888 || port === 80)
        serviceId = 'relay';
    try {
        const { endpoint } = await resolveNpubService(npub, serviceId, resolverOptions);
        console.log(`[NCC-VPN] 🔓 Resolved ${npub} -> ${endpoint}`);
        const targetUrl = new URL(endpoint);
        if (targetUrl.hostname.endsWith('.onion')) {
            await handleOnionConnection(clientSocket, endpoint, port);
        }
        else {
            await handleDirectConnection(clientSocket, targetUrl.hostname, parseInt(targetUrl.port) || port);
        }
    }
    catch (err) {
        console.error(`[NCC-VPN] ❌ Resolution failed for ${npub}: ${err.message}`);
        const response = Buffer.from([SOCKS_VERSION, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
        if (clientSocket.writable)
            clientSocket.write(response);
        clientSocket.destroy();
    }
}
async function handleOnionConnection(clientSocket, targetUrl, port) {
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
    }
    catch (err) {
        const response = Buffer.from([SOCKS_VERSION, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
        if (clientSocket.writable)
            clientSocket.write(response);
        clientSocket.destroy();
    }
}
async function handleDirectConnection(clientSocket, host, port) {
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
