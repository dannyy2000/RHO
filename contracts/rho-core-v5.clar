;; rho-core-v5.clar
;; Rho Protocol - PoX interest rate swap on Stacks.
;;
;; Fixed party: locks sBTC collateral, receives the fixed rate every cycle.
;; Variable party: locks sBTC collateral, receives the actual PoX-5 rate.
;; Each cycle only the difference moves, from one side's collateral to the other's.
;;
;; Payment formula: payment_sats = notional_ustx * rate / RATE-SCALAR
;; where rate = sats earned per 1,000,000 STX (1e12 uSTX) stacked per cycle.
;;
;; What changed from v4
;;
;;   Rates come from pox-rate-oracle-trustless-v2, which reads PoX-5's own
;;   Tranche 2 accounting. No one submits rates.
;;
;;   The settlement rate is capped at CEILING-MULTIPLIER x the fixed rate. That
;;   gives the fixed party a known worst case per cycle, equal to the variable
;;   party's (the full fixed payment, when the actual rate is zero):
;;
;;     worst-case-per-cycle = notional * fixed-rate / RATE-SCALAR
;;
;;   Both sides are margined against it (two-sided variation margin):
;;     - initial margin: 110% of MARGIN-CYCLES cycles of worst case, checked
;;       in post-offer and accept-offer
;;     - maintenance: 100% of the next MARGIN-CYCLES cycles of worst case,
;;       checked for both sides after every settlement
;;     - a side below maintenance gets a margin call and MARGIN-CALL-GRACE
;;       burn blocks to top-up; after that anyone may liquidate
;;     - on liquidation the defaulting side forfeits one cycle of worst case
;;       to the other side, so walking away from a losing swap is not free
;;
;;   Collateral per side is bounded above by the full-term worst case + 10%,
;;   so deposits are bounded by the notional and rate caps.
;;
;;   A swap starts at the cycle after acceptance, so no one is paid for a
;;   partial cycle, and cycles settle strictly in order.
;;
;;   There is no owner and no admin function.

;; -- Errors ---------------------------------------------------------------

(define-constant ERR-OFFER-NOT-FOUND (err u101))
(define-constant ERR-OFFER-NOT-OPEN (err u102))
(define-constant ERR-SWAP-NOT-FOUND (err u103))
(define-constant ERR-SWAP-NOT-ACTIVE (err u104))
(define-constant ERR-ORACLE-RATE-NOT-FOUND (err u107))
(define-constant ERR-ALL-CYCLES-NOT-SETTLED (err u109))
(define-constant ERR-INVALID-PARAMS (err u110))
(define-constant ERR-EXCEEDS-NOTIONAL-CAP (err u111))
(define-constant ERR-EXCEEDS-DURATION-CAP (err u112))
(define-constant ERR-EXCEEDS-RATE-CAP (err u113))
(define-constant ERR-EXCEEDS-TOTAL-NOTIONAL-CAP (err u114))
(define-constant ERR-EXCEEDS-ACTIVE-SWAP-CAP (err u115))
(define-constant ERR-SELF-MATCH (err u116))
(define-constant ERR-BELOW-INITIAL-MARGIN (err u117))
(define-constant ERR-ABOVE-MAX-COLLATERAL (err u118))
(define-constant ERR-NOT-PARTY (err u119))
(define-constant ERR-NOT-LIQUIDATABLE (err u120))
(define-constant ERR-BELOW-MIN-NOTIONAL (err u121))
(define-constant ERR-ALL-CYCLES-SETTLED (err u122))
(define-constant ERR-NOT-AUTHORIZED (err u100))

;; -- Parameters -----------------------------------------------------------

;; Rate unit: sats per 1,000,000 STX (1e12 uSTX) stacked, per cycle.
;; Must match RHO-NOTIONAL-UNIT in pox-rate-oracle-trustless.clar.
(define-constant RATE-SCALAR u1000000000000)

;; The settlement rate never exceeds this multiple of the fixed rate.
(define-constant CEILING-MULTIPLIER u2)

;; Margin is held against this many cycles of worst case.
(define-constant MARGIN-CYCLES u2)
(define-constant INITIAL-MARGIN-PCT u110)
(define-constant MAINTENANCE-MARGIN-PCT u100)

