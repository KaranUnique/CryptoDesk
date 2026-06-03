/**
 * CryptoDesk Database Layer (IndexedDB)
 * Stores aggregated articles and provides queries.
 */

const DB_NAME = 'cryptodesk';
const DB_VERSION = 1;
const STORE_NAME = 'Articles';

let dbInstance = null;

/**
 * Initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      return resolve(dbInstance);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        
        // Create indexes for efficient searching/filtering
        store.createIndex('publishedAt', 'publishedAt', { unique: false });
        store.createIndex('source', 'source', { unique: false });
        store.createIndex('isAlert', 'isAlert', { unique: false });
        store.createIndex('isRead', 'isRead', { unique: false });
      }
    };
  });
}

/**
 * Generates a SHA-256 hash of a string.
 * Used for duplicate detection.
 * @param {string} message 
 * @returns {Promise<string>}
 */
async function generateSHA256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Saves a single article to the store.
 * @param {Object} article 
 * @returns {Promise<boolean>} Resolves to true if new, false if duplicate/error
 */
async function saveArticle(article) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Check duplicate first
    const getReq = store.get(article.id);
    
    getReq.onsuccess = () => {
      if (getReq.result) {
        // Article already exists, skip
        resolve(false);
      } else {
        // Add new article
        const addReq = store.add(article);
        addReq.onsuccess = () => resolve(true);
        addReq.onerror = (e) => {
          console.error('Failed to add article:', e.target.error);
          reject(e.target.error);
        };
      }
    };

    getReq.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Checks if an article exists by its ID.
 * @param {string} id 
 * @returns {Promise<boolean>}
 */
async function articleExists(id) {
  const db = await initDB();
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    
    request.onsuccess = () => {
      resolve(!!request.result);
    };
    request.onerror = () => resolve(false);
  });
}

/**
 * Updates the read status of an article.
 * @param {string} id 
 * @param {boolean} isRead 
 * @returns {Promise<void>}
 */
async function updateReadStatus(id, isRead) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const article = getReq.result;
      if (article) {
        article.isRead = isRead;
        const updateReq = store.put(article);
        updateReq.onsuccess = () => resolve();
        updateReq.onerror = (e) => reject(e.target.error);
      } else {
        reject(new Error(`Article not found: ${id}`));
      }
    };
    getReq.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieves all articles.
 * Sorting and filtering can be done in-memory or using indexes.
 * @returns {Promise<Array>}
 */
async function getAllArticles() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('publishedAt');
    const request = index.openCursor(null, 'prev'); // Default: Newest first
    const results = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Limits storage count to maxArticles by deleting the oldest entries.
 * @param {number} maxArticles 
 * @returns {Promise<number>} Number of deleted articles
 */
async function enforceRetentionLimit(maxArticles) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('publishedAt');
    const countReq = store.count();

    countReq.onsuccess = () => {
      const currentCount = countReq.result;
      if (currentCount <= maxArticles) {
        resolve(0);
        return;
      }

      const overage = currentCount - maxArticles;
      let deleted = 0;
      // Open cursor from oldest first
      const cursorReq = index.openCursor(null, 'next');
      
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && deleted < overage) {
          cursor.delete();
          deleted++;
          cursor.continue();
        } else {
          resolve(deleted);
        }
      };
      
      cursorReq.onerror = (e) => reject(e.target.error);
    };
    
    countReq.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Clears the article store completely.
 * @returns {Promise<void>}
 */
async function clearAllArticles() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Fetches dashboard analytics stats.
 * - Total Articles
 * - New Articles in 24h
 * - Alert Articles count
 * - Group counts for sidebar
 * @returns {Promise<Object>}
 */
async function getStats() {
  const articles = await getAllArticles();
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  
  let total = articles.length;
  let new24h = 0;
  let alerts = 0;
  
  const sourceCounts = {};
  const topicCounts = {};

  articles.forEach(art => {
    if (art.publishedAt >= oneDayAgo) {
      new24h++;
    }
    if (art.isAlert) {
      alerts++;
    }
    
    // Count per source
    if (art.sourceId) {
      sourceCounts[art.sourceId] = (sourceCounts[art.sourceId] || 0) + 1;
    }
    
    // Count per topic
    if (art.topicMatches && Array.isArray(art.topicMatches)) {
      art.topicMatches.forEach(topic => {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      });
    }
  });

  return {
    total,
    new24h,
    alerts,
    sourceCounts,
    topicCounts
  };
}
