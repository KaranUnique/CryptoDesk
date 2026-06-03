/**
 * CryptoDesk Settings & Configurations (LocalStorage)
 * Initializes default settings, sources, alert keywords, and topics.
 * Manages reliability metrics and status classifications.
 */

const DEFAULT_SETTINGS = {
  refreshInterval: 15, // in minutes
  maxArticles: 1000,
  soundEnabled: true,
  notificationsEnabled: true,
  preferredFetchMethod: 'allorigins', // 'worker' | 'custom' | 'allorigins' | 'direct'
  cloudflareWorkerUrl: '',
  customProxyUrl: '',
  useAllOriginsFallback: true,
  useDirectFetchFallback: true,
  requestTimeout: 15000 // 15 seconds default timeout
};

const DEFAULT_SOURCES = [
  {
    id: 'cointelegraph',
    name: 'CoinTelegraph',
    url: 'https://cointelegraph.com/rss',
    active: true
  },
  {
    id: 'coindesk',
    name: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    active: true
  },
  {
    id: 'decrypt',
    name: 'Decrypt',
    url: 'https://decrypt.co/feed',
    active: true
  },
  {
    id: 'crypto-briefing',
    name: 'Crypto Briefing',
    url: 'https://cryptobriefing.com/feed/',
    active: true
  },
  {
    id: 'bitcoin-news',
    name: 'Bitcoin News',
    url: 'https://news.bitcoin.com/feed/',
    active: true
  },
  // {
  //   id: 'bitcoin-magazine',
  //   name: 'Bitcoin Magazine',
  //   url: 'https://bitcoinmagazine.com/.rss/full/',
  //   active: true
  // },
  // {
  //   id: 'cryptoslate',
  //   name: 'CryptoSlate',
  //   url: 'https://cryptoslate.com/feed/',
  //   active: true
  // },
  {
    id: 'newsbtc',
    name: 'NewsBTC',
    url: 'https://www.newsbtc.com/feed/',
    active: true
  },
  {
    id: 'cryptopotato',
    name: 'CryptoPotato',
    url: 'https://cryptopotato.com/feed/',
    active: true
  },
  {
    id: 'beincrypto',
    name: 'BeInCrypto',
    url: 'https://beincrypto.com/feed/',
    active: true
  },
  {
    id: 'u-today',
    name: 'U.Today',
    url: 'https://u.today/rss',
    active: true
  }
];

const DEFAULT_ALERT_KEYWORDS = [
  // HIGH alerts
  { keyword: 'hack', tier: 'HIGH' },
  { keyword: 'exploit', tier: 'HIGH' },
  { keyword: 'rug pull', tier: 'HIGH' },
  { keyword: 'breach', tier: 'HIGH' },
  { keyword: 'bankrupt', tier: 'HIGH' },
  { keyword: 'arrest', tier: 'HIGH' },
  { keyword: 'stolen', tier: 'HIGH' },
  { keyword: 'drain', tier: 'HIGH' },
  { keyword: 'attack', tier: 'HIGH' },
  { keyword: 'seized', tier: 'HIGH' },
  
  // LOW alerts
  { keyword: 'etf', tier: 'LOW' },
  { keyword: 'lawsuit', tier: 'LOW' },
  { keyword: 'sec', tier: 'LOW' },
  { keyword: 'sanctions', tier: 'LOW' },
  { keyword: 'regulation', tier: 'LOW' },
  { keyword: 'investigation', tier: 'LOW' }
];

const DEFAULT_TOPICS = [
  { name: 'Bitcoin', keywords: ['bitcoin', 'btc', 'satoshi'] },
  { name: 'Ethereum', keywords: ['ethereum', 'eth', 'vitalik'] },
  { name: 'DeFi', keywords: ['defi', 'yield', 'lending', 'dex', 'uniswap', 'makerdao', 'aave'] },
  { name: 'Regulation', keywords: ['regulation', 'sec', 'lawsuit', 'cftc', 'compliance', 'ban'] },
  { name: 'Stablecoins', keywords: ['stablecoin', 'usdt', 'usdc', 'tether', 'circle'] },
  { name: 'Exchanges', keywords: ['exchange', 'binance', 'coinbase', 'kraken', 'okx', 'cz'] }
];

