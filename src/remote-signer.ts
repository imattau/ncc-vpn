import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { generateSecretKey } from 'nostr-tools';
export async function createRemoteSigner(bunkerInput) {
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
        async signEvent(event) {
            return await bunkerSigner.signEvent(event);
        },
        async nip44Decrypt(peerPubkey, ciphertext) {
            return await bunkerSigner.nip44Decrypt(peerPubkey, ciphertext);
        },
        async nip44Encrypt(peerPubkey, plaintext) {
            return await bunkerSigner.nip44Encrypt(peerPubkey, plaintext);
        },
        async close() {
            await bunkerSigner.close();
        }
    };
}
