;; pox-rate-oracle.clar
;; Stores verified PoX yield rates per cycle.
;; Phase 1: admin (contract deployer) submits rates manually after each cycle.
;; Phase 2: replace admin submission with Bitcoin tx proof via get-burn-block-info?.

(define-data-var contract-owner principal tx-sender)

(define-constant ERR-NOT-AUTHORIZED (err u200))
(define-constant ERR-CYCLE-RATE-EXISTS (err u201))
(define-constant ERR-ZERO-STACKED (err u203))

;; rate-bps: sats earned per 1,000,000 uSTX stacked per cycle
(define-map cycle-rates
  { cycle: uint }
  {
    btc-reward-sats: uint,
    total-ustx-stacked: uint,
    rate-bps: uint,
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

;; Submit the BTC reward paid and total STX stacked for a completed PoX cycle.
;; Rate is calculated as: btc-reward-sats * 1,000,000 / total-ustx-stacked
(define-public (submit-cycle-rate
    (cycle uint)
    (btc-reward-sats uint)
    (total-ustx-stacked uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (asserts! (is-none (map-get? cycle-rates { cycle: cycle })) ERR-CYCLE-RATE-EXISTS)
    (asserts! (> total-ustx-stacked u0) ERR-ZERO-STACKED)
    (let ((rate-bps (/ (* btc-reward-sats u1000000) total-ustx-stacked)))
      (map-set cycle-rates { cycle: cycle }
        {
          btc-reward-sats: btc-reward-sats,
          total-ustx-stacked: total-ustx-stacked,
          rate-bps: rate-bps,
          submitted-at: burn-block-height
        })
      (if (>= cycle (var-get latest-cycle))
        (var-set latest-cycle cycle)
        true)
      (print { event: "rate-submitted", cycle: cycle, rate-bps: rate-bps })
      (ok rate-bps))))
