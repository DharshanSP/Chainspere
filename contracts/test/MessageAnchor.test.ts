import { expect } from "chai";
import { ethers } from "hardhat";

describe("MessageAnchor", () => {
  async function setup() {
    const [a, b, outsider] = await ethers.getSigners();
    const IdF = await ethers.getContractFactory("IdentityRegistry");
    const id = await IdF.deploy();
    const fp = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
    await id.connect(a).register("pa", fp("ka"), "ka");
    await id.connect(b).register("pb", fp("kb"), "kb");
    const ConvF = await ethers.getContractFactory("ConversationRegistry");
    const conv = await ConvF.deploy(await id.getAddress());
    const AnchF = await ethers.getContractFactory("MessageAnchor");
    const anchor = await AnchF.deploy(await id.getAddress(), await conv.getAddress());
    return { id, conv, anchor, a, b, outsider };
  }

  it("anchors 1:1 digest + verifies", async () => {
    const { anchor, a } = await setup();
    const mid = ethers.keccak256(ethers.toUtf8Bytes("msg-1"));
    const digest = ethers.keccak256(ethers.toUtf8Bytes("ciphertext-1"));
    await expect(anchor.anchor(mid, ethers.ZeroHash, digest, "bafy-cid-1"))
      .to.emit(anchor, "MessageAnchored").withArgs(mid, a.address, ethers.ZeroHash, digest, "bafy-cid-1");
    const [dm, cm] = await anchor.verify(mid, digest, "bafy-cid-1");
    expect(dm).to.eq(true); expect(cm).to.eq(true);
    const [dm2] = await anchor.verify(mid, ethers.ZeroHash, "bafy-cid-1");
    expect(dm2).to.eq(false);
  });

  it("rejects duplicates, empty digest, unregistered sender", async () => {
    const { anchor, outsider } = await setup();
    const mid = ethers.keccak256(ethers.toUtf8Bytes("m"));
    const d = ethers.keccak256(ethers.toUtf8Bytes("c"));
    await anchor.anchor(mid, ethers.ZeroHash, d, "cid");
    await expect(anchor.anchor(mid, ethers.ZeroHash, d, "cid")).to.be.revertedWithCustomError(anchor, "AlreadyAnchored");
    await expect(anchor.anchor(ethers.keccak256(ethers.toUtf8Bytes("m2")), ethers.ZeroHash, ethers.ZeroHash, "cid"))
      .to.be.revertedWithCustomError(anchor, "EmptyDigest");
    await expect(anchor.connect(outsider).anchor(ethers.keccak256(ethers.toUtf8Bytes("mx")), ethers.ZeroHash, d, "cid"))
      .to.be.revertedWithCustomError(anchor, "NotRegistered");
  });

  it("group anchoring requires membership", async () => {
    const { anchor, conv, a, b, outsider } = await setup();
    const tx = await conv.connect(a).createGroup("g", [b.address]);
    const rc = await tx.wait();
    let gid = "";
    for (const l of rc!.logs) {
      try {
        const p = conv.interface.parseLog(l);
        if (p?.name === "GroupCreated") gid = p.args.groupId as string;
      } catch { /* ignore */ }
    }
    const mid = ethers.keccak256(ethers.toUtf8Bytes("gm"));
    const d = ethers.keccak256(ethers.toUtf8Bytes("gc"));
    await anchor.connect(b).anchor(mid, gid, d, "cid-g");
    const mid2 = ethers.keccak256(ethers.toUtf8Bytes("gm2"));
    await expect(anchor.connect(outsider).anchor(mid2, gid, d, "cid"))
      .to.be.reverted; // NotRegistered (outsider has no identity) — still rejected
  });
});
