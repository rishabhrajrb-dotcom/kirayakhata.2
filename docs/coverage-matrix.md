# GST and TDS coverage matrix

**Outcomes:**

- **CALC** — the engine calculates a `SUPPORTED` result.
- **ASK** — `NEEDS_MORE_INFORMATION`: a targeted question is shown.
- **REVIEW** — `NEEDS_SPECIALIST_REVIEW`: the engine flags it and never calculates.

A row in this matrix is not evidence that the case is supported. The **Tests** column is the evidence: those test names are in `tests/*.test.js`, and every rule is marked for CA verification in `shared/compliance-config.js`.

## GST on rent and other charges

| Case | Required inputs | Effective period and source | Outcome | Responsible party | Document | Tests |
|---|---|---|---|---|---|---|
| Commercial property, regular registered landlord | Landlord and tenant GST status, property state | 18% rate (REQUIRES_CA_VERIFICATION; GST Council 56 press release) | CALC: forward charge, CGST+SGST or UTGST | Landlord collects | Tax Invoice | "commercial, registered landlord", "UT without legislature" |
| Commercial, unregistered landlord → regular registered tenant | Same, plus service date | From 10 Oct 2024: Notif. 09/2024-CTR, Sr. 5AB (Circ. 245/2025, SOURCE_CHECKED) | CALC: RCM | Tenant pays | Rent invoice marked "GST payable by recipient" | "commercial RCM … 10 Oct 2024" |
| Same, before 10 Oct 2024 | Service date | Not applied backwards | CALC: no GST | — | Rent invoice | same test |
| Commercial, unregistered landlord → composition tenant | Service date | RCM between 10 Oct 2024 and 15 Jan 2025 was regularised "as is where is"; tenant excluded from 16 Jan 2025 (Notif. 07/2025-CTR) | REVIEW for the window; CALC (no GST) after | — | Rent invoice | "composition tenant" |
| Commercial, unregistered landlord → unregistered tenant | Statuses | — | CALC: no GST, plus a reminder to check registration need on PAN-wide turnover | — | Rent invoice | "close month: RCM excluded …" |
| Residential dwelling used as a home, unregistered tenant | Kind, use | Exemption entry 12 | CALC: exempt | — | Bill of Supply (registered landlord) or rent invoice | "residential dwelling" |
| Residential dwelling → registered tenant | Kind, use, proprietor question | RCM from 18 Jul 2022 (Notif. 05/2022-CTR; date REQUIRES_CA_VERIFICATION) | CALC: RCM | Tenant pays | Tax invoice "tax payable on reverse charge: Yes", or rent invoice | same |
| Registered proprietor renting personally as own residence | Proprietor answer | From 1 Jan 2023, Notif. 15/2022-CTR (SOURCE_CHECKED) | CALC: exempt. Before 2023 → REVIEW. Unanswered → ASK | — | Bill of Supply | same |
| Composition recipient of residential RCM | — | The non-residential exclusion is **not** generalised | CALC: RCM | Tenant | — | "residential RCM is NOT excluded for composition" |
| Residential used for business, unregistered tenant | Use | Not exempt | CALC: forward charge if the landlord is registered; otherwise no GST plus a registration note | Landlord | Tax invoice | "residential dwelling" |
| Residential before 18 Jul 2022 | Date | Earlier regime | REVIEW | — | — | same |
| Composition landlord | — | — | REVIEW (Bill of Supply rules) | — | — | "special cases" |
| Registration threshold / PAN-wide turnover / voluntary registration | All income across properties | — | REVIEW: notice only; registration is never inferred from one month | — | — | (message only) |
| Place of supply: property state ≠ registration state | States | IGST Act s.12(3) principle; not encoded beyond a flag | REVIEW (IGST shown as provisional) | — | — | "property in another state" |
| Tenant state alone | — | Does not decide IGST | CALC: intra-state when property state = landlord state | — | — | "tenant state alone" |
| UT without legislature | State code 04/26/31/35/38 | — | CALC: CGST + UTGST | — | — | "UT" |
| Co-ownership, HUF/entity, multiple GSTINs, SEZ, government/local-authority lessor, non-resident, overseas property, related party, PG/hostel/short stay, mixed use, subletting, bare or agricultural land | Special flags in setup | — | REVIEW | — | — | "special cases route to specialist review" |
| UIN recipient (embassy/UN) | Tenant status | — | REVIEW | — | — | (code path) |
| Maintenance / CAM | Owner-confirmed SAC, rate and charge type | Circ. 206/18/2023 lists bundling and pure-agent points; separate presentation does not change treatment | Unconfirmed → REVIEW; confirmed → CALC using the owner's classification, labelled as such | Per item | Separate invoice | "maintenance does not inherit rent treatment" |
| Maintenance billed by a society/RWA | Issuer | — | No landlord document is created | Society | External | "bulk run skips … external maintenance" |
| DG / generator | Nature + confirmation | No SAC or rate is assumed | Unconfirmed → REVIEW | Per item | Separate invoice | "usage reading needed" |
| Electricity/water reimbursements, municipal charges, parking, furnishings, pure agent | — | — | Not modelled as items → REVIEW via unclassified item | — | — | — |
| Security deposit vs rent | Receipt type | — | Deposits are recorded separately and never allocated to rent | — | — | workspace (manual check) |
| Advance rent, forfeiture, time of supply | — | — | **Not implemented** → treat as REVIEW | — | — | — |
| Escalation, partial months, vacancy, termination, rent-free periods, amendments | Version dates, policy | — | CALC. A missing proration policy → ASK, asked once | — | — | billing tests |
| Late fees, interest, discounts, bad debts, refunds | — | — | Credit-note **draft** only, always REVIEW | — | Credit note | "credit note" |
| Short payment | — | It does not reduce GST liability | CALC: flagged as a difference | — | — | "close month: Rs 1 tolerance" |
| Mid-period registration change, composition entry or exit, tenant status change, rate change | Effective date | Versioned terms; the tenant status edit applies to new drafts | Partial: future drafts use the new status, old issued invoices keep their snapshot | — | — | — |
| Invoice particulars (Rule 46) | Supplier and recipient GSTIN, SAC, numbering | Rule 46, linked; numbers up to 16 characters, unique per financial year | CALC with blockers | — | — | "issuance blocked", "invoice number format" |
| e-invoice / IRN | Turnover | — | **Not implemented**. No IRN or QR is ever generated; noted as "not an e-invoice" | — | — | — |
| Filing regime: monthly, QRMP, IFF, PMT-06, CMP-08, annual | Registration, frequency, state | GST portal manuals (REQUIRES_CA_VERIFICATION) | CALC (calendar) | Landlord | — | calendar tests |
| Unregistered landlord whose tenant pays RCM | — | — | No GSTR-1/3B tasks are shown | — | — | "unregistered landlord gets no GSTR" |
| ITC, blocked credits, apportionment | — | — | **Not implemented**: never offsets RCM | — | — | — |
| GST TDS (s.51, specified deductors) | — | — | **Not implemented**: kept separate from income-tax TDS | — | — | — |

