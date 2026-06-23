;; rho-core.clar
;; Rho Protocol - PoX interest rate swap on Stacks.
;;
;; Fixed party: locks sBTC collateral, receives guaranteed BTC yield rate every cycle.
;; Variable party: locks sBTC collateral, receives actual PoX rate, pays the fixed rate.
;; Settlement is automatic - anyone can call settle-cycle after the oracle posts the rate.
;;
;; Payment formula: payment_sats = notional_ustx * rate_bps / 1,000,000
;; where rate_bps = sats earned per 1,000,000 uSTX stacked per cycle.

;; -- Errors ---------------------------------------------------------------

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-OFFER-NOT-FOUND (err u101))
(define-constant ERR-OFFER-NOT-OPEN (err u102))
(define-constant ERR-SWAP-NOT-FOUND (err u103))
(define-constant ERR-SWAP-NOT-ACTIVE (err u104))
(define-constant ERR-CYCLE-ALREADY-SETTLED (err u105))
(define-constant ERR-CYCLE-OUT-OF-RANGE (err u106))
(define-constant ERR-ORACLE-RATE-NOT-FOUND (err u107))
(define-constant ERR-ALL-CYCLES-NOT-SETTLED (err u109))
(define-constant ERR-INVALID-PARAMS (err u110))

;; Maintenance margin: variable party is liquidated if collateral falls
;; below 110% of remaining obligation.
(define-constant MARGIN-NUMERATOR u110)
(define-constant MARGIN-DENOMINATOR u100)

;; -- Data -----------------------------------------------------------------

;; offer status: 0=open  1=accepted  2=cancelled
(define-map offers
  { offer-id: uint }
  {
    fixed-party: principal,
    notional-ustx: uint,
    fixed-rate-bps: uint,
    duration-cycles: uint,
    collateral-sats: uint,
    status: uint
  })

;; swap status: 0=active  1=completed  2=liquidated
(define-map swaps
  { swap-id: uint }
  {
    offer-id: uint,
    fixed-party: principal,
    variable-party: principal,
    notional-ustx: uint,
    fixed-rate-bps: uint,
    duration-cycles: uint,
    start-cycle: uint,
    cycles-settled: uint,
    fixed-collateral: uint,
    variable-collateral: uint,
    status: uint
  })

(define-map cycle-settlements
  { swap-id: uint, cycle: uint }
  {
    fixed-payment: uint,
    variable-payment: uint,
    settled-at: uint
  })

(define-data-var offer-nonce uint u0)
(define-data-var swap-nonce uint u0)

;; -- Read-only ------------------------------------------------------------

(define-read-only (get-offer (offer-id uint))
  (map-get? offers { offer-id: offer-id }))

(define-read-only (get-swap (swap-id uint))
  (map-get? swaps { swap-id: swap-id }))

(define-read-only (get-cycle-settlement (swap-id uint) (cycle uint))
  (map-get? cycle-settlements { swap-id: swap-id, cycle: cycle }))

(define-read-only (get-offer-count) (var-get offer-nonce))
(define-read-only (get-swap-count) (var-get swap-nonce))

(define-read-only (get-current-pox-cycle)
  (/ burn-block-height u2100))

;; -- Public functions -----------------------------------------------------

;; Fixed party posts a rate offer and locks sBTC collateral in escrow.
(define-public (post-offer
    (notional-ustx uint)
    (fixed-rate-bps uint)
    (duration-cycles uint)
    (collateral-sats uint))
  (let (
    (caller tx-sender)
    (self (as-contract tx-sender))
    (new-id (+ (var-get offer-nonce) u1))
  )
    (asserts! (> notional-ustx u0) ERR-INVALID-PARAMS)
    (asserts! (> collateral-sats u0) ERR-INVALID-PARAMS)
    (asserts! (> duration-cycles u0) ERR-INVALID-PARAMS)
    (try! (contract-call? .mock-sbtc transfer collateral-sats caller self none))
    (map-set offers { offer-id: new-id }
      {
        fixed-party: caller,
        notional-ustx: notional-ustx,
        fixed-rate-bps: fixed-rate-bps,
        duration-cycles: duration-cycles,
        collateral-sats: collateral-sats,
        status: u0
      })
    (var-set offer-nonce new-id)
    (print { event: "offer-posted", offer-id: new-id, fixed-party: caller,
             notional: notional-ustx, fixed-rate: fixed-rate-bps, duration: duration-cycles })
    (ok new-id)))

