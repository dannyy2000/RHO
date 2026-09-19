;; pox-rate-oracle.clar
;; Stores verified PoX-5 Tranche 2 (STX-only staker) yield rates per cycle.
;;
;; PoX-5 pays miner BTC through a waterfall, not proportionally:
;;   Tranche 1 (protocol bonds / Genesis Bond) is paid its guaranteed target
;;   rate first. Tranche 2 (STX-only stackers) receives 85% of whatever
;;   miner revenue remains after Tranche 1. Tranche 3 (reserve fund) gets
;;   the other 15%.
;; This oracle stores the raw cycle inputs and derives the Tranche 2 rate
;; on-chain from the formula, rather than trusting a pre-computed number, so
;; the admin's submission is auditable against the waterfall math itself.
;;
;; Phase 1: admin (contract deployer) submits the raw cycle inputs.
;; Phase 2: replace admin submission with Bitcoin tx proof verification via
;;          get-burn-block-info?, once the deployed PoX-5 reference contract's
;;          public read functions for bond capacity and target rate are
;;          confirmed (see README: "How the Rate is Calculated" for the open
;;          question this depends on).

(define-data-var contract-owner principal tx-sender)

(define-constant ERR-NOT-AUTHORIZED (err u200))
(define-constant ERR-CYCLE-RATE-EXISTS (err u201))
(define-constant ERR-ZERO-STACKED (err u203))
(define-constant ERR-OBLIGATION-EXCEEDS-REVENUE (err u204))

;; Tranche 2 (STX-only stacker) share of post-Tranche-1 miner revenue.
(define-constant TRANCHE-2-SHARE-NUMERATOR u85)
(define-constant TRANCHE-2-SHARE-DENOMINATOR u100)

;; Rate unit: sats earned per 1,000,000 STX (1e12 uSTX) stacked, per cycle.
;;
;; The scalar must be large enough that real PoX yield does not truncate to zero
;; under Clarity's integer division. Actual yield is roughly 0.5 sats per STX per
;; cycle, so a per-1-STX scalar (1e6) floors every real cycle to 0 and renders
;; every settlement a no-op. Against live cycle-142 figures this scalar yields
;; ~679,499, which carries six significant figures.
(define-constant RATE-SCALAR u1000000000000)

(define-map cycle-rates
  { cycle: uint }
  {
    miner-revenue-sats: uint,        ;; total BTC paid by miners this cycle
    tranche-1-obligation-sats: uint, ;; guaranteed payout owed to protocol bonds this cycle
    tranche-2-pool-sats: uint,       ;; derived: (miner-revenue - tranche-1-obligation) * 85%
    total-ustx-stacked: uint,        ;; total uSTX held by Tranche 2 (STX-only) stackers
    rate-sats-per-mstx: uint,        ;; derived: sats per 1,000,000 STX per cycle
    submitted-at: uint
  })

(define-data-var latest-cycle uint u0)

(define-read-only (get-cycle-rate (cycle uint))
  (map-get? cycle-rates { cycle: cycle }))

(define-read-only (get-latest-rate)
  (map-get? cycle-rates { cycle: (var-get latest-cycle) }))

(define-read-only (get-current-pox-cycle)
  (/ burn-block-height u2100))

(define-read-only (get-contract-owner)
  (var-get contract-owner))

;; Submit the raw inputs for a completed PoX-5 cycle. The Tranche 2 pool and
;; rate are derived on-chain from these inputs (not submitted directly), so
;; anyone can verify the admin's numbers against the waterfall formula.
(define-public (submit-cycle-rate
    (cycle uint)
    (miner-revenue-sats uint)
    (tranche-1-obligation-sats uint)
    (total-ustx-stacked uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (asserts! (is-none (map-get? cycle-rates { cycle: cycle })) ERR-CYCLE-RATE-EXISTS)
    (asserts! (> total-ustx-stacked u0) ERR-ZERO-STACKED)
    (asserts! (<= tranche-1-obligation-sats miner-revenue-sats) ERR-OBLIGATION-EXCEEDS-REVENUE)
    (let (
      (post-tranche-1-sats (- miner-revenue-sats tranche-1-obligation-sats))
      (tranche-2-pool-sats (/ (* post-tranche-1-sats TRANCHE-2-SHARE-NUMERATOR) TRANCHE-2-SHARE-DENOMINATOR))
      (rate-sats-per-mstx (/ (* tranche-2-pool-sats RATE-SCALAR) total-ustx-stacked))
    )
      (map-set cycle-rates { cycle: cycle }
        {
          miner-revenue-sats: miner-revenue-sats,
          tranche-1-obligation-sats: tranche-1-obligation-sats,
          tranche-2-pool-sats: tranche-2-pool-sats,
          total-ustx-stacked: total-ustx-stacked,
          rate-sats-per-mstx: rate-sats-per-mstx,
          submitted-at: burn-block-height
        })
      (if (>= cycle (var-get latest-cycle))
        (var-set latest-cycle cycle)
        true)
      (print { event: "rate-submitted", cycle: cycle, rate-sats-per-mstx: rate-sats-per-mstx,
               tranche-2-pool-sats: tranche-2-pool-sats,
               miner-revenue-sats: miner-revenue-sats,
               tranche-1-obligation-sats: tranche-1-obligation-sats })
      (ok rate-sats-per-mstx))))
