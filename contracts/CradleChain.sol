// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract CradleChain is ERC721 {
    enum Category { Urgent, Ongoing, LongTerm }

    struct Campaign {
        string name;
        string description;
        address targetWallet;
        Category category;
        address organizer;
        bool exists;
    }

    struct Donation {
        address donor;
        uint256 amount;
        uint256 timestamp;
        bool released;
    }

    uint256 public constant MIN_CONFIRMER_STAKE = 0.1 ether;
    address public immutable platformOwner;

    struct ConfirmerInfo {
        string label;
        uint256 stake;
        bool isAllowed;
    }

    uint256 public nextCampaignId;
    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => Donation[]) public campaignDonations;
    mapping(address => ConfirmerInfo) public platformConfirmers;
    address[] public platformConfirmerList;
    mapping(uint256 => address) public campaignConfirmer;
    mapping(uint256 => bool) public confirmerRegistered;

    struct ConfirmerRequest {
        string label;
        string jppmRegNumber;
        bool exists;
    }

    mapping(address => ConfirmerRequest) public confirmerRequests;
    address[] public confirmerRequestList;
    mapping(address => bool) private requestListed;

    enum CheckpointStatus { Pending, Confirmed }

    struct CustodyEvent {
        uint256 donationId;
        string stageName;
        string ipfsProofHash;
        CheckpointStatus status;
        uint256 loggedAt;
        uint256 confirmedAt;
    }

    mapping(uint256 => CustodyEvent[]) public campaignCheckpoints;

    event DonationTagged(uint256 campaignId, uint256 donationId, address donor, uint256 amount, uint256 timestamp);
    event CheckpointLogged(uint256 campaignId, uint256 checkpointId, string stageName);
    event CheckpointConfirmation(uint256 campaignId, uint256 checkpointId);
    event FundsReleased(uint256 campaignId, uint256 donationId, uint256 amount);
    event ConfirmerRequested(address indexed requester, string label, string jppmRegNumber);

    constructor() ERC721("CradleChain Completion", "CCND") {
        platformOwner = msg.sender;
    }

    modifier onlyPlatformOwner() {
        require(msg.sender == platformOwner, "not platform owner");
        _;
    }

    function createCampaign(string calldata name, string calldata description, address targetWallet, Category category) external returns (uint256 campaignId) {
        campaignId = nextCampaignId++;
        campaigns[campaignId] = Campaign(name, description, targetWallet, category, msg.sender, true);
    }

    function donate(uint256 campaignId) external payable {
        require(campaigns[campaignId].exists, "campaign does not exist");
        uint256 donationId = campaignDonations[campaignId].length;
        campaignDonations[campaignId].push(Donation(msg.sender, msg.value, block.timestamp, false));
        emit DonationTagged(campaignId, donationId, msg.sender, msg.value, block.timestamp);
    }

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }

    function addPlatformConfirmer(address confirmer, string calldata label) external payable onlyPlatformOwner {
        require(msg.value >= MIN_CONFIRMER_STAKE, "stake below minimum");
        require(!platformConfirmers[confirmer].isAllowed, "already allowlisted");
        platformConfirmers[confirmer] = ConfirmerInfo(label, msg.value, true);
        platformConfirmerList.push(confirmer);
        delete confirmerRequests[confirmer];
    }

    function requestConfirmerStatus(string calldata label, string calldata jppmRegNumber) external {
        require(!confirmerRequests[msg.sender].exists, "request already pending");
        confirmerRequests[msg.sender] = ConfirmerRequest(label, jppmRegNumber, true);
        if (!requestListed[msg.sender]) {
            requestListed[msg.sender] = true;
            confirmerRequestList.push(msg.sender);
        }
        emit ConfirmerRequested(msg.sender, label, jppmRegNumber);
    }

    function getConfirmerRequestList() external view returns (address[] memory) {
        return confirmerRequestList;
    }

    function registerConfirmer(uint256 campaignId, address confirmerAddress) external {
        require(campaigns[campaignId].exists, "campaign does not exist");
        require(campaigns[campaignId].organizer == msg.sender, "not campaign organizer");
        require(!confirmerRegistered[campaignId], "confirmer already registered");
        require(campaignDonations[campaignId].length == 0, "confirmer must be registered before first donation");
        require(platformConfirmers[confirmerAddress].isAllowed, "confirmer not platform-verified");
        campaignConfirmer[campaignId] = confirmerAddress;
        confirmerRegistered[campaignId] = true;
    }

    function getConfirmerList() external view returns (address[] memory) {
        return platformConfirmerList;
    }

    function logCheckpoint(
        uint256 campaignId,
        uint256 donationId,
        string calldata stageName,
        string calldata ipfsProofHash
    ) external returns (uint256 checkpointId) {
        require(campaigns[campaignId].organizer == msg.sender, "not campaign organizer");
        require(bytes(ipfsProofHash).length > 0, "evidence proof required");
        checkpointId = campaignCheckpoints[campaignId].length;
        campaignCheckpoints[campaignId].push(
            CustodyEvent(donationId, stageName, ipfsProofHash, CheckpointStatus.Pending, block.timestamp, 0)
        );
        emit CheckpointLogged(campaignId, checkpointId, stageName);
    }

    function getCampaignHistory(uint256 campaignId) external view returns (CustodyEvent[] memory) {
        return campaignCheckpoints[campaignId];
    }

    function confirmCheckpoint(uint256 campaignId, uint256 checkpointId) external {
        require(confirmerRegistered[campaignId], "no confirmer registered");
        require(campaignConfirmer[campaignId] == msg.sender, "not the registered confirmer");
        require(platformConfirmers[msg.sender].isAllowed, "confirmer no longer platform-verified");
        CustodyEvent storage checkpoint = campaignCheckpoints[campaignId][checkpointId];
        require(checkpoint.status == CheckpointStatus.Pending, "checkpoint not pending");
        require(checkpoint.donationId < campaignDonations[campaignId].length, "donation does not exist");
        checkpoint.status = CheckpointStatus.Confirmed;
        checkpoint.confirmedAt = block.timestamp;
        emit CheckpointConfirmation(campaignId, checkpointId);

        Donation storage donation = campaignDonations[campaignId][checkpoint.donationId];
        if (!donation.released) {
            donation.released = true;
            emit FundsReleased(campaignId, checkpoint.donationId, donation.amount);
            (bool sent, ) = campaigns[campaignId].targetWallet.call{value: donation.amount}("");
            require(sent, "forward to target wallet failed");
        }
    }

    // Shortened from 3 minutes for the recorded demo — a full real-time revoke -> cooldown ->
    // finalize sequence has to fit inside a ~3.5 minute video with no cuts or speed-up.
    uint256 public constant REVOCATION_COOLDOWN = 8 seconds;

    struct PendingRevocation {
        address oldConfirmer;
        address newConfirmer;
        uint256 revokeAt;
        bool active;
    }

    mapping(uint256 => PendingRevocation) public pendingRevocations;

    event ConfirmerRevocationScheduled(uint256 campaignId, address oldConfirmer, address newConfirmer, uint256 revokeAt);
    event ConfirmerRevocationFinalized(uint256 campaignId, address newConfirmer);

    function revokeConfirmer(uint256 campaignId, address newConfirmer) external onlyPlatformOwner {
        require(confirmerRegistered[campaignId], "no confirmer registered");
        require(platformConfirmers[newConfirmer].isAllowed, "new confirmer not platform-verified");
        uint256 revokeAt = block.timestamp + REVOCATION_COOLDOWN;
        pendingRevocations[campaignId] = PendingRevocation(campaignConfirmer[campaignId], newConfirmer, revokeAt, true);
        emit ConfirmerRevocationScheduled(campaignId, campaignConfirmer[campaignId], newConfirmer, revokeAt);
    }

    function finalizeRevocation(uint256 campaignId) external {
        PendingRevocation storage pending = pendingRevocations[campaignId];
        require(pending.active, "no pending revocation");
        require(block.timestamp >= pending.revokeAt, "cooldown not elapsed");
        campaignConfirmer[campaignId] = pending.newConfirmer;
        pending.active = false;
        emit ConfirmerRevocationFinalized(campaignId, pending.newConfirmer);
    }

    // Mirrors THRESHOLD_SECONDS in api/summarize.js's "gone dark" check — the category is fixed
    // at campaign creation, not organizer-adjustable, so there's no self-graded knob here either.
    uint256 public constant URGENT_THRESHOLD = 3 days;
    uint256 public constant ONGOING_THRESHOLD = 14 days;
    uint256 public constant LONGTERM_THRESHOLD = 30 days;

    function categoryThreshold(Category category) public pure returns (uint256) {
        if (category == Category.Urgent) return URGENT_THRESHOLD;
        if (category == Category.Ongoing) return ONGOING_THRESHOLD;
        return LONGTERM_THRESHOLD;
    }

    function isOverdue(uint256 campaignId) public view returns (bool) {
        CustodyEvent[] storage events = campaignCheckpoints[campaignId];
        if (events.length == 0) return false;
        CustodyEvent storage last = events[events.length - 1];
        if (last.status != CheckpointStatus.Pending) return false;
        return block.timestamp >= last.loggedAt + categoryThreshold(campaigns[campaignId].category);
    }

    // Callable by anyone (unlike revokeConfirmer, which is onlyPlatformOwner) — the trigger
    // condition is objective on-chain staleness, not a judgment call, so no admin gate is
    // needed to start the cooldown. finalizeRevocation still executes the swap after the same
    // 3-minute window, so a flagOverdue-triggered replacement is publicly visible before it
    // takes effect, exactly like an admin-triggered one.
    function flagOverdue(uint256 campaignId, address replacementConfirmer) external {
        require(campaigns[campaignId].exists, "campaign does not exist");
        require(confirmerRegistered[campaignId], "no confirmer registered");
        require(isOverdue(campaignId), "checkpoint not overdue");
        require(!pendingRevocations[campaignId].active, "revocation already pending");
        require(platformConfirmers[replacementConfirmer].isAllowed, "replacement not platform-verified");
        require(replacementConfirmer != campaignConfirmer[campaignId], "replacement is the current confirmer");

        uint256 revokeAt = block.timestamp + REVOCATION_COOLDOWN;
        pendingRevocations[campaignId] = PendingRevocation(campaignConfirmer[campaignId], replacementConfirmer, revokeAt, true);
        emit ConfirmerRevocationScheduled(campaignId, campaignConfirmer[campaignId], replacementConfirmer, revokeAt);
    }

    function slashConfirmer(address confirmer) external onlyPlatformOwner {
        platformConfirmers[confirmer].isAllowed = false;
        platformConfirmers[confirmer].stake = 0;
    }

    function getConfirmerScore(address confirmer, uint256[] calldata campaignIds)
        external view returns (uint256 confirmed, uint256 total)
    {
        for (uint256 i = 0; i < campaignIds.length; i++) {
            uint256 cid = campaignIds[i];
            if (campaignConfirmer[cid] != confirmer) continue;
            CustodyEvent[] storage events = campaignCheckpoints[cid];
            total += events.length;
            for (uint256 j = 0; j < events.length; j++) {
                if (events[j].status == CheckpointStatus.Confirmed) confirmed++;
            }
        }
    }

    mapping(uint256 => bool) public completionMinted;
    event CompletionNFTMinted(uint256 campaignId, address to, uint256 tokenId);

    // tokenId == campaignId — a campaign can only ever produce one completion NFT, so there's
    // no need for a separate counter; this keeps the mapping from campaign to token trivial to
    // read both on-chain and in the frontend.
    function mintCompletionNFT(uint256 campaignId) external returns (uint256 tokenId) {
        require(campaigns[campaignId].exists, "campaign does not exist");
        require(!completionMinted[campaignId], "completion NFT already minted");
        CustodyEvent[] storage events = campaignCheckpoints[campaignId];
        require(events.length > 0, "no checkpoints logged");
        for (uint256 i = 0; i < events.length; i++) {
            require(events[i].status == CheckpointStatus.Confirmed, "not all checkpoints confirmed");
        }
        Donation[] storage donations_ = campaignDonations[campaignId];
        require(donations_.length > 0, "no donations to complete");
        for (uint256 i = 0; i < donations_.length; i++) {
            require(donations_[i].released, "not all donations released");
        }

        completionMinted[campaignId] = true;
        tokenId = campaignId;
        address organizer = campaigns[campaignId].organizer;
        _safeMint(organizer, tokenId);
        emit CompletionNFTMinted(campaignId, organizer, tokenId);
    }
}