;; Variable party accepts an open offer and locks their sBTC collateral.
;; Creates an active swap starting from the current PoX cycle.
(define-public (accept-offer
    (offer-id uint)
    (variable-collateral-sats uint))
  (let (
    (offer (unwrap! (map-get? offers { offer-id: offer-id }) ERR-OFFER-NOT-FOUND))
    (caller tx-sender)
    (self (as-contract tx-sender))
    (new-swap-id (+ (var-get swap-nonce) u1))
    (start-cycle (get-current-pox-cycle))
  )
    (asserts! (is-eq (get status offer) u0) ERR-OFFER-NOT-OPEN)
    (asserts! (> variable-collateral-sats u0) ERR-INVALID-PARAMS)
    (try! (contract-call? .mock-sbtc transfer variable-collateral-sats caller self none))
    (map-set offers { offer-id: offer-id }
      (merge offer { status: u1 }))
    (map-set swaps { swap-id: new-swap-id }
      {
        offer-id: offer-id,
        fixed-party: (get fixed-party offer),
        variable-party: caller,
        notional-ustx: (get notional-ustx offer),
        fixed-rate-bps: (get fixed-rate-bps offer),
        duration-cycles: (get duration-cycles offer),
        start-cycle: start-cycle,
        cycles-settled: u0,
        fixed-collateral: (get collateral-sats offer),
        variable-collateral: variable-collateral-sats,
        status: u0
      })
    (var-set swap-nonce new-swap-id)
    (print { event: "swap-created", swap-id: new-swap-id, offer-id: offer-id,
             variable-party: caller, start-cycle: start-cycle })
    (ok new-swap-id)))

;; Settle a single PoX cycle for an active swap. Callable by anyone.
;; Reads the oracle rate for the cycle, calculates net payment, and adjusts
;; collateral balances. Triggers liquidation if variable margin falls below 110%.
(define-public (settle-cycle (swap-id uint) (cycle uint))
  (let (
    (swap (unwrap! (map-get? swaps { swap-id: swap-id }) ERR-SWAP-NOT-FOUND))
    (rate-data (unwrap! (contract-call? .pox-rate-oracle get-cycle-rate cycle) ERR-ORACLE-RATE-NOT-FOUND))
    (notional (get notional-ustx swap))
    (fixed-rate (get fixed-rate-bps swap))
    (actual-rate (get rate-bps rate-data))
    (fixed-pmt (/ (* notional fixed-rate) u1000000))
    (actual-pmt (/ (* notional actual-rate) u1000000))
    (new-cycles-settled (+ (get cycles-settled swap) u1))
  )
    (asserts! (is-eq (get status swap) u0) ERR-SWAP-NOT-ACTIVE)
    (asserts! (is-none (map-get? cycle-settlements { swap-id: swap-id, cycle: cycle })) ERR-CYCLE-ALREADY-SETTLED)
    (asserts! (>= cycle (get start-cycle swap)) ERR-CYCLE-OUT-OF-RANGE)
    (asserts! (< cycle (+ (get start-cycle swap) (get duration-cycles swap))) ERR-CYCLE-OUT-OF-RANGE)

    (map-set cycle-settlements { swap-id: swap-id, cycle: cycle }
      { fixed-payment: fixed-pmt, variable-payment: actual-pmt, settled-at: burn-block-height })

    (if (>= actual-rate fixed-rate)
      ;; Variable wins - net moves from fixed collateral to variable collateral.
      ;; Capped at available fixed collateral to prevent underflow.
      (let (
        (net (- actual-pmt fixed-pmt))
        (cur-fixed (get fixed-collateral swap))
        (capped-net (if (>= cur-fixed net) net cur-fixed))
      )
        (map-set swaps { swap-id: swap-id }
          (merge swap {
            cycles-settled: new-cycles-settled,
            fixed-collateral: (- cur-fixed capped-net),
            variable-collateral: (+ (get variable-collateral swap) capped-net)
          })))

      ;; Fixed wins - net moves from variable collateral to fixed collateral.
      ;; Triggers liquidation if variable margin drops below 110% of remaining obligation.
      (let (
        (net (- fixed-pmt actual-pmt))
        (cur-var (get variable-collateral swap))
        (can-pay (>= cur-var net))
        (actual-net (if can-pay net cur-var))
        (new-var-col (if can-pay (- cur-var net) u0))
        (new-fixed-col (+ (get fixed-collateral swap) actual-net))
        (remaining (- (get duration-cycles swap) new-cycles-settled))
        (remaining-obligation (/ (* (* remaining notional) fixed-rate) u1000000))
        (min-margin (/ (* remaining-obligation MARGIN-NUMERATOR) MARGIN-DENOMINATOR))
      )
        (if (or (not can-pay) (< new-var-col min-margin))
          (begin
            (print { event: "liquidation", swap-id: swap-id, cycle: cycle })
            (if (> new-fixed-col u0)
              (try! (as-contract (contract-call? .mock-sbtc transfer new-fixed-col tx-sender (get fixed-party swap) none)))
              true)
            (if (> new-var-col u0)
              (try! (as-contract (contract-call? .mock-sbtc transfer new-var-col tx-sender (get variable-party swap) none)))
              true)
            (map-set swaps { swap-id: swap-id }
              (merge swap {
                cycles-settled: new-cycles-settled,
                fixed-collateral: u0,
                variable-collateral: u0,
                status: u2
              })))
          (map-set swaps { swap-id: swap-id }
            (merge swap {
              cycles-settled: new-cycles-settled,
              fixed-collateral: new-fixed-col,
              variable-collateral: new-var-col
            })))))

    (print { event: "cycle-settled", swap-id: swap-id, cycle: cycle,
             fixed-payment: fixed-pmt, variable-payment: actual-pmt })
    (ok { fixed-payment: fixed-pmt, variable-payment: actual-pmt })))