## Income-tax TDS on rent

| Case | Required inputs | Effective period and source | Outcome | Tests |
|---|---|---|---|---|
| Company, firm, LLP, trust, government, or individual/HUF with audited business | Category, asset kind | 10% land/building/furniture, 2% plant/machinery. Threshold Rs 50,000 per month from 1 Apr 2025 (Rs 2.4 lakh per year before). GST excluded from the base. All REQUIRES_CA_VERIFICATION. | CALC every month | "TDS: company tenant" |
| Act transition | Earlier of credit or payment | Before 1 Apr 2026 → s.194-I (1961 Act); on or after → s.393(1) (2025 Act). ITD FAQ, SOURCE_CHECKED | Label only; rates are unchanged per the FAQ | same |
| Before FY 2025-26 | Annual rent | Annual threshold | ASK if annual rent is missing | "annual threshold era" |
| Other individual/HUF (old s.194-IB) | Category | 5% until 30 Sep 2024, 2% from 1 Oct 2024. Deducted once in March or the last tenancy month. Form 26QC under the old Act; Form 141 (challan-cum-statement) under the new Act. | CALC: 0 in other months, the year's rent × rate in the deduction month | "small individual" |
| Non-resident landlord (s.195) | Residency | — | REVIEW | "non-resident" |
| No PAN (higher rate) | PAN flag | — | REVIEW | "no PAN" |
| Lower or nil deduction certificate | Owner-entered rate | — | CALC using the reported rate, labelled | (code path) |
| Maintenance or DG TDS (rent vs contract) | — | — | Never assumed (null) | "rent escalation does not move maintenance" |
| Reported vs expected TDS | Reported amount | — | A mismatch is flagged, not accepted; reported TDS is labelled "unverified until it appears in 26AS/AIS" | "reported TDS that fits another rule" |
| Arithmetic match with unresolved tax | — | — | Both shown separately | "amounts can match while tax still needs review" |
| Advance tax | Estimated tax after TDS; senior citizen without business income | Rs 10,000 threshold; 15 Jun/Sep/Dec/Mar (REQUIRES_CA_VERIFICATION) | CALC (calendar, conditional) | "advance tax only when" |
| Annual income tax (ownership shares, municipal taxes, 30% deduction, loan interest, regime, losses) | — | — | **Not computed.** The year-end pack lists missing documents and says it is not a return | — |

