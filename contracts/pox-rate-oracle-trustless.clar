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
;; PoX-5 computes the Tranche 2 residual itself, in distribute-rewards:
;;
;;   (try! (assert-all-active-bonds-included bond-periods calculation-height))
;;   (remaining-rewards  ...)                       ;; after Tranche 1 bonds are paid
;;   (reserve-cut        (/ (* remaining-rewards RESERVE_RATIO) u10000))
;;   (stx-staker-rewards (- remaining-rewards reserve-cut))
;;   (accrued-rewards-per-ustx (/ (* stx-staker-rewards PRECISION) cycle-staked-ustx))
;;
;; with RESERVE_RATIO u1500 of u10000 (15%) and PRECISION u1e18. The value
;; returned by get-rewards-per-token-for-cycle with a `none` bond-index is
;; therefore the cumulative Tranche 2 accrual per uSTX, already net of both the
;; senior bond claim and the reserve cut. Its per-cycle delta is the rate.
;;
;; Reconstructing that from miner revenue would mean re-deriving a number the
;; protocol has already settled, and could disagree with it. Reading it cannot.
;;
;; STATUS - deployed to testnet 2026-09-23, partially verified.
;;
;;   tranche-2-rpt matches pox-5 exactly (cycles 19 and 20 verified on chain)
;;   get-cycle-rate correctly returns none for an unaccounted cycle
;;   tranche-2-accrual / cycle-rate FAIL with CostBalanceExceeded
;;
;; Each pox-5 get-rewards-per-token-for-cycle read costs roughly 139KB of
;; read_length. The delta functions read twice - current cycle and previous -
;; totalling 278,219 against a 200,000 budget. The arithmetic is right; the
;; access pattern is not.
;;
;; Fix is a permissionless checkpoint: a public function anyone may call that
;; reads pox-5 once and stores that cycle's cumulative value. Deltas then come
;; from two cheap local map reads. It stays trustless because the function
;; reads pox-5 itself rather than accepting a submitted figure, and because
;; anyone can call it and anyone can verify a stored value against pox-5.
;; rho-core must not consume the delta functions until that lands, or
;; settle-cycle inherits the same cost.
;;
;; MAINNET DEPLOYMENT: change the PoX-5 principal below to
;; 'SP000000000000000000002Q6VF98.pox-5 - boot contract addresses differ by
;; network. It is the only line that must change.

(define-constant ERR-CYCLE-NOT-ACCOUNTED (err u300))

;; PoX-5's fixed-point scale. Must match PRECISION in the boot contract.
(define-constant POX-PRECISION u1000000000000000000)

;; Rho quotes rates as sats per 1,000,000 STX (1e12 uSTX) per cycle.
(define-constant RHO-NOTIONAL-UNIT u1000000000000)

;; Cumulative Tranche 2 rewards per uSTX, scaled by 1e18, as of this cycle.
;; A `none` bond-index selects the STX-only staker tranche.
(define-read-only (tranche-2-rpt (cycle uint))
  (contract-call? 'ST000000000000000000002AMW42H.pox-5
    get-rewards-per-token-for-cycle cycle none))

;; Tranche 2 accrual for a single cycle: the delta between consecutive
;; cumulative values. Guarded against underflow in case the accumulator is
;; ever reset or read out of order.
(define-read-only (tranche-2-accrual (cycle uint))
  (let (
    (now (tranche-2-rpt cycle))
    (prev (if (is-eq cycle u0) u0 (tranche-2-rpt (- cycle u1))))
  )
    (if (>= now prev) (- now prev) u0)))

;; Sats earned by a given stacked amount over one cycle.
;; Deliberately mirrors PoX-5's own compute-earned-rewards:
;;   earned = shares * (rpt-current - rpt-paid) / PRECISION
(define-read-only (earned-sats (cycle uint) (stacked-ustx uint))
  (/ (* stacked-ustx (tranche-2-accrual cycle)) POX-PRECISION))

;; Has PoX-5 accounted for this cycle yet? The accumulator is zero before the
;; first distribution, so a zero reading means "not yet computed" rather than
;; "a cycle that paid nothing".
(define-read-only (is-cycle-accounted (cycle uint))
  (> (tranche-2-rpt cycle) u0))

;; Rate in Rho's unit: sats per 1,000,000 STX per cycle.
(define-read-only (cycle-rate (cycle uint))
  (earned-sats cycle RHO-NOTIONAL-UNIT))

;; Drop-in replacement for the admin oracle's read interface, so rho-core can
;; switch source with a single contract reference change. Returns none for a
;; cycle PoX-5 has not yet distributed, which surfaces as ERR-ORACLE-RATE-NOT-FOUND
;; in the core contract rather than silently settling at zero.
(define-read-only (get-cycle-rate (cycle uint))
  (if (is-cycle-accounted cycle)
    (some {
      rate-sats-per-mstx: (cycle-rate cycle),
      tranche-2-accrual-per-ustx: (tranche-2-accrual cycle),
      cumulative-rpt: (tranche-2-rpt cycle),
      total-ustx-stacked: (contract-call? 'ST000000000000000000002AMW42H.pox-5
                            get-total-ustx-stacked cycle),
      source: "pox-5"
    })
    none))
