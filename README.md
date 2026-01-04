# NCC-VPN

**NCC-VPN** is a Nostr-based Virtual Private Network (VPN) and SOCKS5 proxy. It enables seamless access to services hosted behind Nostr identities by intercepting specific domain patterns and resolving them to real network endpoints (IPs or Onion addresses) using Nostr protocol records (NIP-05, Kind 30078, and Kind 1063).

## Features

- **SOCKS5 Proxy Interface**: Works with standard applications (browsers, `curl`, etc.) by setting them to use `127.0.0.1:1080` as a proxy.
- **Nostr Identity Resolution**: Automatically resolves hostnames like `npub1...`, `user.ncc`, or `user.nostr` to their active service endpoints.
- **Onion Service Support**: Built-in integration with Tor. If a resolved endpoint is a `.onion` address, the proxy automatically routes the traffic through a local Tor daemon.
- **Private Service Access**: Support for resolving private/encrypted service records via a local `NSEC` or a **Remote Signer (Nip-46)**.
- **Multi-User Support**: Multiple users can share a single proxy by providing their own Bunker URLs via SOCKS5 authentication.
- **Zero Configuration Networking**: Connect to peers globally using only their Nostr identity.

## Prerequisites

- **Node.js** (v18 or higher recommended)
- **Tor Daemon** (Optional, required for `.onion` resolution): Should be running on `127.0.0.1:9050`.

## Installation

```bash
git clone https://github.com/your-repo/ncc-vpn.git
cd ncc-vpn
npm install
```

## Usage

### 1. Start the Proxy

```bash
npm start
```

By default, the proxy listens on `127.0.0.1:1080`.

### 2. Configure your Client

Configure your browser or application to use the SOCKS5 proxy:
- **Host**: `127.0.0.1`
- **Port**: `1080`

### 3. Access Nostr Services

You can now use Nostr-based hostnames in your client:
- `http://<npub>.ncc`
- `http://<npub>.nostr`
- `ncc:<npub>`
- `ncc-<npub>`

For example:
```bash
curl --proxy socks5h://127.0.0.1:1080 http://npub1...some_npub... .ncc
```

## Configuration

| Environment Variable | Description | Default |
|----------------------|-------------|---------|
| `NSEC`               | Secret key used to decrypt private service records. | None |
| `BUNKER`             | Nostr Connect (NIP-46) bunker URL for remote signing. | None |
| `PORT`               | Port for the SOCKS5 proxy to listen on. | 1080 |

### Remote Signer (NIP-46)

Instead of providing a raw `NSEC`, you can use a remote signer (like a mobile app or a Bunker). This keeps your private keys secure on your own device.

**Global Signer**: Set the `BUNKER` environment variable before starting the proxy.
```bash
BUNKER="bunker://<pubkey>@<relay>?secret=<token>" npm start
```

**Per-Connection Signer**: If you are using a shared proxy, you can provide your Bunker URL as the **SOCKS5 username**. Most modern SOCKS5 clients support this.

```bash
curl --proxy-user "bunker://...:any-password" --proxy socks5h://127.0.0.1:1080 http://user.ncc
```

## Development and Testing

The project includes several test scripts to verify functionality:

- **Resolve Test**: Checks if a specific npub can be resolved to an endpoint.
  ```bash
  npm run test:resolve
  ```
- **Local Test**: Verifies interception by connecting to `test.ncc`.
  ```bash
  npm run test:local
  ```
- **Real NPUB Test**: Tests resolution against a live Nostr identity.
  ```bash
  npm run test:npub
  ```
- **Private Service Test**: Tests resolution of encrypted records (requires `NSEC`).
  ```bash
  npm run test:private
  ```

## How it Works

1. **Interception**: The SOCKS5 server listens for connection requests. If the requested hostname matches an NCC pattern (e.g., `.ncc`, `.nostr`, or raw `npub`), it enters resolution mode.
2. **Nostr Resolution**: It queries Nostr relays for Kind 30078 or Kind 1063 events associated with the target pubkey.
3. **Routing**:
   - If the resolved endpoint is a standard IP/Domain, it pipes the traffic directly.
   - If the endpoint is a `.onion` address, it establishes a second SOCKS5 connection to the local Tor daemon and pipes the traffic through it.

## License

MIT