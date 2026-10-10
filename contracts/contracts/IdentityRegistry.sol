// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IdentityRegistry — wallet identity + versioned encryption-key references.
/// @notice Stores NO private keys, plaintext, or sensitive encryption material.
/// Only a fingerprint / versioned public-key reference (e.g. IPFS CID or key hash) is stored.
contract IdentityRegistry {
    struct Identity {
        bool registered;
        bool active;
        string profileRef; // e.g. IPFS CID of public profile metadata (no PII required)
        bytes32 keyFingerprint; // SHA-256 over the public encryption key bytes
        uint32 keyVersion; // increments on rotation
        string keyRef; // optional versioned public-key reference (CID/URL), never private material
        uint64 registeredAt;
        uint64 updatedAt;
    }

    mapping(address => Identity) private _identities;

    event Registered(address indexed wallet, bytes32 keyFingerprint, uint32 keyVersion);
    event ProfileUpdated(address indexed wallet, string profileRef);
    event EncryptionKeyUpdated(address indexed wallet, bytes32 keyFingerprint, uint32 keyVersion, string keyRef);
    event Deactivated(address indexed wallet);
    event Reactivated(address indexed wallet);

    error AlreadyRegistered();
    error NotRegistered();
    error Inactive();
    error ZeroAddress();
    error EmptyFingerprint();

    /// @notice Register the caller's wallet as an application identity.
    function register(string calldata profileRef, bytes32 keyFingerprint, string calldata keyRef) external {
        if (msg.sender == address(0)) revert ZeroAddress();
        if (_identities[msg.sender].registered) revert AlreadyRegistered();
        if (keyFingerprint == bytes32(0)) revert EmptyFingerprint();
        _identities[msg.sender] = Identity({
            registered: true,
            active: true,
            profileRef: profileRef,
            keyFingerprint: keyFingerprint,
            keyVersion: 1,
            keyRef: keyRef,
            registeredAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp)
        });
        emit Registered(msg.sender, keyFingerprint, 1);
    }

    /// @notice Update public profile metadata reference. Caller must be registered + active.
    function updateProfile(string calldata profileRef) external {
        Identity storage id = _identities[msg.sender];
        if (!id.registered) revert NotRegistered();
        if (!id.active) revert Inactive();
        id.profileRef = profileRef;
        id.updatedAt = uint64(block.timestamp);
        emit ProfileUpdated(msg.sender, profileRef);
    }

    /// @notice Rotate the caller's public encryption key reference (version increments).
    function rotateKey(bytes32 newFingerprint, string calldata newKeyRef) external {
        Identity storage id = _identities[msg.sender];
        if (!id.registered) revert NotRegistered();
        if (!id.active) revert Inactive();
        if (newFingerprint == bytes32(0)) revert EmptyFingerprint();
        id.keyFingerprint = newFingerprint;
        id.keyVersion += 1;
        id.keyRef = newKeyRef;
        id.updatedAt = uint64(block.timestamp);
        emit EncryptionKeyUpdated(msg.sender, newFingerprint, id.keyVersion, newKeyRef);
    }

    /// @notice Deactivate own profile (soft delete). Re-activation allowed.
    function deactivate() external {
        Identity storage id = _identities[msg.sender];
        if (!id.registered) revert NotRegistered();
        if (!id.active) revert Inactive();
        id.active = false;
        id.updatedAt = uint64(block.timestamp);
        emit Deactivated(msg.sender);
    }

    function reactivate() external {
        Identity storage id = _identities[msg.sender];
        if (!id.registered) revert NotRegistered();
        if (id.active) revert AlreadyRegistered();
        id.active = true;
        id.updatedAt = uint64(block.timestamp);
        emit Reactivated(msg.sender);
    }

    function getIdentity(address wallet)
        external
        view
        returns (
            bool registered,
            bool active,
            string memory profileRef,
            bytes32 keyFingerprint,
            uint32 keyVersion,
            string memory keyRef
        )
    {
        Identity storage id = _identities[wallet];
        return (id.registered, id.active, id.profileRef, id.keyFingerprint, id.keyVersion, id.keyRef);
    }

    function isActive(address wallet) external view returns (bool) {
        Identity storage id = _identities[wallet];
        return id.registered && id.active;
    }
}
