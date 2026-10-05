// Income-tax adapter - MOCK. AIS/26AS retrieval or return filing would need an authorised
// intermediary, consent and explicit approval. Reported TDS stays "reported, unverified".
export const incomeTaxProvider = {
  name: 'none', canFetchAIS: false, canFile: false,
  async fetchTaxCredits() { throw new Error('Not integrated. Download Form 26AS/AIS yourself from the income-tax portal.'); },
};
