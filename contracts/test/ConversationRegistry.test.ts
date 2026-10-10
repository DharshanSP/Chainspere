import { expect } from "chai";
import { ethers } from "hardhat";

describe("ConversationRegistry", () => {
  async function setup() {
    const [owner, alice, bob, eve] = await ethers.getSigners();
    const IdF = await ethers.getContractFactory("IdentityRegistry");
    const id = await IdF.deploy();
    const fp = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
    for (const [signer, k] of [[owner, "o"], [alice, "a"], [bob, "b"], [eve, "e"]] as const) {
      await id.connect(signer).register(`p-${k}`, fp(`pub-${k}`), `k-${k}`);
    }
    const ConvF = await ethers.getContractFactory("ConversationRegistry");
    const conv = await ConvF.deploy(await id.getAddress());
    return { id, conv, owner, alice, bob, eve };
  }

  async function createGroupGetId(conv: any, name: string, members: string[]): Promise<string> {
    const tx = await conv.createGroup(name, members);
    const rc = await tx.wait();
    for (const l of rc!.logs) {
      try {
        const parsed = conv.interface.parseLog(l);
        if (parsed?.name === "GroupCreated") return parsed.args.groupId as string;
      } catch { /* ignore */ }
    }
    throw new Error("GroupCreated not found");
  }

  it("creates group, creator is owner/admin/member", async () => {
    const { conv, owner, alice } = await setup();
    const groupId = await createGroupGetId(conv, "team", [alice.address]);
    const [exists, active, name, o, kv, count] = await conv.getGroup(groupId);
    expect(exists).to.eq(true); expect(active).to.eq(true);
    expect(name).to.eq("team"); expect(o).to.eq(owner.address);
    expect(kv).to.eq(1); expect(count).to.eq(2);
    expect(await conv.isMember(groupId, alice.address)).to.eq(true);
  });

  it("rejects empty name", async () => {
    const { conv } = await setup();
    await expect(conv.createGroup("", [])).to.be.revertedWithCustomError(conv, "EmptyName");
  });

  it("non-admin cannot add members", async () => {
    const { conv, alice, bob } = await setup();
    const gid = await createGroupGetId(conv, "g", []);
    await expect(conv.connect(alice).addMember(gid, bob.address)).to.be.revertedWithCustomError(conv, "NotAdmin");
  });

  it("add/remove bumps key version; owner cannot be removed", async () => {
    const { conv, owner, alice, bob } = await setup();
    const gid = await createGroupGetId(conv, "g", [alice.address]);
    await conv.addMember(gid, bob.address);
    let [, , , , kv] = await conv.getGroup(gid);
    expect(kv).to.eq(2);
    await conv.removeMember(gid, bob.address);
    [, , , , kv] = await conv.getGroup(gid);
    expect(kv).to.eq(3);
    expect(await conv.isMember(gid, bob.address)).to.eq(false);
    await expect(conv.removeMember(gid, owner.address)).to.be.revertedWithCustomError(conv, "OwnerCannotBeRemoved");
  });

  it("only owner promotes/demotes/transfers; member can leave", async () => {
    const { conv, owner, alice, bob } = await setup();
    const gid = await createGroupGetId(conv, "g", [alice.address, bob.address]);
    await expect(conv.connect(alice).promoteAdmin(gid, bob.address)).to.be.revertedWithCustomError(conv, "NotOwner");
    await conv.promoteAdmin(gid, alice.address);
    expect(await conv.isAdmin(gid, alice.address)).to.eq(true);
    await conv.transferOwnership(gid, alice.address);
    const [, , , o] = await conv.getGroup(gid);
    expect(o).to.eq(alice.address);
    await conv.connect(bob).leave(gid);
    expect(await conv.isMember(gid, bob.address)).to.eq(false);
    await expect(conv.connect(owner).closeGroup(gid)).to.be.revertedWithCustomError(conv, "NotOwner");
    await conv.connect(alice).closeGroup(gid);
    const [, active] = await conv.getGroup(gid);
    expect(active).to.eq(false);
  });

  it("requires active sender identity", async () => {
    const { conv, id, eve } = await setup();
    await id.connect(eve).deactivate();
    await expect(conv.connect(eve).createGroup("x", [])).to.be.revertedWithCustomError(conv, "SenderIdentityInactive");
  });
});
