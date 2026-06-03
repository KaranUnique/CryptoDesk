/**
 * CryptoDesk Alert Engine
 * Scans article title and description for keywords using whole-word, case-insensitive matching.
 */

const AlertEngine = {
  /**
   * Escapes regex special characters.
   * @param {string} str 
   * @returns {string}
   */
  escapeRegex(str) {
    return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  },

  /**
   * Scans article fields (title, description) for alert keywords.
   * Evaluates alerts and returns the alert state.
   * HIGH tier takes priority over LOW, which takes priority over INFO.
   * 
   * @param {string} title 
   * @param {string} description 
   * @returns {Object} { isAlert: boolean, alertTier: string } (alertTier: 'HIGH' | 'LOW' | 'INFO' | 'NONE')
   */
  scanArticle(title, description) {
    const combinedText = `${title || ''} ${description || ''}`;
    const keywords = SettingsManager.getAlertKeywords();
    
    let matchedTier = 'NONE';
    
    // Sort keywords so that HIGH keywords are processed first or we can scan all and take the maximum tier.
    // Tiers order of priority: HIGH (3) > LOW (2) > INFO (1) > NONE (0)
    const tierPriority = {
      'HIGH': 3,
      'LOW': 2,
      'INFO': 1,
      'NONE': 0
    };

    for (const kwObj of keywords) {
      const keyword = kwObj.keyword.trim();
      if (!keyword) continue;

      const escaped = this.escapeRegex(keyword);
      // Whole-word match. We use word boundary \b. 
      // Handling word boundaries for keywords containing spaces (like 'rug pull') is supported by \b.
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');

      if (regex.test(combinedText)) {
        const keywordTier = kwObj.tier || 'INFO';
        if (tierPriority[keywordTier] > tierPriority[matchedTier]) {
          matchedTier = keywordTier;
        }
      }
    }

    return {
      isAlert: matchedTier !== 'NONE',
      alertTier: matchedTier
    };
  }
};