const SettingsManager = {
  /**
   * Initializes all configuration structures with defaults
   */
  init() {
    if (!localStorage.getItem('cryptodesk_settings')) {
      localStorage.setItem('cryptodesk_settings', JSON.stringify(DEFAULT_SETTINGS));
    }
    if (!localStorage.getItem('cryptodesk_sources')) {
      localStorage.setItem('cryptodesk_sources', JSON.stringify(DEFAULT_SOURCES));
    } else {
      // Ensure any newly added default sources are merged into existing local storage
      const currentSources = JSON.parse(localStorage.getItem('cryptodesk_sources'));
      let modified = false;
      DEFAULT_SOURCES.forEach(ds => {
        if (!currentSources.find(cs => cs.id === ds.id)) {
          currentSources.push(ds);
          modified = true;
        }
      });
      if (modified) {
        localStorage.setItem('cryptodesk_sources', JSON.stringify(currentSources));
      }
    }
    if (!localStorage.getItem('cryptodesk_alert_keywords')) {
      localStorage.setItem('cryptodesk_alert_keywords', JSON.stringify(DEFAULT_ALERT_KEYWORDS));
    }
    if (!localStorage.getItem('cryptodesk_topics')) {
      localStorage.setItem('cryptodesk_topics', JSON.stringify(DEFAULT_TOPICS));
    }
    if (!localStorage.getItem('cryptodesk_source_reliability')) {
      localStorage.setItem('cryptodesk_source_reliability', JSON.stringify({}));
    }
    if (!localStorage.getItem('cryptodesk_sync_history')) {
      localStorage.setItem('cryptodesk_sync_history', JSON.stringify({
        lastSyncTime: 0,
        lastSuccessfulSync: 0,
        articlesFetched: 0,
        newArticlesAdded: 0,
        syncDuration: 0
      }));
    }
    // Backward compatibility check for newer settings
    const settings = JSON.parse(localStorage.getItem('cryptodesk_settings'));
    if (settings && !settings.preferredFetchMethod) {
      localStorage.setItem('cryptodesk_settings', JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }));
    }
  },

  getSettings() {
    this.init();
    return JSON.parse(localStorage.getItem('cryptodesk_settings'));
  },

  setSettings(settings) {
    localStorage.setItem('cryptodesk_settings', JSON.stringify(settings));
  },

  getSources() {
    this.init();
    return JSON.parse(localStorage.getItem('cryptodesk_sources'));
  },

  setSources(sources) {
    localStorage.setItem('cryptodesk_sources', JSON.stringify(sources));
  },

  getAlertKeywords() {
    this.init();
    return JSON.parse(localStorage.getItem('cryptodesk_alert_keywords'));
  },

  setAlertKeywords(keywords) {
    localStorage.setItem('cryptodesk_alert_keywords', JSON.stringify(keywords));
  },

  getTopics() {
    this.init();
    return JSON.parse(localStorage.getItem('cryptodesk_topics'));
  },

  setTopics(topics) {
    localStorage.setItem('cryptodesk_topics', JSON.stringify(topics));
  },

  getSourceReliability() {
    this.init();
    return JSON.parse(localStorage.getItem('cryptodesk_source_reliability'));
  },

  setSourceReliability(reliability) {
    localStorage.setItem('cryptodesk_source_reliability', JSON.stringify(reliability));
  },

  getSyncHistory() {
    this.init();
    return JSON.parse(localStorage.getItem('cryptodesk_sync_history'));
  },

  setSyncHistory(history) {
    localStorage.setItem('cryptodesk_sync_history', JSON.stringify(history));
  },

  /**
   * Registers reliability metric counters and connection health.
   */
  updateSourceHealth(sourceId, isSuccess, statusType, errorMessage, responseTime) {
    const rel = this.getSourceReliability();
    if (!rel[sourceId]) {
      rel[sourceId] = {
        sourceId: sourceId,
        successCount: 0,
        failureCount: 0,
        reliabilityScore: 100,
        averageResponseTime: 0,
        lastSuccessfulFetch: 0,
        lastFailure: 0,
        status: 'UNKNOWN',
        errorMessage: ''
      };
    }
    const entry = rel[sourceId];

    if (isSuccess) {
      entry.successCount++;
      entry.lastSuccessfulFetch = Date.now();
      entry.status = 'LIVE';
      entry.errorMessage = '';
    } else {
      entry.failureCount++;
      entry.lastFailure = Date.now();
      entry.status = statusType;
      entry.errorMessage = errorMessage || '';
    }

    if (responseTime > 0) {
      if (entry.averageResponseTime === 0) {
        entry.averageResponseTime = responseTime;
      } else {
        // Compute running average (last 4 fetches + current fetch)
        entry.averageResponseTime = Math.round((entry.averageResponseTime * 4 + responseTime) / 5);
      }
    }

    const total = entry.successCount + entry.failureCount;
    if (total > 0) {
      entry.reliabilityScore = Math.round((entry.successCount / total) * 100);
    }

    this.setSourceReliability(rel);
  },

  /**
   * Resets settings back to default.
   */
  resetToDefaults() {
    localStorage.removeItem('cryptodesk_settings');
    localStorage.removeItem('cryptodesk_sources');
    localStorage.removeItem('cryptodesk_alert_keywords');
    localStorage.removeItem('cryptodesk_topics');
    localStorage.removeItem('cryptodesk_source_reliability');
    localStorage.removeItem('cryptodesk_sync_history');
    this.init();
  }
};

// Initialize on script load
SettingsManager.init();
