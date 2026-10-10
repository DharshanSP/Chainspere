// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IdentityRegistry } from "./IdentityRegistry.sol";

/// @title ConversationRegistry — contract-enforced group membership.
/// @notice All membership mutations enforce access control on-chain.
/// Frontend checks are NOT sufficient; every mutating fn validates roles here.
contract ConversationRegistry {
    struct Group {
        bool exists;
        bool active;
        string name;
        address owner;
        uint64 createdAt;
        uint32 keyVersion; // increments on every membership change -> clients rotate group key
        uint32 memberCount;
    }

    IdentityRegistry public immutable identityRegistry;

    mapping(bytes32 => Group) private _groups;
    // groupId => member => isMember
    mapping(bytes32 => mapping(address => bool)) private _isMember;
    // groupId => member => isAdmin
    mapping(bytes32 => mapping(address => bool)) private _isAdmin;
    mapping(bytes32 => address[]) private _memberList; // append-only; removals keep tombstone in list
    uint256 private _groupNonce;

    event GroupCreated(bytes32 indexed groupId, address indexed owner, string name);
    event MemberAdded(bytes32 indexed groupId, address indexed member, address indexed addedBy);
    event MemberRemoved(bytes32 indexed groupId, address indexed member, address indexed removedBy);
    event AdminPromoted(bytes32 indexed groupId, address indexed member);
    event AdminDemoted(bytes32 indexed groupId, address indexed member);
    event OwnershipTransferred(bytes32 indexed groupId, address indexed oldOwner, address indexed newOwner);
    event GroupClosed(bytes32 indexed groupId);
    event GroupKeyRotated(bytes32 indexed groupId, uint32 keyVersion);

    error GroupNotFound();
    error GroupInactive();
    error NotOwner();
    error NotAdmin();
    error NotMember();
    error AlreadyMember();
    error ZeroAddress();
    error OwnerCannotBeRemoved();
    error EmptyName();
    error SenderIdentityInactive();
    event GroupReopened(bytes32 indexed groupId);

    constructor(address identityRegistry_) {
        identityRegistry = IdentityRegistry(identityRegistry_);
    }

    modifier onlyActiveGroup(bytes32 groupId) {
        if (!_groups[groupId].exists) revert GroupNotFound();
        if (!_groups[groupId].active) revert GroupInactive();
        _;
    }

    function _requireSenderIdentity() private view {
        // Sender must hold an active identity to mutate groups.
        (bool registered, bool active,,,,) = identityRegistry.getIdentity(msg.sender);
        if (!registered || !active) revert SenderIdentityInactive();
    }

    /// @notice Create a group. Creator becomes owner + admin + member.
    function createGroup(string calldata name, address[] calldata initialMembers) external returns (bytes32 groupId) {
        _requireSenderIdentity();
        if (bytes(name).length == 0) revert EmptyName();
        groupId = keccak256(abi.encodePacked(msg.sender, block.timestamp, _groupNonce++));
        Group storage g = _groups[groupId];
        g.exists = true;
        g.active = true;
        g.name = name;
        g.owner = msg.sender;
        g.createdAt = uint64(block.timestamp);
        g.keyVersion = 1;
        _isMember[groupId][msg.sender] = true;
        _isAdmin[groupId][msg.sender] = true;
        _memberList[groupId].push(msg.sender);
        g.memberCount = 1;
        // Gas-conscious: bounded loop over caller-supplied array; caller pays gas.
        for (uint256 i = 0; i < initialMembers.length; i++) {
            address m = initialMembers[i];
            if (m == address(0) || m == msg.sender || _isMember[groupId][m]) continue;
            (bool reg, bool act,,,,) = identityRegistry.getIdentity(m);
            if (!reg || !act) continue; // skip identities that are not active
            _isMember[groupId][m] = true;
            _memberList[groupId].push(m);
            g.memberCount += 1;
            emit MemberAdded(groupId, m, msg.sender);
        }
        emit GroupCreated(groupId, msg.sender, name);
    }

    function _isOwnerOrAdmin(bytes32 groupId, address who) private view returns (bool) {
        Group storage g = _groups[groupId];
        return who == g.owner || _isAdmin[groupId][who];
    }

    /// @notice Add a member. Caller must be owner or admin.
    function addMember(bytes32 groupId, address member) external onlyActiveGroup(groupId) {
        _requireSenderIdentity();
        if (!_isOwnerOrAdmin(groupId, msg.sender)) revert NotAdmin();
        if (member == address(0)) revert ZeroAddress();
        if (_isMember[groupId][member]) revert AlreadyMember();
        (bool reg, bool act,,,,) = identityRegistry.getIdentity(member);
        if (!reg || !act) revert SenderIdentityInactive();
        _isMember[groupId][member] = true;
        _memberList[groupId].push(member);
        _groups[groupId].memberCount += 1;
        _bumpKeyVersion(groupId);
        emit MemberAdded(groupId, member, msg.sender);
    }

    /// @notice Remove a member. Caller must be owner/admin; member cannot be owner.
    function removeMember(bytes32 groupId, address member) external onlyActiveGroup(groupId) {
        if (!_isOwnerOrAdmin(groupId, msg.sender)) revert NotAdmin();
        if (!_isMember[groupId][member]) revert NotMember();
        if (member == _groups[groupId].owner) revert OwnerCannotBeRemoved();
        // Owner or admin may remove; admins cannot remove other admins unless owner.
        if (_isAdmin[groupId][member] && msg.sender != _groups[groupId].owner) revert NotOwner();
        _isMember[groupId][member] = false;
        _isAdmin[groupId][member] = false;
        _groups[groupId].memberCount -= 1;
        _bumpKeyVersion(groupId);
        emit MemberRemoved(groupId, member, msg.sender);
    }

    /// @notice Leave a group voluntarily (owner must transfer ownership first).
    function leave(bytes32 groupId) external onlyActiveGroup(groupId) {
        if (!_isMember[groupId][msg.sender]) revert NotMember();
        if (msg.sender == _groups[groupId].owner) revert OwnerCannotBeRemoved();
        _isMember[groupId][msg.sender] = false;
        _isAdmin[groupId][msg.sender] = false;
        _groups[groupId].memberCount -= 1;
        _bumpKeyVersion(groupId);
        emit MemberRemoved(groupId, msg.sender, msg.sender);
    }

    function promoteAdmin(bytes32 groupId, address member) external onlyActiveGroup(groupId) {
        if (msg.sender != _groups[groupId].owner) revert NotOwner();
        if (!_isMember[groupId][member]) revert NotMember();
        _isAdmin[groupId][member] = true;
        emit AdminPromoted(groupId, member);
    }

    function demoteAdmin(bytes32 groupId, address member) external onlyActiveGroup(groupId) {
        if (msg.sender != _groups[groupId].owner) revert NotOwner();
        _isAdmin[groupId][member] = false;
        emit AdminDemoted(groupId, member);
    }

    function transferOwnership(bytes32 groupId, address newOwner) external onlyActiveGroup(groupId) {
        if (msg.sender != _groups[groupId].owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        if (!_isMember[groupId][newOwner]) revert NotMember();
        address old = _groups[groupId].owner;
        _groups[groupId].owner = newOwner;
        _isAdmin[groupId][newOwner] = true;
        emit OwnershipTransferred(groupId, old, newOwner);
    }

    function closeGroup(bytes32 groupId) external {
        if (!_groups[groupId].exists) revert GroupNotFound();
        if (msg.sender != _groups[groupId].owner) revert NotOwner();
        if (!_groups[groupId].active) revert GroupInactive();
        _groups[groupId].active = false;
        emit GroupClosed(groupId);
    }

    function reopen(bytes32 groupId) external {
        if (!_groups[groupId].exists) revert GroupNotFound();
        if (msg.sender != _groups[groupId].owner) revert NotOwner();
        _groups[groupId].active = true;
        emit GroupReopened(groupId);
    }

    function _bumpKeyVersion(bytes32 groupId) private {
        _groups[groupId].keyVersion += 1;
        emit GroupKeyRotated(groupId, _groups[groupId].keyVersion);
    }

    // ---- Views (no enumeration of history; clients use events) ----
    function getGroup(bytes32 groupId)
        external
        view
        returns (bool exists, bool active, string memory name, address owner, uint32 keyVersion, uint32 memberCount)
    {
        Group storage g = _groups[groupId];
        return (g.exists, g.active, g.name, g.owner, g.keyVersion, g.memberCount);
    }

    function isMember(bytes32 groupId, address who) external view returns (bool) {
        return _isMember[groupId][who];
    }

    function isAdmin(bytes32 groupId, address who) external view returns (bool) {
        return _isAdmin[groupId][who];
    }

    function getMembers(bytes32 groupId) external view returns (address[] memory) {
        return _memberList[groupId];
    }
}