;; Release remaining collateral to both parties after all cycles are settled.
;; Callable by anyone once cycles-settled == duration-cycles.
(define-public (close-swap (swap-id uint))
  (let (
    (swap (unwrap! (map-get? swaps { swap-id: swap-id }) ERR-SWAP-NOT-FOUND))
    (fix-col (get fixed-collateral swap))
    (var-col (get variable-collateral swap))
  )
    (asserts! (is-eq (get status swap) u0) ERR-SWAP-NOT-ACTIVE)
    (asserts! (is-eq (get cycles-settled swap) (get duration-cycles swap)) ERR-ALL-CYCLES-NOT-SETTLED)
    (if (> fix-col u0)
      (try! (as-contract (contract-call? .mock-sbtc transfer fix-col tx-sender (get fixed-party swap) none)))
      true)
    (if (> var-col u0)
      (try! (as-contract (contract-call? .mock-sbtc transfer var-col tx-sender (get variable-party swap) none)))
      true)
    (map-set swaps { swap-id: swap-id }
      (merge swap { status: u1, fixed-collateral: u0, variable-collateral: u0 }))
    (print { event: "swap-closed", swap-id: swap-id })
    (ok true)))

;; Fixed party cancels an open (unaccepted) offer and reclaims collateral.
(define-public (cancel-offer (offer-id uint))
  (let (
    (offer (unwrap! (map-get? offers { offer-id: offer-id }) ERR-OFFER-NOT-FOUND))
    (collateral (get collateral-sats offer))
  )
    (asserts! (is-eq (get status offer) u0) ERR-OFFER-NOT-OPEN)
    (asserts! (is-eq tx-sender (get fixed-party offer)) ERR-NOT-AUTHORIZED)
    (try! (as-contract (contract-call? .mock-sbtc transfer collateral tx-sender (get fixed-party offer) none)))
    (map-set offers { offer-id: offer-id }
      (merge offer { status: u2 }))
    (print { event: "offer-cancelled", offer-id: offer-id })
    (ok true)))
