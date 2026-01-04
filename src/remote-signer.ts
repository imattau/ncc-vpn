import { BunkerSigner, parseBunkerInput, BunkerPointer } from 'nostr-tools/nip46';
import { generateSecretKey } from 'nostr-tools';
import { NostrSigner } from 'ncc-05-js';

export async function createRemoteSigner(bunkerInput: string): Promise<NostrSigner> {
    const bp = await parseBunkerInput(bunkerInput);
    if (!bp) {
        throw new Error(`Invalid bunker input: ${bunkerInput}`);
    }

    const clientSecretKey = generateSecretKey();
    const bunkerSigner = BunkerSigner.fromBunker(clientSecretKey, bp);

    // Initial connection
    console.log(`[RemoteSigner] Connecting to bunker ${bp.pubkey}...`);
    await bunkerSigner.connect();
    console.log(`[RemoteSigner] Connected.`);

    return {
        async getPublicKey() {
            return await bunkerSigner.getPublicKey();
        },
        async signEvent(event: any) {
            return await bunkerSigner.signEvent(event) as any;
        },
        async nip44Decrypt(peerPubkey: string, ciphertext: string) {
            return await bunkerSigner.nip44Decrypt(peerPubkey, ciphertext);
        },
        async nip44Encrypt(peerPubkey: string, plaintext: string) {
            return await bunkerSigner.nip44Encrypt(peerPubkey, plaintext);
        },
        async close() {
            await bunkerSigner.close();
        }
    };
}
