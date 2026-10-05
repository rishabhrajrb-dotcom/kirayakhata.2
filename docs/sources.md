# Source register (checked 5 October 2026)

| Rule | Source | How it was checked | Status in config |
|---|---|---|---|
| Commercial RCM from 10.10.2024 (Sr. 5AB, Notif. 09/2024-CTR); composition tenants excluded from 16.01.2025 (Notif. 07/2025-CTR); 10.10.2024–15.01.2025 regularised "as is where is" | [CBIC Circular 245/02/2025-GST, para 8](https://gstcouncil.gov.in/sites/default/files/2025-01/cir-245022025-cgst.pdf) | Full PDF read | SOURCE_CHECKED (the underlying notifications themselves were not re-read) |
| Proprietor's own-residence explanation to entry 12, w.e.f. 01.01.2023 | [Notification 15/2022-CT(Rate)](https://cbic-gst.gov.in/pdf/central-tax-rate/15_2022-ctr-eng.pdf) | Full PDF read | SOURCE_CHECKED |
| Residential dwelling to a registered person under RCM from 18.07.2022 (Notif. 05/2022-CTR) | The note in Notif. 15/2022 references the 04/2022 amendment; 05/2022 itself was not read | Not directly verified | REQUIRES_CA_VERIFICATION |
| 18% on renting of immovable property, unchanged by the 22.09.2025 rationalisation | [PIB note on the 56th GST Council](https://gstcouncil.gov.in/sites/default/files/2025-09/press_release_press_information_bureau_0.pdf); secondary sources agree | Search summaries only | REQUIRES_CA_VERIFICATION |
| TDS Act transition: earlier of credit or payment on or after 01.04.2026 → 2025 Act; "rates and thresholds remain the same"; Form 141 challan-cum-statement | [ITD TDS compliance FAQs](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/%20tds%20compliance-faq) | Page fetched | SOURCE_CHECKED |
| 194-IB at 2% above Rs 50,000 per month; threshold revision to Rs 50,000 per month (Finance Act 2025) | [ITD — TDS on rent by certain individuals/HUF](https://www.incometaxindia.gov.in/w/tds-on-rent-by-certain-individual-or-huf) | Search summary; page returned 403 | REQUIRES_CA_VERIFICATION |
| s.393 rent rows: 10% land/building, 2% plant/machinery, Rs 50,000 per month | [ITD — Section 393](https://www.incometaxindia.gov.in/w/section-393-5); secondary sources | Search summary | REQUIRES_CA_VERIFICATION |
| 194-IB rate was 5% until 30.09.2024 | Widely published (Finance (No. 2) Act 2024) | Not fetched | REQUIRES_CA_VERIFICATION |
| GST excluded from the TDS base when shown separately (CBDT Circ. 23/2017) | — | Not fetched | REQUIRES_CA_VERIFICATION |
| GSTR-1 on the 11th / GSTR-3B on the 20th; QRMP GSTR-1 on the 13th, IFF from the 1st to the 13th, PMT-06 on the 25th, GSTR-3B on the 22nd/24th by state category; CMP-08 on the 18th | GST portal manuals: [GSTR-1](https://tutorial.gst.gov.in/userguide/returns/GSTR_1.htm), [QRMP](https://tutorial.gst.gov.in/userguide/returns/FAQs_change_profile.htm), [IFF](https://tutorial.gst.gov.in/userguide/returns/Manual_IFF.htm) | Linked, not re-read in this build | REQUIRES_CA_VERIFICATION |
| Advance tax instalments and the Rs 10,000 threshold | [ITD tax payment FAQs](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tax-payments-faq?mobile-app=1) | Linked | REQUIRES_CA_VERIFICATION |
| Invoice particulars | [CGST Rule 46](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001), [CBIC invoice guidance](https://cbic-gst.gov.in/gst-invoice-rules.html) | Linked | 16-character / unique-per-FY numbering implemented; review the other particulars |
| Bundled electricity/maintenance, pure agent | [CBIC Circular 206/18/2023-GST](https://cbic-gst.gov.in/pdf/clarifications-regarding-applicability-GST-certain-services.pdf) | Linked | Items stay REVIEW unless the owner confirms them |

Government due-date extensions go in `GST_FILING.extensions` in `shared/compliance-config.js`. Each extension needs its notification number. None was entered in this build.
