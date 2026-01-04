import { resolveServiceEndpoint } from 'ncc-06-js';
import { SimplePool } from 'nostr-tools';

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr-01.yakihonne.com',
];

const pool = new SimplePool();

export interface ResolvedService {
  endpoint: string;
  source: string | null;
  serviceRecord: any;
}

export async function resolveNpubService(npub: string, serviceId: string = 'api', options: any = {}): Promise<ResolvedService> {
  console.log(`[Resolver] Resolving ${npub} for service ${serviceId}...`);
  
  const {
    torPreferred = true,
    allowedProtocols = ['wss', 'ws', 'https', 'http', 'tcp'],
    nsec = options.nsec || process.env.NSEC,
    bootstrapRelays = DEFAULT_RELAYS
  } = options;

  if (nsec) {
      console.log(`[Resolver] Using secret key for resolution (source: ${options.nsec ? 'options' : 'env'}).`);
  } else {
      console.log(`[Resolver] No secret key provided. Private services will not be buildable.`);
  }

  // The NCC resolver expects a hex pubkey
  let pubkey = npub;
  if (npub.startsWith('npub1')) {
     const { nip19 } = await import('nostr-tools');
     const { data } = nip19.decode(npub);
     pubkey = data as string;
  }

  const result = await resolveServiceEndpoint({
    bootstrapRelays,
    servicePubkey: pubkey,
    serviceId: serviceId,
    locatorId: 'addr', // Default locator ID for NCC-05
    pool,
    torPreferred,
    allowedProtocols,
    locatorSecretKey: nsec
  });
  if (!result.endpoint) {
    if (result.selection?.reason === 'private-no-decryption') {
        throw new Error(`Service is private. Please provide authorized NSEC via environment variable.`);
    }
    throw new Error(`Failed to resolve endpoint for ${npub} (Reason: ${result.selection?.reason || 'unknown'})`);
  }

  return {
    endpoint: result.endpoint,
    source: result.source,
    serviceRecord: result.serviceRecord
  };
}