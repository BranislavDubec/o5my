UPDATE bank_transactions
SET payer_account = COALESCE(CASE WHEN json_valid(raw_data) THEN json_extract(raw_data, '$.normalized.counterAccount') END, payer_iban),
    payer_bank_code = CASE WHEN json_valid(raw_data) THEN json_extract(raw_data, '$.normalized.counterBankCode') END,
    payer_iban = CASE
      WHEN length(replace(payer_iban, ' ', '')) BETWEEN 15 AND 34
        AND substr(upper(replace(payer_iban, ' ', '')), 1, 2) GLOB '[A-Z][A-Z]'
        AND substr(replace(payer_iban, ' ', ''), 3, 2) GLOB '[0-9][0-9]'
      THEN upper(replace(payer_iban, ' ', ''))
      ELSE NULL
    END;