;; Burn blocks a side has to top up after a margin call (~1 day on mainnet).
(define-constant MARGIN-CALL-GRACE u144)

;; -- Pilot caps -----------------------------------------------------------
;; Constants, not admin-settable. Lifting a cap requires a new contract.

(define-constant MIN-NOTIONAL-USTX u10000000000)           ;; 10,000 STX per swap
(define-constant MAX-NOTIONAL-USTX u1000000000000)         ;; 1M STX per swap
(define-constant MAX-TOTAL-NOTIONAL-USTX u5000000000000)   ;; 5M STX across active swaps
(define-constant MAX-DURATION-CYCLES u13)
(define-constant MAX-FIXED-RATE u20000000)                 ;; sats per 1M STX per cycle
(define-constant MAX-ACTIVE-SWAPS u25)

(define-data-var active-notional-ustx uint u0)
(define-data-var active-swap-count uint u0)

;; -- Data -----------------------------------------------------------------

;; offer status: 0=open  1=accepted  2=cancelled
(define-map offers
  { offer-id: uint }
  {
    fixed-party: principal,
    notional-ustx: uint,
    fixed-rate-sats-per-mstx: uint,
    duration-cycles: uint,
    collateral-sats: uint,
    status: uint
  })

;; swap status: 0=active  1=completed  2=liquidated
;; A call deadline of 0 means no margin call is open for that side.
(define-map swaps
  { swap-id: uint }
  {
    offer-id: uint,
    fixed-party: principal,
    variable-party: principal,
    notional-ustx: uint,
    fixed-rate-sats-per-mstx: uint,
    duration-cycles: uint,
    start-cycle: uint,
    cycles-settled: uint,
    fixed-collateral: uint,
    variable-collateral: uint,
    fixed-call-deadline: uint,
    variable-call-deadline: uint,
    status: uint
  })

(define-map cycle-settlements
  { swap-id: uint, cycle: uint }
  {
    actual-rate: uint,
    settlement-rate: uint,
    fixed-payment: uint,
    variable-payment: uint,
    settled-at: uint
  })

(define-data-var offer-nonce uint u0)
(define-data-var swap-nonce uint u0)

;; -- Margin arithmetic ----------------------------------------------------

;; The most either side can owe in one cycle, given the ceiling.
(define-read-only (worst-case-per-cycle (notional-ustx uint) (fixed-rate uint))
  (/ (* notional-ustx fixed-rate) RATE-SCALAR))

(define-read-only (initial-margin (notional-ustx uint) (fixed-rate uint) (duration uint))
  (/ (* (* (worst-case-per-cycle notional-ustx fixed-rate) (min-of duration MARGIN-CYCLES))
        INITIAL-MARGIN-PCT)
     u100))

(define-read-only (maintenance-margin (notional-ustx uint) (fixed-rate uint) (remaining uint))
  (/ (* (* (worst-case-per-cycle notional-ustx fixed-rate) (min-of remaining MARGIN-CYCLES))
        MAINTENANCE-MARGIN-PCT)
     u100))

;; Full-term worst case + 10%. No side may hold more collateral than this.
(define-read-only (max-collateral (notional-ustx uint) (fixed-rate uint) (duration uint))
  (/ (* (* (worst-case-per-cycle notional-ustx fixed-rate) duration) INITIAL-MARGIN-PCT) u100))

(define-read-only (settlement-rate (actual-rate uint) (fixed-rate uint))
  (min-of actual-rate (* fixed-rate CEILING-MULTIPLIER)))

(define-private (min-of (a uint) (b uint)) (if (< a b) a b))

;; -- Read-only ------------------------------------------------------------

(define-read-only (get-offer (offer-id uint))
  (map-get? offers { offer-id: offer-id }))

(define-read-only (get-swap (swap-id uint))
  (map-get? swaps { swap-id: swap-id }))

(define-read-only (get-cycle-settlement (swap-id uint) (cycle uint))
  (map-get? cycle-settlements { swap-id: swap-id, cycle: cycle }))

