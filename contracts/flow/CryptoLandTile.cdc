/**
 * CryptoLandTile — Flow (Cadence 1.0)
 * ====================================
 * Flow's resource model is genuinely different from every other chain here. An
 * NFT is not a row in a mapping owned by the contract; it is a linear-typed
 * RESOURCE that physically lives in the owner's account storage. The type system
 * makes it impossible to copy or accidentally discard — a resource must be moved
 * (`<-`) and must end up somewhere, or the program does not compile.
 *
 * That changes two things versus, say, CryptoLandTile.sol:
 *
 *   - "who owns tile N" cannot be read from a single contract mapping, so we
 *     keep an explicit `tileOwners` index for lookups. The index is a
 *     convenience; the resource in the owner's storage is the truth.
 *   - There is no reentrancy guard, because there is no reentrancy to guard
 *     against: Cadence has no fallback functions and a resource cannot be in two
 *     places at once.
 *
 * CROSS-CHAIN INVARIANT: tokenId = (tx << 15) | ty, tx/ty in [0, 16383].
 * Verified against (16383,16383) -> 536854527, the same value asserted by the
 * other twelve implementations and confirmed on-chain on Stellar, EVM, NEAR and
 * Aptos testnets.
 */

access(all) contract CryptoLandTile {

    // ── Cross-chain constants ───────────────────────────────────────────────
    /// Z14 grid: 16384 x 16384. Highest valid coordinate on either axis.
    access(all) let GRID_MAX: UInt64
    /// tokenIdFromKey(16383, 16383) — the largest id the grid can produce.
    access(all) let MAX_TOKEN_ID: UInt64
    /// Hard ceiling on the resale fee: 10%. A stolen admin key cannot exceed it.
    access(all) let MAX_FEE_BPS: UInt16

    // ── State ───────────────────────────────────────────────────────────────
    access(all) var totalSupply: UInt64
    /// Primary sale price in FLOW. 0 disables on-chain claiming.
    access(all) var tilePrice: UFix64
    /// Resale fee, 700 = 7%.
    access(all) var marketFeeBps: UInt16
    /// Where withdrawals land — point this at a cold wallet.
    access(all) var treasuryReceiver: Address
    /// tokenId -> owner. A lookup index; the resource itself is the real record.
    access(self) let tileOwners: {UInt64: Address}
    /// Accrued primary-sale revenue, held as a real vault rather than a counter.
    access(self) let treasury: @{FungibleToken.Vault}

    access(all) let CollectionStoragePath: StoragePath
    access(all) let CollectionPublicPath: PublicPath
    access(all) let AdminStoragePath: StoragePath

    access(all) event TileMinted(tokenId: UInt64, tx: UInt64, ty: UInt64, to: Address)
    access(all) event TilePriceChanged(price: UFix64)
    access(all) event Withdrawn(amount: UFix64, to: Address)

    // ── The cross-chain encoding ────────────────────────────────────────────
    /// (tx << 15) | ty. The bound is LOAD-BEARING, not defensive: without it the
    /// OR carries and two different tiles collapse to one id. That exact bug was
    /// found on the EVM contract by deploying it, so it is asserted here too.
    access(all) view fun tokenIdFromKey(tx: UInt64, ty: UInt64): UInt64 {
        pre {
            tx <= self.GRID_MAX: "tx out of range"
            ty <= self.GRID_MAX: "ty out of range"
        }
        return (tx << 15) | ty
    }

    access(all) view fun keyFromTokenId(tokenId: UInt64): [UInt64; 2] {
        return [tokenId >> 15, tokenId & 0x7FFF]
    }

    /// True only for ids the grid can actually produce.
    access(all) view fun isValidTokenId(tokenId: UInt64): Bool {
        return tokenId <= self.MAX_TOKEN_ID && (tokenId & 0x7FFF) <= self.GRID_MAX
    }

    access(all) view fun ownerOfTile(tx: UInt64, ty: UInt64): Address? {
        return self.tileOwners[self.tokenIdFromKey(tx: tx, ty: ty)]
    }

    access(all) view fun treasuryBalance(): UFix64 {
        return self.treasury.balance
    }

    // ── The tile resource ───────────────────────────────────────────────────
    access(all) resource NFT {
        access(all) let id: UInt64
        access(all) let tx: UInt64
        access(all) let ty: UInt64
        access(all) let country: String

        init(tx: UInt64, ty: UInt64, country: String) {
            self.id = CryptoLandTile.tokenIdFromKey(tx: tx, ty: ty)
            self.tx = tx
            self.ty = ty
            self.country = country
        }
    }

    access(all) resource interface CollectionPublic {
        access(all) fun deposit(token: @NFT)
        access(all) view fun getIDs(): [UInt64]
    }

    access(all) resource Collection: CollectionPublic {
        access(all) var ownedNFTs: @{UInt64: NFT}

        init() { self.ownedNFTs <- {} }

        access(all) fun deposit(token: @NFT) {
            let id = token.id
            // `<-!` forces a runtime abort if something was already at this key,
            // which cannot happen because claimTile rejects a claimed tile — but
            // Cadence will not let the resource be silently dropped either way.
            self.ownedNFTs[id] <-! token
        }

        access(all) view fun getIDs(): [UInt64] {
            return self.ownedNFTs.keys
        }
    }

    access(all) fun createEmptyCollection(): @Collection {
        return <- create Collection()
    }

    // ── Primary sale ────────────────────────────────────────────────────────
    /// The buyer hands over a vault holding at least `tilePrice`. The whole
    /// payment becomes treasury — this is the project selling land, not a fee on
    /// someone else's trade. Any excess is returned rather than absorbed.
    access(all) fun claimTile(
        payment: @{FungibleToken.Vault},
        tx: UInt64,
        ty: UInt64,
        country: String,
        recipient: Address,
    ): @{FungibleToken.Vault} {
        pre {
            self.tilePrice > 0.0: "on-chain claiming disabled"
            payment.balance >= self.tilePrice: "insufficient payment"
        }
        let id = self.tokenIdFromKey(tx: tx, ty: ty)
        assert(self.tileOwners[id] == nil, message: "tile already claimed")

        self.treasury.deposit(from: <- payment.withdraw(amount: self.tilePrice))

        let tile <- create NFT(tx: tx, ty: ty, country: country)
        let receiver = getAccount(recipient)
            .capabilities.borrow<&{CollectionPublic}>(self.CollectionPublicPath)
            ?? panic("recipient has no CryptoLand collection")
        receiver.deposit(token: <- tile)

        self.tileOwners[id] = recipient
        self.totalSupply = self.totalSupply + 1
        emit TileMinted(tokenId: id, tx: tx, ty: ty, to: recipient)

        // Whatever is left of the buyer's vault goes back to them.
        return <- payment
    }

    // ── Admin ───────────────────────────────────────────────────────────────
    /// Holding this resource IS the authorisation — Cadence gates on possession
    /// of a resource rather than on an owner address comparison.
    access(all) resource Admin {
        access(all) fun setTilePrice(price: UFix64) {
            CryptoLandTile.tilePrice = price
            emit TilePriceChanged(price: price)
        }

        access(all) fun setMarketFeeBps(bps: UInt16) {
            pre { bps <= CryptoLandTile.MAX_FEE_BPS: "fee above the 10% ceiling" }
            CryptoLandTile.marketFeeBps = bps
        }

        access(all) fun setTreasuryReceiver(to: Address) {
            CryptoLandTile.treasuryReceiver = to
        }

        /// Drains the treasury to `treasuryReceiver` — never to the caller. The
        /// admin key and the wallet holding the money are deliberately separate,
        /// the same split every other chain in this project enforces.
        access(all) fun withdraw() {
            let amount = CryptoLandTile.treasury.balance
            assert(amount > 0.0, message: "nothing to withdraw")
            let paid <- CryptoLandTile.treasury.withdraw(amount: amount)
            let receiver = getAccount(CryptoLandTile.treasuryReceiver)
                .capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                ?? panic("treasury receiver cannot accept FLOW")
            receiver.deposit(from: <- paid)
            emit Withdrawn(amount: amount, to: CryptoLandTile.treasuryReceiver)
        }
    }

    init(emptyVault: @{FungibleToken.Vault}) {
        self.GRID_MAX = 16383
        self.MAX_TOKEN_ID = 536854527
        self.MAX_FEE_BPS = 1000

        self.totalSupply = 0
        self.tilePrice = 0.0          // sales start closed
        self.marketFeeBps = 700       // 7%
        self.treasuryReceiver = self.account.address
        self.tileOwners = {}
        self.treasury <- emptyVault

        self.CollectionStoragePath = /storage/CryptoLandTileCollection
        self.CollectionPublicPath = /public/CryptoLandTileCollection
        self.AdminStoragePath = /storage/CryptoLandTileAdmin

        self.account.storage.save(<- create Admin(), to: self.AdminStoragePath)
    }
}
