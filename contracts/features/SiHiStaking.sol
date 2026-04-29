// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SiHiVesting} from "./SiHiVesting.sol";

/**
 * @title  SiHiStaking
 * @notice 스테이킹 기능
 */
abstract contract SiHiStaking is SiHiVesting {

    struct StakeInfo {
        uint256 stakedAmount;
        uint256 startTime;
        uint256 rewardDebt;
    }

    mapping(address => StakeInfo) private _stakes;
    uint256 public aprRate;
    uint256 public constant MAX_APR = 10000;
    bool    public stakingEnabled;
    uint256 public totalStaked;

    event Staked(address indexed account, uint256 amount);
    event Unstaked(address indexed account, uint256 amount);
    event RewardClaimed(address indexed account, uint256 reward);
    event AprRateChanged(uint256 oldRate, uint256 newRate);
    event StakingEnabled();
    event StakingDisabled();

    function enableStaking() external onlyOwner {
        require(!stakingEnabled, "SiHi: staking already enabled");
        stakingEnabled = true;
        emit StakingEnabled();
    }

    function disableStaking() external onlyOwner {
        require(stakingEnabled, "SiHi: staking already disabled");
        stakingEnabled = false;
        emit StakingDisabled();
    }

    function setAprRate(uint256 rate) external onlyOwner {
        require(rate <= MAX_APR, "SiHi: apr too high");
        uint256 old = aprRate;
        aprRate = rate;
        emit AprRateChanged(old, rate);
    }

    function pendingReward(address account) public view returns (uint256) {
        StakeInfo memory info = _stakes[account];
        if (info.stakedAmount == 0 || aprRate == 0) return 0;
        uint256 elapsed = block.timestamp - info.startTime;
        uint256 reward  = info.stakedAmount * aprRate * elapsed / (10_000 * 365 days);
        return reward - info.rewardDebt;
    }

    function stake(uint256 amount) external {
        require(stakingEnabled, "SiHi: staking disabled");
        require(amount > 0,     "SiHi: amount is 0");
        StakeInfo storage info = _stakes[msg.sender];
        if (info.stakedAmount > 0) {
            uint256 reward = pendingReward(msg.sender);
            info.rewardDebt += reward;
        }
        _transfer(msg.sender, address(this), amount);
        info.stakedAmount += amount;
        info.startTime     = block.timestamp;
        info.rewardDebt    = 0;
        totalStaked       += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external {
        StakeInfo storage info = _stakes[msg.sender];
        require(info.stakedAmount >= amount, "SiHi: insufficient staked");
        uint256 reward     = pendingReward(msg.sender);
        info.stakedAmount -= amount;
        info.startTime     = block.timestamp;
        info.rewardDebt    = 0;
        totalStaked       -= amount;
        _transfer(address(this), msg.sender, amount);
        if (reward > 0) {
            require(totalSupply() + reward <= MAX_SUPPLY, "SiHi: MAX_SUPPLY exceeded");
            _mint(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }
        emit Unstaked(msg.sender, amount);
    }

    function claimReward() external {
        uint256 reward = pendingReward(msg.sender);
        require(reward > 0, "SiHi: no reward");
        require(totalSupply() + reward <= MAX_SUPPLY, "SiHi: MAX_SUPPLY exceeded");
        _stakes[msg.sender].startTime  = block.timestamp;
        _stakes[msg.sender].rewardDebt = 0;
        _mint(msg.sender, reward);
        emit RewardClaimed(msg.sender, reward);
    }

    function getStakeInfo(address account)
        external view returns (StakeInfo memory)
    {
        return _stakes[account];
    }
}