(define-read-only (get-offer-count) (var-get offer-nonce))
(define-read-only (get-swap-count) (var-get swap-nonce))

;; MAINNET DEPLOYMENT: change to 'SP000000000000000000002Q6VF78.pox-5.
(define-read-only (get-current-pox-cycle)
  (contract-call? 'ST000000000000000000002AMW42H.pox-5 current-pox-reward-cycle))

(define-read-only (get-pilot-caps)
  {
    min-notional-ustx: MIN-NOTIONAL-USTX,
    max-notional-ustx: MAX-NOTIONAL-USTX,
    max-total-notional-ustx: MAX-TOTAL-NOTIONAL-USTX,
    max-duration-cycles: MAX-DURATION-CYCLES,
    max-fixed-rate-sats-per-mstx: MAX-FIXED-RATE,
    max-active-swaps: MAX-ACTIVE-SWAPS,
    ceiling-multiplier: CEILING-MULTIPLIER,
    margin-cycles: MARGIN-CYCLES,
    margin-call-grace: MARGIN-CALL-GRACE
  })

(define-read-only (get-pilot-utilisation)
  {
    active-notional-ustx: (var-get active-notional-ustx),
    active-swap-count: (var-get active-swap-count),
    notional-headroom-ustx: (- MAX-TOTAL-NOTIONAL-USTX (var-get active-notional-ustx)),
    swap-headroom: (- MAX-ACTIVE-SWAPS (var-get active-swap-count))
  })

;; -- Offers ---------------------------------------------------------------

(define-public (post-offer
    (notional-ustx uint)
    (fixed-rate-sats-per-mstx uint)
    (duration-cycles uint)
    (collateral-sats uint))
  (let (
    (caller tx-sender)
    (self (as-contract tx-sender))
    (new-id (+ (var-get offer-nonce) u1))
  )
    (asserts! (> duration-cycles u0) ERR-INVALID-PARAMS)
    (asserts! (>= notional-ustx MIN-NOTIONAL-USTX) ERR-BELOW-MIN-NOTIONAL)
    (asserts! (<= notional-ustx MAX-NOTIONAL-USTX) ERR-EXCEEDS-NOTIONAL-CAP)
    (asserts! (<= duration-cycles MAX-DURATION-CYCLES) ERR-EXCEEDS-DURATION-CAP)
    (asserts! (<= fixed-rate-sats-per-mstx MAX-FIXED-RATE) ERR-EXCEEDS-RATE-CAP)
    ;; Rejects a zero fixed rate and any rate too small to produce a payment.
    (asserts! (> (worst-case-per-cycle notional-ustx fixed-rate-sats-per-mstx) u0) ERR-INVALID-PARAMS)
    (asserts! (>= collateral-sats (initial-margin notional-ustx fixed-rate-sats-per-mstx duration-cycles))
              ERR-BELOW-INITIAL-MARGIN)
    (asserts! (<= collateral-sats (max-collateral notional-ustx fixed-rate-sats-per-mstx duration-cycles))
              ERR-ABOVE-MAX-COLLATERAL)
    (try! (contract-call? .mock-sbtc transfer collateral-sats caller self none))
    (map-set offers { offer-id: new-id }
      {
        fixed-party: caller,
        notional-ustx: notional-ustx,
        fixed-rate-sats-per-mstx: fixed-rate-sats-per-mstx,
        duration-cycles: duration-cycles,
        collateral-sats: collateral-sats,
        status: u0
      })
    (var-set offer-nonce new-id)
    (print { event: "offer-posted", offer-id: new-id, fixed-party: caller,
             notional: notional-ustx, fixed-rate: fixed-rate-sats-per-mstx, duration: duration-cycles })
    (ok new-id)))

(define-public (cancel-offer (offer-id uint))
  (let (
    (offer (unwrap! (map-get? offers { offer-id: offer-id }) ERR-OFFER-NOT-FOUND))
  )
    (asserts! (is-eq (get status offer) u0) ERR-OFFER-NOT-OPEN)
    (asserts! (is-eq tx-sender (get fixed-party offer)) ERR-NOT-AUTHORIZED)
    (try! (as-contract (contract-call? .mock-sbtc transfer (get collateral-sats offer) tx-sender (get fixed-party offer) none)))
    (map-set offers { offer-id: offer-id } (merge offer { status: u2 }))
    (print { event: "offer-cancelled", offer-id: offer-id })
    (ok true)))

(define-public (accept-offer (offer-id uint) (variable-collateral-sats uint))
  (let (
    (offer (unwrap! (map-get? offers { offer-id: offer-id }) ERR-OFFER-NOT-FOUND))
    (caller tx-sender)
    (self (as-contract tx-sender))
    (notional (get notional-ustx offer))
    (fixed-rate (get fixed-rate-sats-per-mstx offer))
    (duration (get duration-cycles offer))
    (new-swap-id (+ (var-get swap-nonce) u1))
    (new-active-notional (+ (var-get active-notional-ustx) notional))
    (new-active-count (+ (var-get active-swap-count) u1))
  )
    (asserts! (is-eq (get status offer) u0) ERR-OFFER-NOT-OPEN)
    (asserts! (not (is-eq caller (get fixed-party offer))) ERR-SELF-MATCH)
    (asserts! (>= variable-collateral-sats (initial-margin notional fixed-rate duration)) ERR-BELOW-INITIAL-MARGIN)
    (asserts! (<= variable-collateral-sats (max-collateral notional fixed-rate duration)) ERR-ABOVE-MAX-COLLATERAL)
    (asserts! (<= new-active-notional MAX-TOTAL-NOTIONAL-USTX) ERR-EXCEEDS-TOTAL-NOTIONAL-CAP)
    (asserts! (<= new-active-count MAX-ACTIVE-SWAPS) ERR-EXCEEDS-ACTIVE-SWAP-CAP)
    (try! (contract-call? .mock-sbtc transfer variable-collateral-sats caller self none))
    (map-set offers { offer-id: offer-id } (merge offer { status: u1 }))
    (map-set swaps { swap-id: new-swap-id }
      {
        offer-id: offer-id,
        fixed-party: (get fixed-party offer),
        variable-party: caller,
        notional-ustx: notional,
        fixed-rate-sats-per-mstx: fixed-rate,
        duration-cycles: duration,
        start-cycle: (+ (get-current-pox-cycle) u1),
        cycles-settled: u0,
        fixed-collateral: (get collateral-sats offer),
        variable-collateral: variable-collateral-sats,
        fixed-call-deadline: u0,
        variable-call-deadline: u0,
        status: u0
      })
    (var-set swap-nonce new-swap-id)
    (var-set active-notional-ustx new-active-notional)
    (var-set active-swap-count new-active-count)
    (print { event: "swap-created", swap-id: new-swap-id, offer-id: offer-id, variable-party: caller })
    (ok new-swap-id)))

;; -- Settlement -----------------------------------------------------------

;; Settle the next unsettled cycle. Callable by anyone once the trustless
;; oracle reports the cycle, which it does only after PoX-5 can no longer
;; credit it.
(define-public (settle-cycle (swap-id uint))
  (let (
    (swap (unwrap! (map-get? swaps { swap-id: swap-id }) ERR-SWAP-NOT-FOUND))
    (cycle (+ (get start-cycle swap) (get cycles-settled swap)))
    (rate-data (unwrap! (contract-call? .pox-rate-oracle-trustless-v2 get-cycle-rate cycle)
                        ERR-ORACLE-RATE-NOT-FOUND))
  )
    (apply-settlement swap-id (get rate-sats-per-mstx rate-data))))

;; Settlement rules for a given actual rate. Separated from the oracle read
;; so the rules can be tested at any rate.
(define-private (apply-settlement (swap-id uint) (actual-rate uint))
  (let (
    (swap (unwrap! (map-get? swaps { swap-id: swap-id }) ERR-SWAP-NOT-FOUND))
    (notional (get notional-ustx swap))
    (fixed-rate (get fixed-rate-sats-per-mstx swap))
    (cycle (+ (get start-cycle swap) (get cycles-settled swap)))
    (rate (settlement-rate actual-rate fixed-rate))
    (fixed-pmt (/ (* notional fixed-rate) RATE-SCALAR))
    (actual-pmt (/ (* notional rate) RATE-SCALAR))
    (variable-wins (>= actual-pmt fixed-pmt))
    (net (if variable-wins (- actual-pmt fixed-pmt) (- fixed-pmt actual-pmt)))
    (payer-col (if variable-wins (get fixed-collateral swap) (get variable-collateral swap)))
    (settled (+ (get cycles-settled swap) u1))
  )
    (asserts! (is-eq (get status swap) u0) ERR-SWAP-NOT-ACTIVE)
    (asserts! (< (get cycles-settled swap) (get duration-cycles swap)) ERR-ALL-CYCLES-SETTLED)
    (map-set cycle-settlements { swap-id: swap-id, cycle: cycle }
      { actual-rate: actual-rate, settlement-rate: rate, fixed-payment: fixed-pmt,
        variable-payment: actual-pmt, settled-at: burn-block-height })
    (print { event: "cycle-settled", swap-id: swap-id, cycle: cycle, actual-rate: actual-rate,
             settlement-rate: rate, fixed-payment: fixed-pmt, variable-payment: actual-pmt })
    (if (< payer-col net)
      ;; The paying side cannot cover this cycle. Everything it holds moves
      ;; to the other side and the swap ends.
      (let (
        (fixed-col (if variable-wins u0 (+ (get fixed-collateral swap) payer-col)))
        (var-col (if variable-wins (+ (get variable-collateral swap) payer-col) u0))
      )
        (end-swap swap-id swap settled fixed-col var-col u2))
      (let (
        (fixed-col (if variable-wins (- (get fixed-collateral swap) net) (+ (get fixed-collateral swap) net)))
        (var-col (if variable-wins (+ (get variable-collateral swap) net) (- (get variable-collateral swap) net)))
        (required (maintenance-margin notional fixed-rate (- (get duration-cycles swap) settled)))
      )
        (map-set swaps { swap-id: swap-id }
          (merge swap {
            cycles-settled: settled,
            fixed-collateral: fixed-col,
            variable-collateral: var-col,
            fixed-call-deadline: (next-deadline fixed-col required (get fixed-call-deadline swap)),
            variable-call-deadline: (next-deadline var-col required (get variable-call-deadline swap))
          }))
        (ok { fixed-payment: fixed-pmt, variable-payment: actual-pmt })))))

;; A side at or above the requirement has no call. A side below it keeps an
;; existing deadline, or gets a new one.
(define-private (next-deadline (collateral uint) (required uint) (current uint))
  (if (>= collateral required)
    u0
    (if (> current u0) current (+ burn-block-height MARGIN-CALL-GRACE))))

;; -- Margin calls ---------------------------------------------------------

;; Either party adds collateral to its own side. Clears that side's margin
;; call once it is back at the maintenance requirement.
(define-public (top-up (swap-id uint) (amount uint))
  (let (
    (swap (unwrap! (map-get? swaps { swap-id: swap-id }) ERR-SWAP-NOT-FOUND))
    (caller tx-sender)
    (self (as-contract tx-sender))
    (notional (get notional-ustx swap))
    (fixed-rate (get fixed-rate-sats-per-mstx swap))
    (is-fixed (is-eq caller (get fixed-party swap)))
    (new-col (+ amount (if is-fixed (get fixed-collateral swap) (get variable-collateral swap))))
    (required (maintenance-margin notional fixed-rate (- (get duration-cycles swap) (get cycles-settled swap))))
    (deadline (if (>= new-col required) u0
                  (if is-fixed (get fixed-call-deadline swap) (get variable-call-deadline swap))))
  )
    (asserts! (is-eq (get status swap) u0) ERR-SWAP-NOT-ACTIVE)
    (asserts! (or is-fixed (is-eq caller (get variable-party swap))) ERR-NOT-PARTY)
    (asserts! (> amount u0) ERR-INVALID-PARAMS)
    (asserts! (<= new-col (max-collateral notional fixed-rate (get duration-cycles swap))) ERR-ABOVE-MAX-COLLATERAL)
    (try! (contract-call? .mock-sbtc transfer amount caller self none))
    (map-set swaps { swap-id: swap-id }
      (if is-fixed
        (merge swap { fixed-collateral: new-col, fixed-call-deadline: deadline })
        (merge swap { variable-collateral: new-col, variable-call-deadline: deadline })))
    (print { event: "top-up", swap-id: swap-id, party: caller, amount: amount })
    (ok new-col)))

;; Anyone may liquidate a side whose margin call has expired. The defaulting
;; side forfeits one cycle of worst case to the other side; everything else
;; is returned.
(define-public (liquidate (swap-id uint))
  (let (
    (swap (unwrap! (map-get? swaps { swap-id: swap-id }) ERR-SWAP-NOT-FOUND))
    (fixed-dl (get fixed-call-deadline swap))
    (var-dl (get variable-call-deadline swap))
    (fixed-defaulted (and (> fixed-dl u0) (> burn-block-height fixed-dl)))
    (var-defaulted (and (> var-dl u0) (> burn-block-height var-dl)))
    (penalty (worst-case-per-cycle (get notional-ustx swap) (get fixed-rate-sats-per-mstx swap)))
    (fixed-col (get fixed-collateral swap))
    (var-col (get variable-collateral swap))
    (fixed-loss (if (and fixed-defaulted (not var-defaulted)) (min-of penalty fixed-col) u0))
    (var-loss (if (and var-defaulted (not fixed-defaulted)) (min-of penalty var-col) u0))
  )
    (asserts! (is-eq (get status swap) u0) ERR-SWAP-NOT-ACTIVE)
    (asserts! (or fixed-defaulted var-defaulted) ERR-NOT-LIQUIDATABLE)
    (print { event: "liquidation", swap-id: swap-id, fixed-defaulted: fixed-defaulted,
             variable-defaulted: var-defaulted })
    (end-swap swap-id swap (get cycles-settled swap)
              (+ (- fixed-col fixed-loss) var-loss)
              (+ (- var-col var-loss) fixed-loss)
              u2)))

;; -- Closing --------------------------------------------------------------

(define-public (close-swap (swap-id uint))
  (let (
    (swap (unwrap! (map-get? swaps { swap-id: swap-id }) ERR-SWAP-NOT-FOUND))
  )
    (asserts! (is-eq (get status swap) u0) ERR-SWAP-NOT-ACTIVE)
    (asserts! (is-eq (get cycles-settled swap) (get duration-cycles swap)) ERR-ALL-CYCLES-NOT-SETTLED)
    (print { event: "swap-closed", swap-id: swap-id })
    (end-swap swap-id swap (get cycles-settled swap)
              (get fixed-collateral swap) (get variable-collateral swap) u1)))

;; Pays out both sides, releases pilot capacity once, and records the final
;; state. Every path that ends a swap goes through here.
(define-private (end-swap
    (swap-id uint)
    (swap { offer-id: uint, fixed-party: principal, variable-party: principal, notional-ustx: uint,
            fixed-rate-sats-per-mstx: uint, duration-cycles: uint, start-cycle: uint,
            cycles-settled: uint, fixed-collateral: uint, variable-collateral: uint,
            fixed-call-deadline: uint, variable-call-deadline: uint, status: uint })
    (settled uint)
    (fixed-payout uint)
    (variable-payout uint)
    (status uint))
  (begin
    (if (> fixed-payout u0)
      (try! (as-contract (contract-call? .mock-sbtc transfer fixed-payout tx-sender (get fixed-party swap) none)))
      true)
    (if (> variable-payout u0)
      (try! (as-contract (contract-call? .mock-sbtc transfer variable-payout tx-sender (get variable-party swap) none)))
      true)
    (var-set active-notional-ustx (- (var-get active-notional-ustx) (get notional-ustx swap)))
    (var-set active-swap-count (- (var-get active-swap-count) u1))
    (map-set swaps { swap-id: swap-id }
      (merge swap { cycles-settled: settled, fixed-collateral: u0, variable-collateral: u0,
                    fixed-call-deadline: u0, variable-call-deadline: u0, status: status }))
    (ok { fixed-payment: fixed-payout, variable-payment: variable-payout })))
