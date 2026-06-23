(impl-trait .sip-010-trait.sip-010-trait)

(define-fungible-token mock-sbtc)

(define-constant ERR-NOT-TOKEN-OWNER (err u101))

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-TOKEN-OWNER)
    (try! (ft-transfer? mock-sbtc amount sender recipient))
    (ok true)))

(define-read-only (get-name) (ok "Mock sBTC"))
(define-read-only (get-symbol) (ok "msBTC"))
(define-read-only (get-decimals) (ok u8))

(define-read-only (get-balance (who principal))
  (ok (ft-get-balance mock-sbtc who)))

(define-read-only (get-total-supply)
  (ok (ft-get-supply mock-sbtc)))

(define-read-only (get-token-uri)
  (ok none))

;; Testnet only - anyone can mint
(define-public (mint (amount uint) (recipient principal))
  (ft-mint? mock-sbtc amount recipient))