## GST registration check (`shared/registration.js`) — conservative by design

| Case | Rule applied | Outcome |
|---|---|---|
| Already registered under the same PAN | Rent is taxed under the existing registration | ALREADY_REGISTERED |
| Aggregate turnover ≤ Rs 20 lakh (Rs 10 lakh in Manipur, Mizoram, Nagaland, Tripura). Exactly 20 lakh does not "exceed". | s.22. Aggregate turnover under s.2(6) is PAN-wide and **includes** exempt home rent and rent on which tenants pay reverse charge (GST excluded). | NOT_REQUIRED. Shows room left and % used; warns at 80%+. |
| Above the limit, and you charge GST yourself on any rent: a commercial tenant who is unregistered or under composition, a home used for business by an unregistered tenant, or other taxable income | s.22 and s.25(1): apply within 30 days. Shows the projected month the limit is crossed. | REQUIRED |
| Above the limit, **all** rent under reverse charge (regular-registered tenants) | Notif. 05/2017-CT under s.23(2). Primary text verified: covers persons **only** making reverse-charge supplies. | **CONDITIONAL.** Lists four conditions, advises getting a CA's written view, and says registering is the safe choice. |
| Above the limit, all rent exempt (homes let as residences to unregistered tenants) | s.23(1)(a) | CONDITIONAL, with conditions |
| Above the limit, mix of exempt and reverse-charge rent | Neither exemption literally applies | REVIEW ("probably required") |
| Commercial rent to a registered tenant before 10 Oct 2024 | Reverse charge was not yet in force, so this was the landlord's own taxable supply | REQUIRED |
| Tenant registered in a different state from the property | Whether reverse charge applies is disputed | Review note |
| Unknown tenant status, or registration status unanswered | — | NEEDS_MORE_INFORMATION |

Tests: "GST registration check: conservative verdicts with conditions".

## Tax invoice compliance (`shared/invoice-rules.js`)

Each item is checked live in the studio and on every invoice. A blocking item stops issue.

| Rule | Particular checked |
|---|---|
| Rule 46(a) | Supplier name and address (missing PIN is a warning); GSTIN valid and matching the billing state |
| Rule 46(b) | Consecutive number, up to 16 characters, unique per financial year |
| Rule 46(c) | Date of issue |
| Rule 46(d) | Recipient name, address and GSTIN (registered tenant) |
| Rule 46(e) | Unregistered recipient with value ≥ Rs 50,000: name, address, state and code |
| Rule 46(f) | SAC on every line: at least 4 digits, or 6 digits above Rs 5 crore turnover (Notif. 78/2020) |
| Rule 46(g) | Description of the service |
| Rule 46(i)(j) | Taxable value and total value |
| Rule 46(k)(l) | Table of CGST / SGST-UTGST / IGST rates and amounts |
| Rule 46(m) | Place of supply, with state name and code |
| Rule 46(o) | "Tax payable on reverse charge: Yes/No" |
| Rule 46(p) | Signatory |
| Rule 48(4) | E-invoicing: blocked above Rs 5 crore turnover, because IRN/QR can't be generated here |
| Rule 47 / s.31(5) | Issued on time (warning only) |
| Rule 48 | "Original for recipient" marking |
| Rule 49 | Bill of supply for exempt rent |
| s.31(3)(f) | Self-invoice note on reverse-charge bills from unregistered landlords |

Tests: "Rule 46 checklist".
