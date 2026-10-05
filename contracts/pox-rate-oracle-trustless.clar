;; pox-rate-oracle-trustless.clar
;; Trustless Tranche 2 rate oracle for PoX-5.
;;
;; The previous oracle took the cycle's figures as admin input: miner revenue,
;; the Tranche 1 obligation, and total stacked STX were submitted by the
;; contract owner and the rate derived from them. That required trusting the
;; submitter, and the owner key had no transfer path.
;;
;; This contract submits nothing. It reads PoX-5's own reward accounting.
;;
;; PoX-5 computes the Tranche 2 residual itself, in calculate-rewards:
;;
;;   (try! (assert-all-active-bonds-included bond-periods calculation-height))
;;   (remaining-rewards  ...)                       ;; after Tranche 1 bonds are paid
;;   (reserve-cut        (/ (* remaining-rewards RESERVE_RATIO) u10000))
;;   (stx-staker-rewards (- remaining-rewards reserve-cut))
;;   (accrued-rewards-per-ustx (/ (* stx-staker-rewards PRECISION) cycle-staked-ustx))
;;
;; with RESERVE_RATIO u1500 of u10000 (15%) and PRECISION u1e18. The value
;; returned by get-rewards-per-token-for-cycle with a `none` bond-index is
;; therefore a cycle's Tranche 2 rewards per uSTX, already net of both the
;; senior bond claim and the reserve cut.
;;
;; Reconstructing that from miner revenue would mean re-deriving a number the
;; protocol has already settled, and could disagree with it. Reading it cannot.
;;
;; THE VALUE IS PER CYCLE, NOT CUMULATIVE ACROSS CYCLES.
;;
;; rewards-per-token-for-cycle is keyed by reward cycle. Each cycle's entry
;; starts at zero (default-to u0) and calculate-rewards adds each
;; distribution's accrual to the entry for the cycle containing its
;; calculation height. A finished entry is therefore that cycle's Tranche 2
;; rewards per uSTX, and is the rate directly. The first version of this
;; contract, deployed 2026-09-23 as pox-rate-oracle-trustless, subtracted the
;; previous cycle's entry as though the map were a running total. On mainnet
;; that gives 150,848 for cycle 142 instead of 909,456, and zero for cycle 143,
;; whose entry is lower than cycle 142's.
;;
;; WHEN A CYCLE IS FINAL.
;;
;; PoX-5 distributes in half-cycle periods. calculate-rewards credits rewards
;; to the reward cycle containing (start of the current half-cycle - 1), so
;; the second half of cycle c is credited to c during the first half of c+1.
;; Once the second half of c+1 begins, every later calculation height falls in
;; c+1 or beyond, and pox-5 asserts calculation heights only increase, so
;; cycle c's entry can no longer change. get-cycle-rate returns none until
;; then rather than a partial figure.
;;
;; If no one calls calculate-rewards during the first half of c+1, the rewards
;; for c's second half are credited to c+1 instead. Cycle c's figure is then
;; final but understated. Every stacker's payout follows the same attribution,
;; so Rho settles on what stackers were actually credited.
;;
;; COST. Each pox-5 read costs roughly 139,000 of the 200,000 read_length
;; budget, so get-cycle-rate reads pox-5 exactly once. The first version read
;; it up to five times and exceeded the budget on every real cycle. Finality is
;; computed from burn-block-height and the constants below rather than by
;; asking pox-5, for the same reason.
;;
;; MAINNET DEPLOYMENT: change the PoX-5 principal below to
;; 'SP000000000000000000002Q6VF78.pox-5, FIRST-BURN-HEIGHT to u666050 and
;; REWARD-CYCLE-LENGTH to u2100. Boot contract addresses and cycle parameters
;; differ by network; the values below are testnet's, from /v2/pox.

;; PoX-5's fixed-point scale. Must match PRECISION in the boot contract.
(define-constant POX-PRECISION u1000000000000000000)

;; Rho quotes rates as sats per 1,000,000 STX (1e12 uSTX) per cycle.
(define-constant RHO-NOTIONAL-UNIT u1000000000000)

;; Testnet PoX parameters.
(define-constant FIRST-BURN-HEIGHT u0)
(define-constant REWARD-CYCLE-LENGTH u900)

;; Tranche 2 rewards per uSTX for one cycle, scaled by 1e18.
;; A `none` bond-index selects the STX-only staker tranche.
(define-read-only (tranche-2-rpt (cycle uint))
  (contract-call? 'ST000000000000000000002AMW42H.pox-5
    get-rewards-per-token-for-cycle cycle none))

;; First burn height at which no further distribution can be credited to
;; `cycle`: the start of the second half of the following cycle.
(define-read-only (cycle-final-height (cycle uint))
  (+ FIRST-BURN-HEIGHT
     (* (+ cycle u1) REWARD-CYCLE-LENGTH)
     (/ REWARD-CYCLE-LENGTH u2)))

(define-read-only (is-cycle-final (cycle uint))
  (>= burn-block-height (cycle-final-height cycle)))

;; Rate in Rho's unit, sats per 1,000,000 STX, from a per-uSTX value.
(define-read-only (rate-from-rpt (rpt uint))
  (/ (* rpt RHO-NOTIONAL-UNIT) POX-PRECISION))

;; Sats earned by a given stacked amount over one cycle.
;; Mirrors PoX-5's own compute-earned-rewards:
;;   earned = shares * rewards-per-token / PRECISION
(define-read-only (earned-sats (cycle uint) (stacked-ustx uint))
  (/ (* stacked-ustx (tranche-2-rpt cycle)) POX-PRECISION))

;; Drop-in replacement for the admin oracle's read interface; rho-core reads
;; only rate-sats-per-mstx. Returns none until the cycle is final, and for a
;; final cycle PoX-5 credited nothing to, which surfaces as
;; ERR-ORACLE-RATE-NOT-FOUND in the core contract rather than settling at zero.
(define-read-only (get-cycle-rate (cycle uint))
  (if (is-cycle-final cycle)
    (let ((rpt (tranche-2-rpt cycle)))
      (if (> rpt u0)
        (some {
          rate-sats-per-mstx: (rate-from-rpt rpt),
          tranche-2-rewards-per-ustx: rpt,
          source: "pox-5"
        })
        none))
    none))
