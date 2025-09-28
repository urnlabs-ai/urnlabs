import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("DAOGovernance", function () {
  async function deployDAOGovernanceFixture() {
    const [owner, proposer, voter1, voter2, voter3, executor] = await ethers.getSigners();

    // Deploy governance token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const governanceToken = await MockERC20.deploy("Governance Token", "GOV", ethers.parseEther("1000000"));

    // Deploy DAOGovernance
    const DAOGovernance = await ethers.getContractFactory("DAOGovernance");
    const dao = await DAOGovernance.deploy(
      await governanceToken.getAddress(),
      ethers.parseEther("1000"), // minimum tokens to propose
      86400, // 1 day voting period
      3600   // 1 hour timelock delay
    );

    // Distribute tokens
    await governanceToken.transfer(proposer.address, ethers.parseEther("2000"));
    await governanceToken.transfer(voter1.address, ethers.parseEther("10000"));
    await governanceToken.transfer(voter2.address, ethers.parseEther("5000"));
    await governanceToken.transfer(voter3.address, ethers.parseEther("3000"));

    // Delegate voting power
    await governanceToken.connect(proposer).delegate(proposer.address);
    await governanceToken.connect(voter1).delegate(voter1.address);
    await governanceToken.connect(voter2).delegate(voter2.address);
    await governanceToken.connect(voter3).delegate(voter3.address);

    return {
      dao,
      governanceToken,
      owner,
      proposer,
      voter1,
      voter2,
      voter3,
      executor
    };
  }

  describe("Deployment", function () {
    it("Should set the correct governance token", async function () {
      const { dao, governanceToken } = await loadFixture(deployDAOGovernanceFixture);

      expect(await dao.governanceToken()).to.equal(await governanceToken.getAddress());
    });

    it("Should set the correct proposal threshold", async function () {
      const { dao } = await loadFixture(deployDAOGovernanceFixture);

      expect(await dao.proposalThreshold()).to.equal(ethers.parseEther("1000"));
    });

    it("Should set the correct voting period", async function () {
      const { dao } = await loadFixture(deployDAOGovernanceFixture);

      expect(await dao.votingPeriod()).to.equal(86400);
    });

    it("Should set the correct timelock delay", async function () {
      const { dao } = await loadFixture(deployDAOGovernanceFixture);

      expect(await dao.timelockDelay()).to.equal(3600);
    });
  });

  describe("Proposal Creation", function () {
    it("Should create a proposal with sufficient tokens", async function () {
      const { dao, proposer } = await loadFixture(deployDAOGovernanceFixture);

      const targets = [proposer.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Test proposal";

      await expect(
        dao.connect(proposer).propose(targets, values, calldatas, description)
      ).to.emit(dao, "ProposalCreated")
        .withArgs(0, proposer.address, targets, values, calldatas, description);

      const proposal = await dao.proposals(0);
      expect(proposal.proposer).to.equal(proposer.address);
      expect(proposal.description).to.equal(description);
      expect(proposal.state).to.equal(0); // Active
    });

    it("Should not allow proposal with insufficient tokens", async function () {
      const { dao, voter3 } = await loadFixture(deployDAOGovernanceFixture);

      const targets = [voter3.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Test proposal";

      await expect(
        dao.connect(voter3).propose(targets, values, calldatas, description)
      ).to.be.revertedWith("Insufficient voting power to propose");
    });

    it("Should not allow empty proposals", async function () {
      const { dao, proposer } = await loadFixture(deployDAOGovernanceFixture);

      await expect(
        dao.connect(proposer).propose([], [], [], "Empty proposal")
      ).to.be.revertedWith("Empty proposal");
    });

    it("Should not allow mismatched arrays", async function () {
      const { dao, proposer } = await loadFixture(deployDAOGovernanceFixture);

      const targets = [proposer.address];
      const values = [0, 1]; // Mismatched length
      const calldatas = ["0x"];

      await expect(
        dao.connect(proposer).propose(targets, values, calldatas, "Mismatched proposal")
      ).to.be.revertedWith("Proposal function information mismatch");
    });
  });

  describe("Voting", function () {
    beforeEach(async function () {
      const { dao, proposer } = await loadFixture(deployDAOGovernanceFixture);

      // Create a proposal
      const targets = [proposer.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Test proposal";

      await dao.connect(proposer).propose(targets, values, calldatas, description);
    });

    it("Should allow voting for proposals", async function () {
      const { dao, voter1 } = await loadFixture(deployDAOGovernanceFixture);

      await expect(dao.connect(voter1).castVote(0, 1)) // Vote FOR
        .to.emit(dao, "VoteCast")
        .withArgs(voter1.address, 0, 1, ethers.parseEther("10000"));

      const proposal = await dao.proposals(0);
      expect(proposal.forVotes).to.equal(ethers.parseEther("10000"));
    });

    it("Should allow voting against proposals", async function () {
      const { dao, voter2 } = await loadFixture(deployDAOGovernanceFixture);

      await dao.connect(voter2).castVote(0, 0); // Vote AGAINST

      const proposal = await dao.proposals(0);
      expect(proposal.againstVotes).to.equal(ethers.parseEther("5000"));
    });

    it("Should allow abstaining from proposals", async function () {
      const { dao, voter3 } = await loadFixture(deployDAOGovernanceFixture);

      await dao.connect(voter3).castVote(0, 2); // ABSTAIN

      const proposal = await dao.proposals(0);
      expect(proposal.abstainVotes).to.equal(ethers.parseEther("3000"));
    });

    it("Should not allow double voting", async function () {
      const { dao, voter1 } = await loadFixture(deployDAOGovernanceFixture);

      await dao.connect(voter1).castVote(0, 1);

      await expect(
        dao.connect(voter1).castVote(0, 0)
      ).to.be.revertedWith("Already voted");
    });

    it("Should not allow voting on non-existent proposals", async function () {
      const { dao, voter1 } = await loadFixture(deployDAOGovernanceFixture);

      await expect(
        dao.connect(voter1).castVote(999, 1)
      ).to.be.revertedWith("Invalid proposal");
    });

    it("Should not allow voting after voting period ends", async function () {
      const { dao, voter1 } = await loadFixture(deployDAOGovernanceFixture);

      // Fast forward past voting period
      await time.increase(86401); // 1 day + 1 second

      await expect(
        dao.connect(voter1).castVote(0, 1)
      ).to.be.revertedWith("Voting period has ended");
    });
  });

  describe("Proposal States", function () {
    beforeEach(async function () {
      const { dao, proposer } = await loadFixture(deployDAOGovernanceFixture);

      const targets = [proposer.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Test proposal";

      await dao.connect(proposer).propose(targets, values, calldatas, description);
    });

    it("Should return correct state for active proposal", async function () {
      const { dao } = await loadFixture(deployDAOGovernanceFixture);

      expect(await dao.state(0)).to.equal(0); // Active
    });

    it("Should return correct state for succeeded proposal", async function () {
      const { dao, voter1, voter2 } = await loadFixture(deployDAOGovernanceFixture);

      // Vote with majority FOR
      await dao.connect(voter1).castVote(0, 1); // 10000 tokens
      await dao.connect(voter2).castVote(0, 1); // 5000 tokens

      // End voting period
      await time.increase(86401);

      expect(await dao.state(0)).to.equal(1); // Succeeded
    });

    it("Should return correct state for defeated proposal", async function () {
      const { dao, voter1, voter2 } = await loadFixture(deployDAOGovernanceFixture);

      // Vote with majority AGAINST
      await dao.connect(voter1).castVote(0, 0); // 10000 tokens against
      await dao.connect(voter2).castVote(0, 1); // 5000 tokens for

      // End voting period
      await time.increase(86401);

      expect(await dao.state(0)).to.equal(2); // Defeated
    });

    it("Should queue succeeded proposal", async function () {
      const { dao, voter1, voter2 } = await loadFixture(deployDAOGovernanceFixture);

      // Vote with majority FOR
      await dao.connect(voter1).castVote(0, 1);
      await dao.connect(voter2).castVote(0, 1);

      // End voting period
      await time.increase(86401);

      await dao.queue(0);

      expect(await dao.state(0)).to.equal(3); // Queued
    });

    it("Should not queue defeated proposal", async function () {
      const { dao, voter1, voter2 } = await loadFixture(deployDAOGovernanceFixture);

      // Vote with majority AGAINST
      await dao.connect(voter1).castVote(0, 0);
      await dao.connect(voter2).castVote(0, 1);

      // End voting period
      await time.increase(86401);

      await expect(dao.queue(0))
        .to.be.revertedWith("Proposal must have succeeded");
    });
  });

  describe("Proposal Execution", function () {
    beforeEach(async function () {
      const { dao, proposer, voter1, voter2 } = await loadFixture(deployDAOGovernanceFixture);

      const targets = [proposer.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Test proposal";

      await dao.connect(proposer).propose(targets, values, calldatas, description);

      // Vote and queue proposal
      await dao.connect(voter1).castVote(0, 1);
      await dao.connect(voter2).castVote(0, 1);
      await time.increase(86401);
      await dao.queue(0);
    });

    it("Should execute queued proposal after timelock", async function () {
      const { dao } = await loadFixture(deployDAOGovernanceFixture);

      // Wait for timelock
      await time.increase(3601); // 1 hour + 1 second

      await expect(dao.execute(0))
        .to.emit(dao, "ProposalExecuted")
        .withArgs(0);

      expect(await dao.state(0)).to.equal(4); // Executed
    });

    it("Should not execute before timelock expires", async function () {
      const { dao } = await loadFixture(deployDAOGovernanceFixture);

      await expect(dao.execute(0))
        .to.be.revertedWith("Proposal still in timelock");
    });

    it("Should not execute defeated proposal", async function () {
      const { dao, proposer, voter1 } = await loadFixture(deployDAOGovernanceFixture);

      // Create new proposal that will be defeated
      const targets = [proposer.address];
      const values = [0];
      const calldatas = ["0x"];
      await dao.connect(proposer).propose(targets, values, calldatas, "Defeated proposal");

      // Vote against
      await dao.connect(voter1).castVote(1, 0);
      await time.increase(86401);

      await expect(dao.execute(1))
        .to.be.revertedWith("Proposal must be queued");
    });
  });

  describe("Proposal Cancellation", function () {
    beforeEach(async function () {
      const { dao, proposer } = await loadFixture(deployDAOGovernanceFixture);

      const targets = [proposer.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Test proposal";

      await dao.connect(proposer).propose(targets, values, calldatas, description);
    });

    it("Should allow proposer to cancel their proposal", async function () {
      const { dao, proposer } = await loadFixture(deployDAOGovernanceFixture);

      await expect(dao.connect(proposer).cancel(0))
        .to.emit(dao, "ProposalCanceled")
        .withArgs(0);

      expect(await dao.state(0)).to.equal(5); // Canceled
    });

    it("Should not allow non-proposer to cancel proposal", async function () {
      const { dao, voter1 } = await loadFixture(deployDAOGovernanceFixture);

      await expect(dao.connect(voter1).cancel(0))
        .to.be.revertedWith("Only proposer can cancel");
    });

    it("Should not allow canceling executed proposal", async function () {
      const { dao, proposer, voter1, voter2 } = await loadFixture(deployDAOGovernanceFixture);

      // Vote, queue, and execute
      await dao.connect(voter1).castVote(0, 1);
      await dao.connect(voter2).castVote(0, 1);
      await time.increase(86401);
      await dao.queue(0);
      await time.increase(3601);
      await dao.execute(0);

      await expect(dao.connect(proposer).cancel(0))
        .to.be.revertedWith("Cannot cancel executed proposal");
    });
  });

  describe("Delegation", function () {
    it("Should allow delegation of voting power", async function () {
      const { dao, governanceToken, voter1, voter2 } = await loadFixture(deployDAOGovernanceFixture);

      // Transfer some tokens and delegate
      await governanceToken.connect(voter1).transfer(voter2.address, ethers.parseEther("1000"));
      await governanceToken.connect(voter2).delegate(voter1.address);

      const votingPower = await dao.getVotingPower(voter1.address);
      expect(votingPower).to.be.greaterThan(ethers.parseEther("10000"));
    });

    it("Should track delegated votes correctly", async function () {
      const { dao, governanceToken, voter1, voter2, proposer } = await loadFixture(deployDAOGovernanceFixture);

      // Create proposal
      const targets = [proposer.address];
      const values = [0];
      const calldatas = ["0x"];
      await dao.connect(proposer).propose(targets, values, calldatas, "Test proposal");

      // Delegate votes
      await governanceToken.connect(voter2).delegate(voter1.address);

      // Vote with delegated power
      await dao.connect(voter1).castVote(0, 1);

      const proposal = await dao.proposals(0);
      expect(proposal.forVotes).to.be.greaterThan(ethers.parseEther("10000"));
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow owner to pause governance", async function () {
      const { dao, owner } = await loadFixture(deployDAOGovernanceFixture);

      await dao.connect(owner).pause();
      expect(await dao.paused()).to.be.true;
    });

    it("Should not allow operations when paused", async function () {
      const { dao, proposer, owner } = await loadFixture(deployDAOGovernanceFixture);

      await dao.connect(owner).pause();

      const targets = [proposer.address];
      const values = [0];
      const calldatas = ["0x"];

      await expect(
        dao.connect(proposer).propose(targets, values, calldatas, "Paused proposal")
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should allow emergency proposal cancellation by owner", async function () {
      const { dao, proposer, owner } = await loadFixture(deployDAOGovernanceFixture);

      const targets = [proposer.address];
      const values = [0];
      const calldatas = ["0x"];
      await dao.connect(proposer).propose(targets, values, calldatas, "Emergency proposal");

      await dao.connect(owner).emergencyCancel(0);
      expect(await dao.state(0)).to.equal(5); // Canceled
    });
  });

  describe("Settings Updates", function () {
    it("Should allow updating proposal threshold", async function () {
      const { dao, owner } = await loadFixture(deployDAOGovernanceFixture);

      const newThreshold = ethers.parseEther("2000");
      await dao.connect(owner).setProposalThreshold(newThreshold);

      expect(await dao.proposalThreshold()).to.equal(newThreshold);
    });

    it("Should allow updating voting period", async function () {
      const { dao, owner } = await loadFixture(deployDAOGovernanceFixture);

      const newPeriod = 172800; // 2 days
      await dao.connect(owner).setVotingPeriod(newPeriod);

      expect(await dao.votingPeriod()).to.equal(newPeriod);
    });

    it("Should allow updating timelock delay", async function () {
      const { dao, owner } = await loadFixture(deployDAOGovernanceFixture);

      const newDelay = 7200; // 2 hours
      await dao.connect(owner).setTimelockDelay(newDelay);

      expect(await dao.timelockDelay()).to.equal(newDelay);
    });

    it("Should not allow non-owner to update settings", async function () {
      const { dao, voter1 } = await loadFixture(deployDAOGovernanceFixture);

      await expect(
        dao.connect(voter1).setProposalThreshold(ethers.parseEther("2000"))
      ).to.be.reverted;
    });
  });

  describe("Complex Scenarios", function () {
    it("Should handle multiple concurrent proposals", async function () {
      const { dao, proposer, voter1 } = await loadFixture(deployDAOGovernanceFixture);

      // Create multiple proposals
      const targets = [proposer.address];
      const values = [0];
      const calldatas = ["0x"];

      await dao.connect(proposer).propose(targets, values, calldatas, "Proposal 1");
      await dao.connect(proposer).propose(targets, values, calldatas, "Proposal 2");
      await dao.connect(proposer).propose(targets, values, calldatas, "Proposal 3");

      // Vote on different proposals
      await dao.connect(voter1).castVote(0, 1); // For
      await dao.connect(voter1).castVote(1, 0); // Against
      await dao.connect(voter1).castVote(2, 2); // Abstain

      // Check votes recorded correctly
      const prop1 = await dao.proposals(0);
      const prop2 = await dao.proposals(1);
      const prop3 = await dao.proposals(2);

      expect(prop1.forVotes).to.equal(ethers.parseEther("10000"));
      expect(prop2.againstVotes).to.equal(ethers.parseEther("10000"));
      expect(prop3.abstainVotes).to.equal(ethers.parseEther("10000"));
    });

    it("Should handle proposal lifecycle end-to-end", async function () {
      const { dao, proposer, voter1, voter2 } = await loadFixture(deployDAOGovernanceFixture);

      // 1. Create proposal
      const targets = [proposer.address];
      const values = [0];
      const calldatas = ["0x"];
      await dao.connect(proposer).propose(targets, values, calldatas, "Full lifecycle proposal");

      expect(await dao.state(0)).to.equal(0); // Active

      // 2. Vote
      await dao.connect(voter1).castVote(0, 1);
      await dao.connect(voter2).castVote(0, 1);

      // 3. End voting period
      await time.increase(86401);
      expect(await dao.state(0)).to.equal(1); // Succeeded

      // 4. Queue
      await dao.queue(0);
      expect(await dao.state(0)).to.equal(3); // Queued

      // 5. Execute after timelock
      await time.increase(3601);
      await dao.execute(0);
      expect(await dao.state(0)).to.equal(4); // Executed
    });
  });
});