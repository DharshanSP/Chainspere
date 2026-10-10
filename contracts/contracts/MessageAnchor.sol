// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IdentityRegistry } from "./IdentityRegistry.sol";
import { ConversationRegistry } from "./ConversationRegistry.sol";

/// @title MessageAnchor — on-chain integrity commitments for encrypted payloads.
/// @notice Stores digests/commitments only. NEVER plaintext, attachments, or keys.
/// History is event-sourced; storage keeps only the latest commitment per message id.
contract MessageAnchor {
    IdentityRegistry public immutable identityRegistry;
    ConversationRegistry public immutable conversationRegistry;

    struct Anchor {
        bool exists;
        address sender;
        bytes32 groupId; // bytes32(0) for 1:1 direct messages
        bytes32 digest; // SHA-256 over the encrypted payload
        string cid; // encrypted payload CID (ciphertext only)
        uint64 timestamp;
        uint256 blockNumber;
    }

    mapping(bytes32 => Anchor) private _anchors;

    event MessageAnchored(
        bytes32 indexed messageId,
        address indexed sender,
        bytes32 indexed groupId,
        bytes32 digest,
        string cid
    );

    error NotRegistered();
    error InactiveIdentity();
    error AlreadyAnchored();
    error NotSender();
    error EmptyDigest();
    error NotGroupMember();
    error EmptyMessageId();

    constructor(address identityRegistry_, address conversationRegistry_) {
        identityRegistry = IdentityRegistry(identityRegistry_);
        conversationRegistry = ConversationRegistry(conversationRegistry_);
    }

    /// @notice Anchor a message integrity commitment. Only the sender may anchor their message id.
    /// @param messageId Client-generated unique id (e.g. keccak of sender|nonce) — must be nonzero.
    /// @param groupId bytes32(0) for 1:1, else group must exist and sender must be a member.
    /// @param digest SHA-256 of the encrypted payload bytes.
    /// @param cid Encrypted-payload CID (ciphertext only).
    function anchor(bytes32 messageId, bytes32 groupId, bytes32 digest, string calldata cid) external {
        if (messageId == bytes32(0)) revert EmptyMessageId();
        if (digest == bytes32(0)) revert EmptyDigest();
        if (_anchors[messageId].exists) revert AlreadyAnchored();
        (bool reg, bool act,,,,) = identityRegistry.getIdentity(msg.sender);
        if (!reg) revert NotRegistered();
        if (!act) revert InactiveIdentity();
        if (groupId != bytes32(0)) {
            (bool exists, bool active,,,,) = conversationRegistry.getGroup(groupId);
            if (!exists || !active) revert NotGroupMember();
            if (!conversationRegistry.isMember(groupId, msg.sender)) revert NotGroupMember();
        }
        _anchors[messageId] = Anchor({
            exists: true,
            sender: msg.sender,
            groupId: groupId,
            digest: digest,
            cid: cid,
            timestamp: uint64(block.timestamp),
            blockNumber: block.number
        });
        emit MessageAnchored(messageId, msg.sender, groupId, digest, cid);
    }

    /// @notice Verify a stored commitment against a candidate digest/CID.
    function verify(bytes32 messageId, bytes32 digest, string calldata cid)
        external
        view
        returns (bool digestMatch, bool cidMatch)
    {
        Anchor storage a = _anchors[messageId];
        if (!a.exists) return (false, false);
        digestMatch = (a.digest == digest);
        cidMatch = (keccak256(bytes(a.cid)) == keccak256(bytes(cid)));
    }

    function getAnchor(bytes32 messageId)
        external
        view
        returns (address sender, bytes32 groupId, bytes32 digest, string memory cid, uint64 timestamp)
    {
        Anchor storage a = _anchors[messageId];
        return (a.sender, a.groupId, a.digest, a.cid, a.timestamp);
    }
}
