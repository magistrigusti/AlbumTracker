import { loadFixture, ethers, expect } from "./setup";
import { AlbumTracker, Album__factory } from "../typechain-types";
import { ContractTransactionReceipt, BaseContract } from "ethers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("AlbumTracker", function () {
  async function deploy() {
    const [owner, buyer] = await ethers.getSigners();

    const AlbumTracker = await ethers.getContractFactory("AlbumTracker");

    const tracker = await AlbumTracker.deploy();

    await tracker.waitForDeployment();

    return { tracker, owner, buyer };
  }

  it("deploys albums", async function () {
    const { tracker, buyer } = await loadFixture(deploy);

    const albumTitle = "Enchantment of the Ring";
    const albumPrice = ethers.parseEther("0.00005");

    await createAlbum(tracker, albumTitle, albumPrice);

    const expectedAlbumAddr = await precomputeAddress(tracker);
    const album = Album__factory.connect(expectedAlbumAddr, buyer);

    expect(await album.price()).to.eq(albumPrice);
    expect(await album.title()).to.eq(albumTitle);
    expect(await album.purchased()).to.be.false;
    // expect(await album.purchased()).to.eq(0);
  });

  it("creates albums", async function () {
    const { tracker } = await loadFixture(deploy);

    const albumTitle = "Enchantment of the Ring";
    const albumPrice = ethers.parseEther("0.00005");

    const receiptTx = await createAlbum(tracker, albumTitle, albumPrice);

    const album = await tracker.albums(0);

    expect(album.title).to.eq(albumTitle);
    expect(album.price).to.eq(albumPrice);
    expect(album.state).to.eq(0);

    expect(await tracker.currentIndex()).to.eq(1);

    const expectedAlbumAddr = await precomputeAddress(tracker);

    expect(receiptTx?.logs[0].topics[1]).to.eq(
      ethers.zeroPadValue(expectedAlbumAddr, 32)
    );

    await expect(receiptTx)
      .to.emit(tracker, "AlbumStateChanged")
      .withArgs(expectedAlbumAddr, 0, 0, albumTitle);
  });

  it("allows to buy albums", async function () {
    const { tracker, buyer } = await loadFixture(deploy);

    const albumTitle = "Enchantment of the Ring";
    const albumPrice = ethers.parseEther("0.00005");

    await createAlbum(tracker, albumTitle, albumPrice);

    const expectedAlbumAddr = await precomputeAddress(tracker);

    const album = Album__factory.connect(expectedAlbumAddr, buyer);

    const buyTxData = {
      to: expectedAlbumAddr,
      value: albumPrice,
    };

    const buyTx = await buyer.sendTransaction(buyTxData);
    await buyTx.wait();

    expect(await album.purchased()).to.be.true;
    expect((await tracker.albums(0)).state).to.eq(1);

    await expect(buyTx).to.changeEtherBalances(
      [buyer, tracker],
      [-albumPrice, albumPrice]
    );

    await expect(buyer.sendTransaction(buyTxData)).to.be.revertedWith(
      "This album is already purchased!"
    );
  });

  it("should revert delivery if album is not paid for", async function () {
    const { tracker } = await loadFixture(deploy);

    await tracker.createAlbum(ethers.parseEther("1"), "test");

    await expect(tracker.triggerDelivery(0)).to.be.revertedWith(
      "This album is not paid for"
    );
  });

  it("should deliver album after payment", async function () {
    const { tracker, buyer } = await loadFixture(deploy);

    await tracker.createAlbum(ethers.parseEther("1"), "test");
    await tracker
      .connect(buyer)
      .triggerPayment(0, { value: ethers.parseEther("1") });

    await expect(tracker.triggerDelivery(0))
      .to.emit(tracker, "AlbumStateChanged")
      .withArgs(anyValue, 0, 2, "test");
  });

  it("should revert if not owner tries to deliver", async function () {
    const { tracker, buyer } = await loadFixture(deploy);

    await tracker.createAlbum(ethers.parseEther("1"), "test");
    await tracker
      .connect(buyer)
      .triggerPayment(0, { value: ethers.parseEther("1") });

    await expect(tracker.connect(buyer).triggerDelivery(0)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("it should create new album with all proper data", async function () {
    const album = await albumTracker.albums(1);

    expect(album.title).to.eq(secondAlbumTitle);
    expect(album.price).to.eq(secondAlbumPrice);
    expect(album.album).to.be.properAddress;
  });

  it("should check created album has no funds", async function () {
    const album = await albumTracker.albums(1);

    const balance = await ethers.provider.getBalance(album.album);
    expect(balance.toString()).to.eq("0");
  });

  it("should check that only owners can create albums", async function () {
    await expect(
      albumTracker.connect(customer).createAlbum("100", "New Titile")
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  async function precomputeAddress(
    sc: BaseContract,
    nonce = 1
  ): Promise<string> {
    return ethers.getCreateAddress({
      from: await sc.getAddress(),
      nonce,
    });
  }

  async function createAlbum(
    tracker: AlbumTracker,
    title: string,
    price: bigint
  ): Promise<ContractTransactionReceipt | null> {
    const createAlbumTx = await tracker.createAlbum(price, title);

    return await createAlbumTx.wait();
  }
});
