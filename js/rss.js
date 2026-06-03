/**
 * CryptoDesk RSS Ingestion Engine
 * Implements a cascading multi-level fetch priority strategy,
 * precise error classification diagnostics, and individual/global feed syncing.
 */

const RSSEngine = {
  intervalId: null,
  isSyncing: false,

  /**
   * Helper to strip HTML and return text.
   * @param {string} html 
   * @returns {string}
   */
  cleanHTML(html) {
    if (!html) return '';
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return doc.body.textContent || doc.body.innerText || '';
    } catch (e) {
      return html.replace(/<[^>]*>/g, '');
    }
  },

  /**
   * Parses XML string into standardized article objects.
   * Supports RSS 2.0 and Atom feeds.
   * @param {string} xmlText 
   * @returns {Array<Object>} Array of raw feed items
   */
  parseFeedXML(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid XML format');
    }
    
    const items = [];
    const rssItems = doc.querySelectorAll('item');
    const atomEntries = doc.querySelectorAll('entry');
    
    if (rssItems.length > 0) {
      rssItems.forEach(item => {
        const title = item.querySelector('title')?.textContent || '';
        let description = item.querySelector('description')?.textContent || '';
        if (!description) {
          const contentEncoded = item.getElementsByTagName('content:encoded');
          if (contentEncoded && contentEncoded.length > 0) {
            description = contentEncoded[0].textContent;
          }
        }
        
        const link = item.querySelector('link')?.textContent || '';
        const pubDateText = item.querySelector('pubDate')?.textContent || item.querySelector('date')?.textContent || '';
        
        let publishedAt = Date.now();
        if (pubDateText) {
          const parsedDate = Date.parse(pubDateText);
          if (!isNaN(parsedDate)) {
            publishedAt = parsedDate;
          }
        }
        
        items.push({
          title: title.trim(),
          description: this.cleanHTML(description).trim(),
          link: link.trim(),
          publishedAt
        });
      });
    } else if (atomEntries.length > 0) {
      atomEntries.forEach(entry => {
        const title = entry.querySelector('title')?.textContent || '';
        const summary = entry.querySelector('summary')?.textContent || entry.querySelector('content')?.textContent || '';
        
        let link = '';
        const linkNode = entry.querySelector('link');
        if (linkNode) {
          link = linkNode.getAttribute('href') || linkNode.textContent || '';
        }
        
        const updatedText = entry.querySelector('updated')?.textContent || entry.querySelector('published')?.textContent || '';
        let publishedAt = Date.now();
        if (updatedText) {
          const parsedDate = Date.parse(updatedText);
          if (!isNaN(parsedDate)) {
            publishedAt = parsedDate;
          }
        }
        
        items.push({
          title: title.trim(),
          description: this.cleanHTML(summary).trim(),
          link: link.trim(),
          publishedAt
        });
      });
    } else {
      throw new Error('Parse Error: No valid RSS items or Atom entries found');
    }
    
    return items;
  },

  /**
   * Detects topics matched in the text.
   * @param {string} title 
   * @param {string} description 
   * @param {Array<Object>} topics 
   * @returns {Array<string>} List of matched topic names
   */
  detectTopics(title, description, topics) {
    const combinedText = `${title || ''} ${description || ''}`;
    const matchedTopics = [];
    
    topics.forEach(topic => {
      const hasMatch = topic.keywords.some(keyword => {
        const escaped = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        return regex.test(combinedText);
      });
      
      if (hasMatch) {
        matchedTopics.push(topic.name);
      }
    });
    
    return matchedTopics;
  },

  /**
   * Cascading fallbacks for fetching feed URL according to priority:
   * Level 1: Cloudflare Worker Proxy
   * Level 2: User Configured Custom Proxy
   * Level 3: AllOrigins Fallback
   * Level 4: Direct Fetch
   */
  async fetchFeedCascading(feedUrl, settings) {
    const fetchMethods = [];

    // Level 1: Cloudflare Worker
    if (settings.cloudflareWorkerUrl && settings.cloudflareWorkerUrl.trim() !== '') {
      fetchMethods.push({
        name: 'Cloudflare Worker',
        url: settings.cloudflareWorkerUrl.trim() + encodeURIComponent(feedUrl)
      });
    }

    // Level 2: User Custom Proxy
    if (settings.customProxyUrl && settings.customProxyUrl.trim() !== '') {
      fetchMethods.push({
        name: 'Custom Proxy',
        url: settings.customProxyUrl.trim() + encodeURIComponent(feedUrl)
      });
    }

    // Level 3: Public Proxy Fallbacks (CorsProxy.io -> AllOrigins)
    if (settings.useAllOriginsFallback) {
      fetchMethods.push({
        name: 'CorsProxy.io',
        url: 'https://corsproxy.io/?' + encodeURIComponent(feedUrl)
      });
      fetchMethods.push({
        name: 'AllOrigins Fallback',
        url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(feedUrl)
      });
    }

    // Level 4: Direct Fetch
    if (settings.useDirectFetchFallback) {
      fetchMethods.push({
        name: 'Direct Fetch',
        url: feedUrl
      });
    }

    let lastError = null;

    for (const method of fetchMethods) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), settings.requestTimeout || 15000);

      try {
        const response = await fetch(method.url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          const text = await response.text();
          return { text, methodUsed: method.name };
        } else {
          throw new Error(`HTTP_${response.status}`);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
        console.warn(`Priority Fetch '${method.name}' failed for URL ${feedUrl}:`, err);
      }
    }

    throw lastError || new Error('No fetch fallbacks configured');
  },

  /**
   * Classifies thrown exceptions into precise error categories.
   */
  classifyError(error, settings) {
    if (!navigator.onLine) {
      return { type: 'OFFLINE', message: 'Offline connection detected.' };
    }

    const message = error.message || '';
    
    if (error.name === 'AbortError' || message.includes('Timeout') || message.includes('timeout')) {
      return {
        type: 'TIMEOUT',
        message: `Connection timed out after ${(settings.requestTimeout || 15000) / 1000}s.`
      };
    }

    if (message.includes('HTTP_429')) {
      return {
        type: 'RATE_LIMITED',
        message: 'Rate limit blocked (HTTP 429).'
      };
    }

    if (message.includes('Invalid XML') || message.includes('Parse Error') || message.includes('parsererror')) {
      return {
        type: 'PARSE_ERROR',
        message: 'XML format parsing failed.'
      };
    }

    if (error.name === 'TypeError' || message.includes('Failed to fetch') || message.includes('network error')) {
      return {
        type: 'CORS_BLOCKED',
        message: 'CORS header blockade or host unreachable.'
      };
    }

    if (message.startsWith('HTTP_')) {
      return {
        type: 'NETWORK_ERROR',
        message: `HTTP response server error (${message.replace('HTTP_', '')}).`
      };
    }

    return {
      type: 'UNKNOWN',
      message: message || 'An unknown network error occurred.'
    };
  },

  /**
   * Synchronizes a single feed source.
   */
  async syncSingle(sourceId, onProgress = null) {
    const settings = SettingsManager.getSettings();
    const sources = SettingsManager.getSources();
    const source = sources.find(s => s.id === sourceId);
    if (!source) return { newCount: 0, error: 'Source not found' };

    const topics = SettingsManager.getTopics();
    const start = Date.now();
    let newCount = 0;
    const alertsTriggered = [];

    if (onProgress) onProgress('Fetching...');

    try {
      const fetchResult = await this.fetchFeedCascading(source.url, settings);
      const elapsed = Date.now() - start;

      if (onProgress) onProgress('Parsing XML...');
      const items = this.parseFeedXML(fetchResult.text);

      for (const item of items) {
        const idInput = `${item.title}${source.name}${item.link}`;
        const id = await generateSHA256(idInput);
        const exists = await articleExists(id);

        if (!exists) {
          const alertResult = AlertEngine.scanArticle(item.title, item.description);
          const topicMatches = this.detectTopics(item.title, item.description, topics);

          const article = {
            id,
            title: item.title,
            description: item.description,
            link: item.link,
            source: source.name,
            sourceId: source.id,
            publishedAt: item.publishedAt,
            fetchedAt: Date.now(),
            isAlert: alertResult.isAlert,
            alertTier: alertResult.alertTier,
            isRead: false,
            topicMatches
          };

          const saved = await saveArticle(article);
          if (saved) {
            newCount++;
            if (article.isAlert) {
              alertsTriggered.push(article);
            }
          }
        }
      }

      // Record successful reliability metrics
      SettingsManager.updateSourceHealth(source.id, true, 'LIVE', '', elapsed);
      if (alertsTriggered.length > 0) {
        NotificationManager.handleNewAlerts(alertsTriggered);
      }

      if (onProgress) onProgress(`LIVE (+${newCount})`);
      return { newCount, error: null };
    } catch (err) {
      const elapsed = Date.now() - start;
      const errorDetail = this.classifyError(err, settings);

      // Record failed reliability metrics
      SettingsManager.updateSourceHealth(source.id, false, errorDetail.type, errorDetail.message, elapsed);

      if (onProgress) onProgress(errorDetail.type);
      return { newCount: 0, error: errorDetail.message };
    }
  },

  /**
   * Cascading synchronization loop of all active sources.
   */
  async syncAll(onProgress = null) {
    if (this.isSyncing) return;
    this.isSyncing = true;

    const settings = SettingsManager.getSettings();
    const sources = SettingsManager.getSources().filter(s => s.active);
    
    let totalNewArticles = 0;
    let totalAlertsCount = 0;

    for (const source of sources) {
      if (onProgress) onProgress(source.id, 'Syncing...', false);

      const res = await this.syncSingle(source.id, (status) => {
        if (onProgress) onProgress(source.id, status, false);
      });

      totalNewArticles += res.newCount;
      if (onProgress) onProgress(source.id, '', true);
    }

    // Apply storage retention limit
    if (totalNewArticles > 0) {
      await enforceRetentionLimit(settings.maxArticles);
    }

    this.isSyncing = false;

    // Dispatch global completion event
    window.dispatchEvent(new CustomEvent('cryptodesk-sync-complete', {
      detail: {
        newArticlesCount: totalNewArticles
      }
    }));
  },

  /**
   * Starts the automatic refresh interval loop.
   */
  startAutoRefresh() {
    this.stopAutoRefresh();
    const settings = SettingsManager.getSettings();
    const intervalMins = settings.refreshInterval || 15;

    // Initial sync
    this.syncAll();

    this.intervalId = setInterval(() => {
      console.log('Automated sync loop executing...');
      this.syncAll();
    }, intervalMins * 60 * 1000);
  },

  /**
   * Stops the automatic refresh interval loop.
   */
  stopAutoRefresh() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },

  restartAutoRefresh() {
    this.startAutoRefresh();
  }
};
