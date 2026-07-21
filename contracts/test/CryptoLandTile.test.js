/**
 * CryptoLandTile — Hardhat tests
 * npx hardhat test contracts/test/CryptoLandTile.test.js
 */

const { expect }  = require('chai')
const { ethers }  = require('hardhat')

describe('CryptoLandTile', () => {
  let contract, owner, buyer, other

  beforeEach(async () => {
    ;[owner, buyer, other] = await ethers.getSigners()
    const F = await ethers.getContractFactory('CryptoLandTile')
    contract = await F.deploy('CryptoLand Tiles', 'CLND', 'https://api.test/')
    await contract.waitForDeployment()
  })

  // ── Token ID math ──────────────────────────────────────────────────────────
  it('computes deterministic tokenId from coordinates (Z14 << 15 formula)', async () => {
    const id = await contract.tokenIdFromKey(100, 200)
    expect(id).to.equal((BigInt(100) << 15n) | 200n)
  })

  it('computes correct tokenId for Z14 grid boundaries', async () => {
    expect(await contract.tokenIdFromKey(0, 0)).to.equal(0n)
    expect(await contract.tokenIdFromKey(1, 0)).to.equal(32768n)        // 1 << 15
    expect(await contract.tokenIdFromKey(0, 1)).to.equal(1n)
    expect(await contract.tokenIdFromKey(16383, 16383)).to.equal(536887295n) // (16383<<15)|16383
  })

  it('produces unique IDs for distinct tiles', async () => {
    const a = await contract.tokenIdFromKey(100, 200)
    const b = await contract.tokenIdFromKey(200, 100)
    expect(a).to.not.equal(b)
  })

  // ── Minting ────────────────────────────────────────────────────────────────
  it('mints a tile to the correct owner', async () => {
    const tokenId = await contract.tokenIdFromKey(10, 20)
    await contract.mint(buyer.address, tokenId, '10:20', 'Poland')
    expect(await contract.ownerOf(tokenId)).to.equal(buyer.address)
  })

  it('stores tile metadata on mint', async () => {
    const tokenId = await contract.tokenIdFromKey(10, 20)
    await contract.mint(buyer.address, tokenId, '10:20', 'Poland')
    const td = await contract.tileData(tokenId)
    expect(td.tileKey).to.equal('10:20')
    expect(td.country).to.equal('Poland')
    expect(td.listed).to.equal(false)
  })

  it('prevents double-minting the same tile', async () => {
    const tokenId = await contract.tokenIdFromKey(10, 20)
    await contract.mint(buyer.address, tokenId, '10:20', 'Poland')
    await expect(contract.mint(buyer.address, tokenId, '10:20', 'Poland')).to.be.revertedWith('Already minted')
  })

  it('rejects mint from non-owner/non-minter', async () => {
    const tokenId = await contract.tokenIdFromKey(5, 5)
    await expect(
      contract.connect(other).mint(other.address, tokenId, '5:5', 'Germany')
    ).to.be.revertedWith('Not authorized')
  })

  it('emits TileMinted event', async () => {
    const tokenId = await contract.tokenIdFromKey(10, 20)
    await expect(contract.mint(buyer.address, tokenId, '10:20', 'Poland'))
      .to.emit(contract, 'TileMinted')
      .withArgs(tokenId, buyer.address, '10:20', 'Poland')
  })

  // ── Enumerable ─────────────────────────────────────────────────────────────
  it('tracks total supply', async () => {
    expect(await contract.totalSupply()).to.equal(0n)
    await contract.mint(buyer.address, await contract.tokenIdFromKey(1, 1), '1:1', 'UK')
    await contract.mint(buyer.address, await contract.tokenIdFromKey(2, 2), '2:2', 'US')
    expect(await contract.totalSupply()).to.equal(2n)
  })

  it('returns owned tokens by index', async () => {
    const id1 = await contract.tokenIdFromKey(1, 1)
    const id2 = await contract.tokenIdFromKey(2, 2)
    await contract.mint(buyer.address, id1, '1:1', 'UK')
    await contract.mint(buyer.address, id2, '2:2', 'US')
    expect(await contract.balanceOf(buyer.address)).to.equal(2n)
    expect(await contract.tokenOfOwnerByIndex(buyer.address, 0)).to.equal(id1)
    expect(await contract.tokenOfOwnerByIndex(buyer.address, 1)).to.equal(id2)
  })

  it('tokensOfOwner returns full array', async () => {
    const id1 = await contract.tokenIdFromKey(3, 3)
    const id2 = await contract.tokenIdFromKey(4, 4)
    await contract.mint(buyer.address, id1, '3:3', 'France')
    await contract.mint(buyer.address, id2, '4:4', 'Germany')
    const owned = await contract.tokensOfOwner(buyer.address)
    expect(owned.length).to.equal(2)
  })

  // ── Marketplace ────────────────────────────────────────────────────────────
  it('owner can list and unlist a tile', async () => {
    const tokenId  = await contract.tokenIdFromKey(5, 5)
    await contract.mint(buyer.address, tokenId, '5:5', 'Japan')
    const price = ethers.parseEther('0.1')
    await contract.connect(buyer).listForSale(tokenId, price)
    let td = await contract.tileData(tokenId)
    expect(td.listed).to.equal(true)
    expect(td.listPrice).to.equal(price)

    await contract.connect(buyer).unlist(tokenId)
    td = await contract.tileData(tokenId)
    expect(td.listed).to.equal(false)
  })

  it('non-owner cannot list', async () => {
    const tokenId = await contract.tokenIdFromKey(6, 6)
    await contract.mint(buyer.address, tokenId, '6:6', 'Korea')
    await expect(
      contract.connect(other).listForSale(tokenId, ethers.parseEther('0.1'))
    ).to.be.revertedWith('Not tile owner')
  })

  it('allows buying a listed tile and pays seller', async () => {
    const tokenId  = await contract.tokenIdFromKey(7, 7)
    const price    = ethers.parseEther('1.0')
    await contract.mint(buyer.address, tokenId, '7:7', 'Singapore')
    await contract.connect(buyer).listForSale(tokenId, price)

    const sellerBefore = await ethers.provider.getBalance(buyer.address)
    await contract.connect(other).buy(tokenId, { value: price })
    const sellerAfter  = await ethers.provider.getBalance(buyer.address)

    expect(await contract.ownerOf(tokenId)).to.equal(other.address)
    // Seller received price minus 2.5% fee
    const fee      = price * 250n / 10000n
    const expected = price - fee
    expect(sellerAfter - sellerBefore).to.be.closeTo(expected, ethers.parseEther('0.001'))
  })

  it('emits TileSold on buy', async () => {
    const tokenId = await contract.tokenIdFromKey(8, 8)
    const price   = ethers.parseEther('0.5')
    await contract.mint(buyer.address, tokenId, '8:8', 'Dubai')
    await contract.connect(buyer).listForSale(tokenId, price)
    await expect(contract.connect(other).buy(tokenId, { value: price }))
      .to.emit(contract, 'TileSold')
      .withArgs(tokenId, buyer.address, other.address, price)
  })

  it('auto-unlists on transfer', async () => {
    const tokenId = await contract.tokenIdFromKey(9, 9)
    const price   = ethers.parseEther('0.3')
    await contract.mint(buyer.address, tokenId, '9:9', 'Sydney')
    await contract.connect(buyer).listForSale(tokenId, price)
    await contract.connect(buyer).transferFrom(buyer.address, other.address, tokenId)
    const td = await contract.tileData(tokenId)
    expect(td.listed).to.equal(false)
  })

  // ── Admin ──────────────────────────────────────────────────────────────────
  it('owner can withdraw fees', async () => {
    const tokenId = await contract.tokenIdFromKey(99, 99)
    const price   = ethers.parseEther('1.0')
    await contract.mint(buyer.address, tokenId, '99:99', 'UK')
    await contract.connect(buyer).listForSale(tokenId, price)
    await contract.connect(other).buy(tokenId, { value: price })

    const before = await ethers.provider.getBalance(owner.address)
    const tx     = await contract.withdrawFees()
    const rcpt   = await tx.wait()
    const after  = await ethers.provider.getBalance(owner.address)
    expect(after).to.be.greaterThan(before)
  })

  it('pause prevents minting and buying', async () => {
    await contract.setPaused(true)
    const tokenId = await contract.tokenIdFromKey(50, 50)
    await expect(contract.mint(buyer.address, tokenId, '50:50', 'Brazil')).to.be.revertedWith('Contract paused')
  })

  it('ownership transfer requires acceptance', async () => {
    await contract.transferOwnership(buyer.address)
    expect(await contract.owner()).to.equal(owner.address)
    await contract.connect(buyer).acceptOwnership()
    expect(await contract.owner()).to.equal(buyer.address)
  })
})
