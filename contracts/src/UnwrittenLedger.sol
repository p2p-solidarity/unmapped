// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Two ledgers for Unwritten Land, on the identity the app already uses: the sha256 content hash of
 * an immutable revision (a cartridge or an AI-written world).
 *
 * - The fact ledger (`publish`): who published which exact revision, what it was remixed from and
 *   where its bytes can be fetched. Content never goes on chain; a downloader recomputes the hash
 *   and compares. A hash can be published once, by one author, forever.
 * - The para-ledger (`witness`): what players say about a revision they have seen. Notes are
 *   anchored to a published hash, may contradict each other, and are never reconciled here.
 */
contract UnwrittenLedger {
    enum Kind {
        Cartridge,
        World
    }

    struct Revision {
        address author;
        bytes32 parent;
        uint64 publishedAt;
        Kind kind;
        string uri;
    }

    uint256 public constant MAX_NOTE = 280;
    uint256 public constant MAX_URI = 400;

    mapping(bytes32 => Revision) private revisions;

    event Published(
        bytes32 indexed contentHash,
        address indexed author,
        bytes32 indexed parent,
        Kind kind,
        string uri
    );
    event Witnessed(bytes32 indexed contentHash, address indexed witness, string note);

    error EmptyHash();
    error AlreadyPublished(bytes32 contentHash);
    error UnknownParent(bytes32 parent);
    error UnknownRevision(bytes32 contentHash);
    error NoteTooLong(uint256 length);
    error UriTooLong(uint256 length);

    /// Records a revision. `parent` is bytes32(0) for a first version, otherwise a published hash.
    function publish(bytes32 contentHash, bytes32 parent, Kind kind, string calldata uri) external {
        if (contentHash == bytes32(0)) revert EmptyHash();
        if (revisions[contentHash].author != address(0)) revert AlreadyPublished(contentHash);
        if (parent != bytes32(0) && revisions[parent].author == address(0)) {
            revert UnknownParent(parent);
        }
        if (bytes(uri).length > MAX_URI) revert UriTooLong(bytes(uri).length);
        revisions[contentHash] = Revision({
            author: msg.sender,
            parent: parent,
            publishedAt: uint64(block.timestamp),
            kind: kind,
            uri: uri
        });
        emit Published(contentHash, msg.sender, parent, kind, uri);
    }

    /// Leaves a note on a published revision. Anyone may; nothing is overwritten.
    function witness(bytes32 contentHash, string calldata note) external {
        if (revisions[contentHash].author == address(0)) revert UnknownRevision(contentHash);
        if (bytes(note).length > MAX_NOTE) revert NoteTooLong(bytes(note).length);
        emit Witnessed(contentHash, msg.sender, note);
    }

    function revisionOf(bytes32 contentHash) external view returns (Revision memory) {
        return revisions[contentHash];
    }

    function isPublished(bytes32 contentHash) external view returns (bool) {
        return revisions[contentHash].author != address(0);
    }
}
