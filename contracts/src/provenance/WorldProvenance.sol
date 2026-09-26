// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Where a shared world began and what each of its beats said — nothing more (rev 6 phase 4, D6).
 *
 * A world service (the recorder: msg.sender, which pays) opens one stream per world it sequences,
 * then records, per beat, the log position the beat folded (`upTo`), the log's hash chain at that
 * position (`chain(upTo)`) and the beat's fingerprint. Content never goes on chain, and players
 * sign nothing here.
 *
 * The two Ed25519 signatures that make a stream worth trusting are carried in `StreamOpened` for
 * offline verification and are never checked here (the EVM has no Ed25519):
 * - `genesisSig` is the genesis event's own signature over its id, the world id, by `ownerKey`;
 * - `sequencerSig` is the service key signing
 *   "unmapped-provenance:v1\n" + chainId + "\n" + contract + "\n" + recorder + "\n" + worldId
 *   (src/shared/provenance.ts). It names the recorder, so the same signatures replayed by another
 *   sender open a stream every reader discards as unverified.
 *
 * Readers find a world's streams through `recorders(worldId, sequencerKey, …)` (the sequencer keys
 * come from the world's own log) and walk a stream's beats back from `lastBlock` through each
 * `BeatRecorded.prevBlock`, one block at a time, so no reader needs a wide log query.
 */
contract WorldProvenance {
    struct Stream {
        bool open;
        // The highest `upTo` recorded so far (0 before the first beat).
        uint64 upTo;
        // The block `StreamOpened` was emitted in.
        uint64 openedBlock;
        // The block of the latest `BeatRecorded` (0 before the first beat).
        uint64 lastBlock;
    }

    mapping(address recorder => mapping(bytes32 worldId => Stream)) private _streams;
    mapping(bytes32 worldId => mapping(bytes32 sequencerKey => address[])) private _recorders;

    event StreamOpened(
        address indexed recorder,
        bytes32 indexed worldId,
        bytes32 indexed sequencerKey,
        bytes32 cartridgeHash,
        bytes32 ownerKey,
        bytes genesisSig,
        bytes sequencerSig
    );

    event BeatRecorded(
        address indexed recorder,
        bytes32 indexed worldId,
        uint64 upTo,
        bytes32 chain,
        bytes32 fingerprint,
        uint64 prevBlock
    );

    error StreamAlreadyOpen(address recorder, bytes32 worldId);
    error StreamNotOpen(address recorder, bytes32 worldId);
    error UpToNotRising(bytes32 worldId, uint64 recorded, uint64 upTo);
    error LengthMismatch();
    error BadSignatureLength();

    /// Once per (msg.sender, worldId). Signatures are 64-byte Ed25519, checked offline.
    function openStream(
        bytes32 worldId,
        bytes32 cartridgeHash,
        bytes32 ownerKey,
        bytes calldata genesisSig,
        bytes32 sequencerKey,
        bytes calldata sequencerSig
    ) external {
        Stream storage stream = _streams[msg.sender][worldId];
        if (stream.open) revert StreamAlreadyOpen(msg.sender, worldId);
        if (genesisSig.length != 64 || sequencerSig.length != 64) revert BadSignatureLength();
        stream.open = true;
        stream.openedBlock = uint64(block.number);
        _recorders[worldId][sequencerKey].push(msg.sender);
        emit StreamOpened(
            msg.sender,
            worldId,
            sequencerKey,
            cartridgeHash,
            ownerKey,
            genesisSig,
            sequencerSig
        );
    }

    /// Batched across worlds; each entry is BeatBody.upTo, chain(upTo) and BeatBody.fingerprint.
    /// Per stream, `upTo` strictly rises, including between entries of one batch.
    function recordBeats(
        bytes32[] calldata worldIds,
        uint64[] calldata upTos,
        bytes32[] calldata chains,
        bytes32[] calldata fingerprints
    ) external {
        uint256 count = worldIds.length;
        if (upTos.length != count || chains.length != count || fingerprints.length != count) {
            revert LengthMismatch();
        }
        for (uint256 i = 0; i < count; ++i) {
            Stream storage stream = _streams[msg.sender][worldIds[i]];
            if (!stream.open) revert StreamNotOpen(msg.sender, worldIds[i]);
            uint64 upTo = upTos[i];
            if (upTo <= stream.upTo) revert UpToNotRising(worldIds[i], stream.upTo, upTo);
            uint64 prevBlock = stream.lastBlock;
            stream.upTo = upTo;
            stream.lastBlock = uint64(block.number);
            emit BeatRecorded(msg.sender, worldIds[i], upTo, chains[i], fingerprints[i], prevBlock);
        }
    }

    function streamOf(address recorder, bytes32 worldId) external view returns (Stream memory) {
        return _streams[recorder][worldId];
    }

    /// A page of the recorders that opened a stream for `worldId` naming `sequencerKey`, in order.
    function recorders(
        bytes32 worldId,
        bytes32 sequencerKey,
        uint256 start,
        uint256 count
    ) external view returns (address[] memory page, uint256 total) {
        address[] storage all = _recorders[worldId][sequencerKey];
        total = all.length;
        uint256 end = start >= total ? start : (total - start < count ? total : start + count);
        page = new address[](end - start);
        for (uint256 i = start; i < end; ++i) page[i - start] = all[i];
    }
}
