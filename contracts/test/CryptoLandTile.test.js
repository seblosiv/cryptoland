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
    // 536854527, not 536887295: the old literal was computed with tx=16384,
    // which is out of range on a 16384-wide grid (max index 16383). The contract
    // was right and the expectation was wrong — verified against the same
    // (tx << 15) | ty scheme used by _shared.js and evm.js.
    expect(await contract.tokenIdFromKey(16383, 16383)).to.equal(536854527n)
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
    const fee      = price * 700n / 10000n
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
    const tx     = await contract.withdraw()
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

  // ── Primary sales: 100% of a claim must reach the owner ──────────────────
  describe('on-chain primary sales', () => {
    const PRICE = ethers.parseEther('0.01')

    it('rejects claiming while the price is unset', async () => {
      await expect(
        contract.connect(buyer).claimTile(123, '1:2', 'DE', { value: PRICE })
      ).to.be.revertedWith('On-chain claiming disabled')
    })

    it('lets anyone claim once a price is set, and credits 100% to treasury', async () => {
      await contract.setTilePrice(PRICE)
      await contract.connect(buyer).claimTile(123, '1:2', 'DE', { value: PRICE })
      expect(await contract.ownerOf(123)).to.equal(buyer.address)
      // The WHOLE payment is revenue — not a percentage of it.
      expect(await contract.treasury()).to.equal(PRICE)
    })

    it('refunds overpayment', async () => {
      await contract.setTilePrice(PRICE)
      const before = await ethers.provider.getBalance(buyer.address)
      const tx = await contract.connect(buyer)
        .claimTile(124, '1:3', 'DE', { value: PRICE * 3n })
      const r = await tx.wait()
      const spent = before - await ethers.provider.getBalance(buyer.address)
      // Paid the price + gas, not the 3x sent.
      expect(spent).to.be.lt(PRICE + r.gasUsed * r.gasPrice + ethers.parseEther('0.001'))
      expect(await contract.treasury()).to.equal(PRICE)
    })

    it('rejects underpayment and double-claiming', async () => {
      await contract.setTilePrice(PRICE)
      await expect(
        contract.connect(buyer).claimTile(125, '1:4', 'DE', { value: PRICE - 1n })
      ).to.be.revertedWith('Insufficient payment')
      await contract.connect(buyer).claimTile(125, '1:4', 'DE', { value: PRICE })
      await expect(
        contract.connect(other).claimTile(125, '1:4', 'DE', { value: PRICE })
      ).to.be.revertedWith('Already minted')
    })

    it('pays the whole treasury out to the owner on withdraw', async () => {
      await contract.setTilePrice(PRICE)
      await contract.connect(buyer).claimTile(126, '1:5', 'DE', { value: PRICE })
      const before = await ethers.provider.getBalance(owner.address)
      const tx = await contract.withdraw()
      const r = await tx.wait()
      const after = await ethers.provider.getBalance(owner.address)
      expect(after - before + r.gasUsed * r.gasPrice).to.equal(PRICE)
      expect(await contract.treasury()).to.equal(0)
    })

    it('takes 7% on a resale and pays the seller 93%', async () => {
      await contract.setTilePrice(PRICE)
      await contract.connect(buyer).claimTile(127, '1:6', 'DE', { value: PRICE })
      await contract.withdraw()                       // clear primary revenue
      const LIST = ethers.parseEther('1')
      await contract.connect(buyer).listForSale(127, LIST)
      const sellerBefore = await ethers.provider.getBalance(buyer.address)
      await contract.connect(other).buy(127, { value: LIST })
      const fee = LIST * 700n / 10000n
      expect(await contract.treasury()).to.equal(fee)
      expect(await ethers.provider.getBalance(buyer.address) - sellerBefore)
        .to.equal(LIST - fee)
    })

    it('caps the market fee at 10%', async () => {
      await expect(contract.setMarketFeePercent(1001))
        .to.be.revertedWith('Max 10%')
    })

    it('only the owner can set the price or withdraw', async () => {
      await expect(contract.connect(buyer).setTilePrice(PRICE)).to.be.reverted
      await expect(contract.connect(buyer).withdraw()).to.be.reverted
    })

    it('can pay out to a separate cold wallet without giving up admin', async () => {
      await contract.setTilePrice(PRICE)
      await contract.connect(buyer).claimTile(128, '1:7', 'DE', { value: PRICE })
      await contract.setTreasuryReceiver(other.address)
      const before = await ethers.provider.getBalance(other.address)
      await contract.withdraw()                 // still called by the OWNER
      expect(await ethers.provider.getBalance(other.address) - before).to.equal(PRICE)
      // Admin rights did not move.
      expect(await contract.owner()).to.equal(owner.address)
    })

    it('can pay out to a separate cold wallet without giving up admin', async () => {
      await contract.setTilePrice(PRICE)
      await contract.connect(buyer).claimTile(128, '1:7', 'DE', { value: PRICE })
      await contract.setTreasuryReceiver(other.address)
      const before = await ethers.provider.getBalance(other.address)
      await contract.withdraw()                 // still called by the OWNER
      expect(await ethers.provider.getBalance(other.address) - before).to.equal(PRICE)
      expect(await contract.owner()).to.equal(owner.address)   // admin did not move
    })

    it('rejects a zero payout address', async () => {
      await expect(contract.setTreasuryReceiver(ethers.ZeroAddress))
        .to.be.revertedWith('Zero address')
    })
  })
})

