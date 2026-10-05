// GST filing adapter - MOCK. Real filing needs an authorised GSP/ASP, the taxpayer's consent,
// reviewed rules, reliable filing status/evidence and explicit approval for each return.
// No portal scraping, no stored passwords/OTPs, and never a mock "filed" confirmation.
export const gstProvider = {
  name: 'none', canFile: false,
  async fileReturn() { throw new Error('GST filing is not integrated. Use the GST portal; KirayaKhata only prepares records.'); },
};
