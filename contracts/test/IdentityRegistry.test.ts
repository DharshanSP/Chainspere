import { expect } from "chai";
import { ethers } from "hardhat";

describe("IdentityRegistry", () => {
  const FP = ethers.keccak256(ethers.toUtf8Bytes("pubkey-1"));
  const FP2 = ethers.keccak256(ethers.toUtf8Bytes("pubkey-2"));

  async function deploy() {
    const F = await ethers.getContractFactory("IdentityRegistry");
    const c = await F.deploy();
    const [a, b] = await ethers.getSigners();
    return { c, a, b };
  }

  it("registers and emits", async () => {
    const { c, a } = await deploy();
    await expect(c.register("ipfs://profile", FP, "ipfs://key"))
      .to.emit(c, "Registered").withArgs(a.address, FP, 1);
    const [registered, active, , fp, ver] = await c.getIdentity(a.address);
    expect(registered).to.eq(true); expect(active).to.eq(true);
    expect(fp).to.eq(FP); expect(ver).to.eq(1);
  });

  it("rejects duplicate registration", async () => {
    const { c } = await deploy();
    await c.register("p", FP, "k");
    await expect(c.register("p", FP, "k")).to.be.revertedWithCustomError(c, "AlreadyRegistered");
  });

  it("rejects zero fingerprint", async () => {
    const { c } = await deploy();
    await expect(c.register("p", ethers.ZeroHash, "k")).to.be.revertedWithCustomError(c, "EmptyFingerprint");
  });

  it("rotates key and bumps version", async () => {
    const { c } = await deploy();
    await c.register("p", FP, "k");
    await expect(c.rotateKey(FP2, "k2")).to.emit(c, "EncryptionKeyUpdated");
    const [, , , fp, ver] = await c.getIdentity((await ethers.getSigners())[0].address);
    expect(fp).to.eq(FP2); expect(ver).to.eq(2);
  });

  it("deactivate/reactivate", async () => {
    const { c, a } = await deploy();
    await c.register("p", FP, "k");
    await c.deactivate();
    expect(await c.isActive(a.address)).to.eq(false);
    await expect(c.updateProfile("x")).to.be.revertedWithCustomError(c, "Inactive");
    await c.reactivate();
    expect(await c.isActive(a.address)).to.eq(true);
  });

  it("unregistered cannot update", async () => {
    const { c, b } = await deploy();
    await expect(c.connect(b).updateProfile("x")).to.be.revertedWithCustomError(c, "NotRegistered");
  });
});