describe('CryptoLandTile — hardening', () => {
  let contract, owner, buyer, other
  const PRICE = ethers.parseEther('0.01')

  beforeEach(async () => {
    ;[owner, buyer, other] = await ethers.getSigners()
    const F = await ethers.getContractFactory('CryptoLandTile')
    contract = await F.deploy('CryptoLand Tiles', 'CLND', 'https://xono.ai/metadata/')
    await contract.waitForDeployment()
  })

  it('blocks a seller that re-enters buy() when paid', async () => {
    const R = await ethers.getContractFactory('ReentrantSeller')
    const attacker = await R.deploy(await contract.getAddress())
    await attacker.waitForDeployment()

    // Give the attacker a tile, then have it list and someone buy it.
    await contract.mint(await attacker.getAddress(), 999, '9:9', 'DE')
    await attacker.list(999, PRICE)
    await contract.connect(buyer).buy(999, { value: PRICE })

    expect(await attacker.tried()).to.equal(true)          // it did attempt
    expect(await contract.ownerOf(999)).to.equal(buyer.address)  // and still failed
  })

  it('lets the owner change price and fee at will', async () => {
    await contract.setTilePrice(ethers.parseEther('0.05'))
    expect(await contract.tilePriceWei()).to.equal(ethers.parseEther('0.05'))
    await contract.setMarketFeePercent(300)
    expect(await contract.marketFeeBps()).to.equal(300)
    await contract.setTilePrice(0)                          // disable on-chain claiming
    await expect(contract.connect(buyer).claimTile(1, '0:1', 'DE', { value: PRICE }))
      .to.be.revertedWith('On-chain claiming disabled')
  })

  it('exposes provenance on-chain', async () => {
    expect(await contract.OFFICIAL_SITE()).to.equal('https://xono.ai')
    expect(await contract.PROJECT()).to.equal('CryptoLand')
    expect(await contract.PUBLISHER()).to.contain('Seychelles')
  })

  it('never lets withdrawals be frozen by pause', async () => {
    await contract.setTilePrice(PRICE)
    await contract.connect(buyer).claimTile(2, '0:2', 'DE', { value: PRICE })
    await contract.setPaused(true)
    await contract.withdraw()                               // must still work
    expect(await contract.treasury()).to.equal(0)
  })


  // ── Grid bounds — found by DEPLOYING, not by testing ────────────────────────
  // On Oasys testnet, before the fix:
  //   tokenIdFromKey(1, 0)     -> 32768
  //   tokenIdFromKey(0, 32768) -> 32768   <- same id, two different tiles
  // and claimTile accepted any uint256, so a buyer could mint a "tile" nowhere
  // on the 16384x16384 map. The unit tests above missed both because they only
  // ever passed in-range coordinates.
  it('rejects coordinates past the grid', async () => {
    await expect(contract.tokenIdFromKey(16384, 0)).to.be.revertedWith('tx out of range')
    await expect(contract.tokenIdFromKey(0, 16384)).to.be.revertedWith('ty out of range')
  })

  it('cannot produce one tokenId for two different tiles', async () => {
    await expect(contract.tokenIdFromKey(0, 32768)).to.be.reverted
    expect(await contract.tokenIdFromKey(1, 0)).to.equal(32768n)
  })

  it('only accepts tokenIds the grid can produce', async () => {
    expect(await contract.isValidTokenId(536854527n)).to.equal(true)   // far corner
    expect(await contract.isValidTokenId(536854528n)).to.equal(false)  // one past it
    expect(await contract.isValidTokenId(2n ** 200n)).to.equal(false)  // was claimable
    expect(await contract.isValidTokenId(49152n)).to.equal(false)      // ty > GRID_MAX
  })

  it('refuses to sell a tile that is off the map', async () => {
    await contract.connect(owner).setTilePrice(ethers.parseEther('1'))
    await expect(
      contract.connect(buyer).claimTile(2n ** 200n, '0:0', 'ES', { value: ethers.parseEther('1') }),
    ).to.be.revertedWith('tokenId off-grid')
  })

  it('still sells a tile that IS on the map', async () => {
    await contract.connect(owner).setTilePrice(ethers.parseEther('1'))
    const id = await contract.tokenIdFromKey(100, 200)
    await expect(
      contract.connect(buyer).claimTile(id, '100:200', 'ES', { value: ethers.parseEther('1') }),
    ).to.not.be.reverted
  })
})
