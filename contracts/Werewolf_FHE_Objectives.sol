pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract WerewolfFHEObjectivesFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    uint256 public cooldownSeconds = 30;

    bool public paused;
    uint256 public currentBatchId = 0;
    bool public batchOpen = false;

    struct PlayerObjective {
        euint32 playerRole; // Encrypted: 0=Villager, 1=Werewolf, 2=Seer, etc.
        euint32 targetPlayerId; // Encrypted: ID of the player this objective is about
        euint32 objectiveType; // Encrypted: 0=Protect, 1=MisleadVote, 2=SurviveAs, etc.
        ebool isCompleted; // Encrypted: true if objective is completed
    }

    mapping(uint256 => mapping(address => PlayerObjective)) public playerObjectives; // batchId -> playerAddress -> objective
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event CooldownSecondsSet(uint256 oldCooldown, uint256 newCooldown);
    event Paused(address account);
    event Unpaused(address account);
    event BatchOpened(uint256 batchId);
    event BatchClosed(uint256 batchId);
    event ObjectiveSubmitted(address indexed player, uint256 batchId);
    event DecryptionRequested(uint256 indexed requestId, uint256 batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 batchId, bytes32 stateHash);

    error NotOwner();
    error NotProvider();
    error PausedState();
    error CooldownActive();
    error BatchNotOpen();
    error InvalidBatch();
    error ReplayAttempt();
    error StateMismatch();
    error NotInitialized();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedState();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        emit ProviderAdded(owner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setCooldownSeconds(uint256 newCooldown) external onlyOwner {
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldown;
        emit CooldownSecondsSet(oldCooldown, newCooldown);
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        if (!paused) revert PausedState(); // Already unpaused
        paused = false;
        emit Unpaused(msg.sender);
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        batchOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (!batchOpen) revert InvalidBatch();
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitObjective(
        euint32 _playerRole,
        euint32 _targetPlayerId,
        euint32 _objectiveType,
        ebool _isCompleted
    ) external onlyProvider whenNotPaused checkSubmissionCooldown {
        if (!batchOpen) revert BatchNotOpen();

        _initIfNeeded(_playerRole);
        _initIfNeeded(_targetPlayerId);
        _initIfNeeded(_objectiveType);
        _initIfNeededBool(_isCompleted);

        playerObjectives[currentBatchId][msg.sender] = PlayerObjective({
            playerRole: _playerRole,
            targetPlayerId: _targetPlayerId,
            objectiveType: _objectiveType,
            isCompleted: _isCompleted
        });
        lastSubmissionTime[msg.sender] = block.timestamp;
        emit ObjectiveSubmitted(msg.sender, currentBatchId);
    }

    function requestObjectiveVerification(uint256 _batchId, address _player) external onlyProvider whenNotPaused checkDecryptionCooldown {
        if (_batchId == 0 || _batchId > currentBatchId) revert InvalidBatch();

        PlayerObjective storage obj = playerObjectives[_batchId][_player];

        _requireInitialized(obj.playerRole);
        _requireInitialized(obj.targetPlayerId);
        _requireInitialized(obj.objectiveType);
        _requireInitializedBool(obj.isCompleted);

        // 1. Prepare Ciphertexts
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = obj.isCompleted.toBytes32();

        // 2. Compute State Hash
        bytes32 stateHash = _hashCiphertexts(cts);

        // 3. Request Decryption
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        // 4. Store Context
        decryptionContexts[requestId] = DecryptionContext({ batchId: _batchId, stateHash: stateHash, processed: false });
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, _batchId, stateHash);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        DecryptionContext storage ctx = decryptionContexts[requestId];

        // a. Replay Guard
        if (ctx.processed) revert ReplayAttempt();

        // b. State Verification
        // Rebuild cts from storage in the exact same order as in requestObjectiveVerification
        PlayerObjective storage obj = playerObjectives[ctx.batchId][msg.sender]; // msg.sender is the provider who initiated
        bytes32[] memory currentCts = new bytes32[](1);
        currentCts[0] = obj.isCompleted.toBytes32();
        bytes32 currentHash = _hashCiphertexts(currentCts);

        if (currentHash != ctx.stateHash) {
            revert StateMismatch();
        }

        // c. Proof Verification
        FHE.checkSignatures(requestId, cleartexts, proof);

        // d. Decode & Finalize
        // For this example, we only decrypt one ebool (isCompleted)
        // The cleartexts array will have one element, which is the decrypted boolean
        bool isCompletedCleartext = abi.decode(cleartexts, (bool));

        // Example: Emit an event with the decrypted result
        // emit ObjectiveStatusVerified(requestId, ctx.batchId, msg.sender, isCompletedCleartext);

        ctx.processed = true;
        emit DecryptionCompleted(requestId, ctx.batchId, ctx.stateHash);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 v) internal {
        if (!v.isInitialized()) {
            v.init();
        }
    }

    function _initIfNeededBool(ebool v) internal {
        if (!v.isInitialized()) {
            v.init();
        }
    }

    function _requireInitialized(euint32 v) internal view {
        if (!v.isInitialized()) {
            revert NotInitialized();
        }
    }

    function _requireInitializedBool(ebool v) internal view {
        if (!v.isInitialized()) {
            revert NotInitialized();
        }
    }
}