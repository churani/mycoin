// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SiHiStaking} from "./SiHiStaking.sol";

/**
 * @title  SiHiGovernance
 * @notice 거버넌스 기능
 */
abstract contract SiHiGovernance is SiHiStaking {

    struct Proposal {
        uint256 id;
        address proposer;
        string  description;
        uint256 startTime;
        uint256 endTime;
        uint256 forVotes;
        uint256 againstVotes;
        bool    executed;
        bool    canceled;
    }

    mapping(uint256 => Proposal)                    private _proposals;
    mapping(uint256 => mapping(address => bool))    private _hasVoted;
    mapping(uint256 => mapping(address => uint256)) private _voteWeight;

    uint256 public proposalCount;
    uint256 public votingDuration    = 3 days;
    uint256 public proposalThreshold = 1_000 * 10 ** 18;

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string  description,
        uint256 startTime,
        uint256 endTime
    );
    event Voted(
        uint256 indexed proposalId,
        address indexed voter,
        bool    support,
        uint256 weight
    );
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCanceled(uint256 indexed proposalId);
    event VotingDurationChanged(uint256 oldDuration, uint256 newDuration);
    event ProposalThresholdChanged(uint256 oldThreshold, uint256 newThreshold);

    function setVotingDuration(uint256 duration) external onlyOwner {
        require(duration >= 1 days,  "SiHi: duration too short");
        require(duration <= 30 days, "SiHi: duration too long");
        uint256 old = votingDuration;
        votingDuration = duration;
        emit VotingDurationChanged(old, duration);
    }

    function setProposalThreshold(uint256 threshold) external onlyOwner {
        uint256 old = proposalThreshold;
        proposalThreshold = threshold;
        emit ProposalThresholdChanged(old, threshold);
    }

    function propose(string calldata description) external returns (uint256) {
        require(
            balanceOf(msg.sender) >= proposalThreshold,
            "SiHi: insufficient tokens to propose"
        );
        uint256 proposalId = ++proposalCount;
        _proposals[proposalId] = Proposal({
            id:           proposalId,
            proposer:     msg.sender,
            description:  description,
            startTime:    block.timestamp,
            endTime:      block.timestamp + votingDuration,
            forVotes:     0,
            againstVotes: 0,
            executed:     false,
            canceled:     false
        });
        emit ProposalCreated(
            proposalId,
            msg.sender,
            description,
            block.timestamp,
            block.timestamp + votingDuration
        );
        return proposalId;
    }

    function vote(uint256 proposalId, bool support) external {
        Proposal storage proposal = _proposals[proposalId];
        require(proposal.id != 0,                    "SiHi: proposal not found");
        require(!proposal.canceled,                  "SiHi: proposal canceled");
        require(!proposal.executed,                  "SiHi: proposal executed");
        require(block.timestamp <= proposal.endTime, "SiHi: voting ended");
        require(!_hasVoted[proposalId][msg.sender],  "SiHi: already voted");
        uint256 weight = balanceOf(msg.sender);
        require(weight > 0, "SiHi: no voting power");
        _hasVoted[proposalId][msg.sender]   = true;
        _voteWeight[proposalId][msg.sender] = weight;
        if (support) {
            proposal.forVotes += weight;
        } else {
            proposal.againstVotes += weight;
        }
        emit Voted(proposalId, msg.sender, support, weight);
    }

    function proposalState(uint256 proposalId) public view returns (uint8) {
        Proposal memory proposal = _proposals[proposalId];
        if (proposal.canceled) return 3;
        if (block.timestamp <= proposal.endTime) return 0;
        if (proposal.forVotes > proposal.againstVotes) return 1;
        return 2;
    }

    function executeProposal(uint256 proposalId) external onlyOwner {
        Proposal storage proposal = _proposals[proposalId];
        require(proposalState(proposalId) == 1, "SiHi: proposal not passed");
        require(!proposal.executed,             "SiHi: already executed");
        proposal.executed = true;
        emit ProposalExecuted(proposalId);
    }

    function cancelProposal(uint256 proposalId) external {
        Proposal storage proposal = _proposals[proposalId];
        require(proposal.id != 0,   "SiHi: proposal not found");
        require(!proposal.canceled, "SiHi: already canceled");
        require(!proposal.executed, "SiHi: already executed");
        require(
            msg.sender == owner() || msg.sender == proposal.proposer,
            "SiHi: not authorized"
        );
        proposal.canceled = true;
        emit ProposalCanceled(proposalId);
    }

    function getProposal(uint256 proposalId)
        external view returns (Proposal memory)
    {
        return _proposals[proposalId];
    }

    function hasVoted(uint256 proposalId, address account)
        external view returns (bool)
    {
        return _hasVoted[proposalId][account];
    }
}