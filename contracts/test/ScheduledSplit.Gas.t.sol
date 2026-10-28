// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ScheduledSplitBase} from "./ScheduledSplit.Base.t.sol";
import {ScheduledSplit} from "../ScheduledSplit.sol";
import {console} from "forge-std/console.sol";

contract ScheduledSplitGasTest is ScheduledSplitBase {

    uint256 internal constant N_RECIPIENTS = 50;
    uint256 internal constant N_PAYMENTS   = 24;

    function setUp() public override {
        super.setUp();
        // Fund payer generously for max-size schedule
        uint256 needed = uint256(AMOUNT) * N_PAYMENTS;
        token.mint(payer, needed);
        // Approval already set to max in base setUp
    }

    // ─── createSchedule gas benchmark: 50 recipients × 24 payments ───────────

    function test_Gas_CreateSchedule_50x24() public {
        address[] memory r = _makeRecipients(N_RECIPIENTS);
        uint16[] memory b = _equalBps(N_RECIPIENTS);
        uint64[] memory d = _due24();

        uint256 totalDeposit = uint256(AMOUNT) * N_PAYMENTS;
        // Ensure payer has enough allowance and balance
        token.mint(payer, totalDeposit);

        vm.startPrank(payer);

        uint256 gasBefore = gasleft();
        uint256 id = ss.createSchedule("GasBench50x24", r, b, AMOUNT, d);
        uint256 gasUsed = gasBefore - gasleft();

        vm.stopPrank();

        console.log("=== GAS BENCHMARK ===");
        console.log("createSchedule(50 recipients, 24 payments) gas:", gasUsed);
        assertGt(id, 0);

        // Sanity: schedule created correctly
        ScheduledSplit.Schedule memory s = ss.getSchedule(id);
        assertEq(s.recipients.length, N_RECIPIENTS);
        assertEq(s.dueTimes.length, N_PAYMENTS);
    }

    // ─── execute gas benchmark: 50 recipients × 1 payment ────────────────────

    function test_Gas_Execute_50Recipients() public {
        address[] memory r = _makeRecipients(N_RECIPIENTS);
        uint16[] memory b = _equalBps(N_RECIPIENTS);
        uint64[] memory d = _due1();

        token.mint(payer, uint256(AMOUNT));

        vm.prank(payer);
        uint256 id = ss.createSchedule("GasBenchExec50", r, b, AMOUNT, d);

        vm.warp(DUE1);

        uint256 gasBefore = gasleft();
        ss.execute(id);
        uint256 gasUsed = gasBefore - gasleft();

        console.log("execute(50 recipients) gas:", gasUsed);
    }

    // ─── Full 50×24 cycle: create then execute all 24 payments ───────────────

    function test_Gas_Execute_50x24_AllPayments() public {
        address[] memory r = _makeRecipients(N_RECIPIENTS);
        uint16[] memory b = _equalBps(N_RECIPIENTS);
        uint64[] memory d = _due24();

        token.mint(payer, uint256(AMOUNT) * N_PAYMENTS);

        vm.prank(payer);
        uint256 id = ss.createSchedule("GasBenchFull", r, b, AMOUNT, d);

        uint256 totalExecuteGas = 0;
        for (uint256 i = 0; i < N_PAYMENTS; ++i) {
            vm.warp(d[i]);
            uint256 gasBefore = gasleft();
            ss.execute(id);
            totalExecuteGas += gasBefore - gasleft();
        }

        console.log("execute(50 recipients) avg gas over 24 payments:", totalExecuteGas / N_PAYMENTS);
        console.log("execute(50 recipients) total gas for 24 payments:", totalExecuteGas);
    }
}
