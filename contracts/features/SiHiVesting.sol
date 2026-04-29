// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SiHiBurnFee} from "./SiHiBurnFee.sol";

/**
 * @title  SiHiVesting
 * @notice 베스팅 기능
 */
abstract contract SiHiVesting is SiHiBurnFee {

    struct VestingSchedule {
        uint256 totalAmount;
        uint256 startTime;
        uint256 cliffDuration;
        uint256 vestingDuration;
        uint256 releasedAmount;
        bool    revoked;
    }

    mapping(address => VestingSchedule) private _vestingSchedules;

    event VestingCreated(
        address indexed beneficiary,
        uint256 totalAmount,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 vestingDuration
    );
    event VestingReleased(address indexed beneficiary, uint256 amount);
    event VestingRevoked(address indexed beneficiary, uint256 unreleasedAmount);

    function createVesting(
        address beneficiary,
        uint256 totalAmount,
        uint256 cliffDuration,
        uint256 vestingDuration
    ) external onlyOwner {
        require(beneficiary != address(0),                       "SiHi: zero address");
        require(totalAmount > 0,                                 "SiHi: amount is 0");
        require(vestingDuration > 0,                             "SiHi: duration is 0");
        require(cliffDuration <= vestingDuration,                "SiHi: cliff > duration");
        require(_vestingSchedules[beneficiary].totalAmount == 0, "SiHi: vesting exists");
        require(balanceOf(address(this)) >= totalAmount,         "SiHi: insufficient balance");

        _vestingSchedules[beneficiary] = VestingSchedule({
            totalAmount:     totalAmount,
            startTime:       block.timestamp,
            cliffDuration:   cliffDuration,
            vestingDuration: vestingDuration,
            releasedAmount:  0,
            revoked:         false
        });

        emit VestingCreated(
            beneficiary,
            totalAmount,
            block.timestamp,
            cliffDuration,
            vestingDuration
        );
    }

    function releasableAmount(address beneficiary) public view returns (uint256) {
        VestingSchedule memory schedule = _vestingSchedules[beneficiary];
        if (schedule.totalAmount == 0 || schedule.revoked) return 0;
        if (block.timestamp < schedule.startTime + schedule.cliffDuration) return 0;
        if (block.timestamp >= schedule.startTime + schedule.vestingDuration) {
            return schedule.totalAmount - schedule.releasedAmount;
        }
        uint256 elapsed = block.timestamp - schedule.startTime;
        uint256 vested  = schedule.totalAmount * elapsed / schedule.vestingDuration;
        return vested - schedule.releasedAmount;
    }

    function releaseVesting() external {
        uint256 amount = releasableAmount(msg.sender);
        require(amount > 0, "SiHi: nothing to release");
        _vestingSchedules[msg.sender].releasedAmount += amount;
        _transfer(address(this), msg.sender, amount);
        emit VestingReleased(msg.sender, amount);
    }

    function revokeVesting(address beneficiary) external onlyOwner {
        VestingSchedule storage schedule = _vestingSchedules[beneficiary];
        require(schedule.totalAmount > 0, "SiHi: no vesting");
        require(!schedule.revoked,        "SiHi: already revoked");
        uint256 unreleased = schedule.totalAmount - schedule.releasedAmount;
        schedule.revoked = true;
        if (unreleased > 0) {
            _transfer(address(this), owner(), unreleased);
        }
        emit VestingRevoked(beneficiary, unreleased);
    }

    function getVestingSchedule(address beneficiary)
        external view returns (VestingSchedule memory)
    {
        return _vestingSchedules[beneficiary];
    }
}