/**
 * CryptoDesk Admin Panel Controller
 * Handles tab transitions, bulk source library, priority fetch configurations, and JSON backups.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize default states
  loadSourcesList();
  loadKeywordsList();
  loadTopicsList();
  loadSettingsForm();
  loadImportExportTab();

  // Tabbed Navigation
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Deactivate all tabs
      tabButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      });
      tabContents.forEach(content => content.classList.remove('active'));

      // Activate clicked tab
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');
      const targetId = button.getAttribute('aria-controls');
      document.getElementById(targetId).classList.add('active');

      // Reload tabs on switch
      if (targetId === 'tabImportExport') {
        loadImportExportTab();
      } else if (targetId === 'tabSources') {
        loadSourcesList();
      }
    });
  });

  // --- SOURCE MANAGEMENT & BULK LIBRARY ---
  const feedForm = document.getElementById('feedForm');
  const feedFormTitle = document.getElementById('feedFormTitle');
  const feedFormIndex = document.getElementById('feedFormIndex');
  const feedFormName = document.getElementById('feedFormName');
  const feedFormUrl = document.getElementById('feedFormUrl');
  const feedFormActive = document.getElementById('feedFormActive');
  const btnCancelFeedEdit = document.getElementById('btnCancelFeedEdit');
  const btnTestFeed = document.getElementById('btnTestFeed');
  const sourcesLibraryContainer = document.getElementById('sourcesLibraryContainer');

  function loadSourcesList() {
    const sources = SettingsManager.getSources();
    const reliability = SettingsManager.getSourceReliability();
    
    // Render Manage sources table
    const listBody = document.getElementById('feedListTableBody');
    listBody.innerHTML = '';
    
    sources.forEach((source, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600;">${source.name}</td>
        <td style="font-family: Courier; font-size: 12px; max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${source.url}</td>
        <td>
          <span class="badge ${source.active ? 'badge-success' : 'badge-danger'}">
            ${source.active ? 'Active' : 'Disabled'}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-outline btn-sm edit-feed-btn" data-index="${index}">Edit</button>
            <button class="btn btn-outline btn-sm toggle-feed-btn" data-index="${index}">
              ${source.active ? 'Disable' : 'Enable'}
            </button>
            <button class="btn btn-danger btn-sm delete-feed-btn" data-index="${index}">Delete</button>
          </div>
        </td>
      `;
      listBody.appendChild(tr);
    });

    // Render Ingestion Statuses & Reliability Metrics table
    const statusBody = document.getElementById('feedStatusTableBody');
    statusBody.innerHTML = '';
    
    sources.forEach(source => {
      const metrics = reliability[source.id] || {
        status: 'Pending',
        reliabilityScore: 100,
        successCount: 0,
        failureCount: 0,
        lastSuccessfulFetch: 0
      };

      const statusText = metrics.status;
      const score = metrics.reliabilityScore;
      const lastCheck = metrics.lastSuccessfulFetch 
        ? new Date(metrics.lastSuccessfulFetch).toLocaleTimeString() 
        : (metrics.lastFailure ? 'Failed (' + new Date(metrics.lastFailure).toLocaleTimeString() + ')' : 'Never');
      
      let badgeClass = 'badge-warning'; // Warning
      if (statusText === 'LIVE') {
        badgeClass = 'badge-success';
      } else if (statusText !== 'Pending') {
        badgeClass = 'badge-danger';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600;">${source.name}</td>
        <td><span class="badge ${badgeClass}">${statusText}</span></td>
        <td><strong>${score}%</strong> <span style="font-size: 11px; color: var(--text-muted);">(${metrics.successCount}/${metrics.successCount + metrics.failureCount})</span></td>
        <td style="color: var(--text-muted); font-size: 13px;">${lastCheck}</td>
      `;
      statusBody.appendChild(tr);
    });

    // Render Default Library Cards
    renderLibraryGrid(sources);
  }

  // Render the Bulk Default Sources Library grid
  function renderLibraryGrid(activeSources) {
    sourcesLibraryContainer.innerHTML = '';
    
    // DEFAULT_SOURCES is defined in settings.js
    DEFAULT_SOURCES.forEach(def => {
      // Check if this source exists in active configurations
      const activeSource = activeSources.find(s => s.id === def.id);
      const isEnabled = activeSource ? activeSource.active : false;
      const avatarClass = `avatar-${def.id}`;
      const initials = def.name.split(' ').map(w => w[0]).join('').substring(0, 2);

      const card = document.createElement('div');
      card.className = 'library-card';
      card.innerHTML = `
        <div class="library-card-info">
          <div class="library-card-avatar ${avatarClass}">${initials}</div>
          <div class="library-card-name">${def.name}</div>
        </div>
        <label class="switch">
          <input type="checkbox" class="library-toggle-cb" data-id="${def.id}" ${isEnabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      `;

      // Event listener for switch toggle
      card.querySelector('.library-toggle-cb').addEventListener('change', (e) => {
        toggleLibrarySource(def, e.target.checked);
      });

      sourcesLibraryContainer.appendChild(card);
    });
  }

  // Toggle enabling/disabling a default feed library source
  function toggleLibrarySource(defaultSource, enable) {
    const sources = SettingsManager.getSources();
    const existingIndex = sources.findIndex(s => s.id === defaultSource.id);

    if (enable) {
      if (existingIndex !== -1) {
        sources[existingIndex].active = true;
      } else {
        // Add fresh default source
        sources.push({ ...defaultSource, active: true });
      }
    } else {
      if (existingIndex !== -1) {
        // Just set active to false to preserve URL details and reliability logs
        sources[existingIndex].active = false;
      }
    }

    SettingsManager.setSources(sources);
    loadSourcesList();
  }

  // Handle feed submissions (Add or Update)
  feedForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const index = parseInt(feedFormIndex.value);
    const sources = SettingsManager.getSources();
    
    const newSource = {
      id: feedFormName.value.toLowerCase().replace(/[^a-z0-9]/g, ''),
      name: feedFormName.value.trim(),
      url: feedFormUrl.value.trim(),
      active: feedFormActive.checked
    };

    if (index === -1) {
      // Check ID uniqueness
      if (sources.some(s => s.id === newSource.id)) {
        alert('A source with a similar name already exists. Please choose a slightly different name.');
        return;
      }
      sources.push(newSource);
    } else {
      // Update existing
      newSource.id = sources[index].id;
      sources[index] = newSource;
    }

    SettingsManager.setSources(sources);
    resetFeedForm();
    loadSourcesList();
  });

  // Handle Edit/Delete/Toggle buttons
  document.getElementById('feedListTableBody').addEventListener('click', (e) => {
    const index = parseInt(e.target.dataset.index);
    if (isNaN(index)) return;

    const sources = SettingsManager.getSources();

    if (e.target.classList.contains('edit-feed-btn')) {
      const source = sources[index];
      feedFormIndex.value = index;
      feedFormName.value = source.name;
      feedFormUrl.value = source.url;
      feedFormActive.checked = source.active;
      
      feedFormTitle.textContent = 'Edit RSS Feed Source';
      btnCancelFeedEdit.style.display = 'inline-flex';
    } else if (e.target.classList.contains('toggle-feed-btn')) {
      sources[index].active = !sources[index].active;
      SettingsManager.setSources(sources);
      loadSourcesList();
    } else if (e.target.classList.contains('delete-feed-btn')) {
      if (confirm(`Are you sure you want to delete feed "${sources[index].name}"?`)) {
        sources.splice(index, 1);
        SettingsManager.setSources(sources);
        loadSourcesList();
      }
    }
  });

  btnCancelFeedEdit.addEventListener('click', resetFeedForm);

  function resetFeedForm() {
    feedFormIndex.value = '-1';
    feedForm.reset();
    feedFormTitle.textContent = 'Add RSS Feed Source';
    btnCancelFeedEdit.style.display = 'none';
    document.getElementById('feedTestConsoleWrapper').style.display = 'none';
  }

  // Live Test Feed Connection using settings rules
  btnTestFeed.addEventListener('click', () => {
    const url = feedFormUrl.value.trim();
    if (!url) {
      alert('Please enter a Feed URL first.');
      return;
    }
    const settings = SettingsManager.getSettings();
    testFeedConnection(url, settings);
  });

  async function testFeedConnection(url, settings) {
    const logConsole = document.getElementById('feedTestConsole');
    const logWrapper = document.getElementById('feedTestConsoleWrapper');
    logWrapper.style.display = 'block';
    logConsole.innerHTML = '';
    
    const printLog = (msg, type = 'info') => {
      const entry = document.createElement('div');
      entry.className = `log-entry ${type}`;
      entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      logConsole.appendChild(entry);
      logConsole.scrollTop = logConsole.scrollHeight;
    };
    
    printLog('Initializing multi-level fallback connection test...');
    
    const fetchMethods = [];

    // Level 1: Cloudflare Worker
    if (settings.cloudflareWorkerUrl && settings.cloudflareWorkerUrl.trim() !== '') {
      fetchMethods.push({
        name: 'Cloudflare Worker',
        url: settings.cloudflareWorkerUrl.trim() + encodeURIComponent(url)
      });
    }

    // Level 2: Custom Proxy
    if (settings.customProxyUrl && settings.customProxyUrl.trim() !== '') {
      fetchMethods.push({
        name: 'Custom Proxy',
        url: settings.customProxyUrl.trim() + encodeURIComponent(url)
      });
    }

    // Level 3: AllOrigins Fallback
    if (settings.useAllOriginsFallback) {
      fetchMethods.push({
        name: 'AllOrigins Fallback',
        url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
      });
    }

    // Level 4: Direct Fetch
    if (settings.useDirectFetchFallback) {
      fetchMethods.push({
        name: 'Direct Fetch',
        url: url
      });
    }

    let parsedSuccess = false;

    for (const method of fetchMethods) {
      printLog(`Attempting route: ${method.name}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), settings.requestTimeout || 15000);
      
      try {
        const start = Date.now();
        const res = await fetch(method.url, { signal: controller.signal });
        const duration = Date.now() - start;
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          throw new Error(`HTTP Error Status ${res.status}`);
        }
        
        printLog(`Response received (${duration}ms) using '${method.name}'. Parsing XML...`, 'success');
        const xml = await res.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        const parseError = doc.querySelector('parsererror');
        
        if (parseError) {
          throw new Error(`XML Parse Error: ${parseError.textContent.substring(0, 100)}`);
        }
        
        const rssItems = doc.querySelectorAll('item');
        const atomEntries = doc.querySelectorAll('entry');
        
        if (rssItems.length > 0) {
          printLog(`Success! Valid RSS 2.0 Feed parsed. Found ${rssItems.length} items.`, 'success');
          const firstTitle = rssItems[0].querySelector('title')?.textContent || 'Untitled';
          printLog(`Sample item title: "${firstTitle}"`);
          parsedSuccess = true;
          break;
        } else if (atomEntries.length > 0) {
          printLog(`Success! Valid Atom Feed parsed. Found ${atomEntries.length} entries.`, 'success');
          const firstTitle = atomEntries[0].querySelector('title')?.textContent || 'Untitled';
          printLog(`Sample entry title: "${firstTitle}"`);
          parsedSuccess = true;
          break;
        } else {
          throw new Error('No items or entries found in XML.');
        }
      } catch (err) {
        clearTimeout(timeoutId);
        printLog(`Route '${method.name}' failed: ${err.message}`, 'error');
      }
    }

    if (parsedSuccess) {
      printLog('Connection test completed successfully.', 'success');
    } else {
      printLog('All routing fallback priority levels failed.', 'error');
    }
  }


  // --- KEYWORD RULES ---
  const keywordForm = document.getElementById('keywordForm');
  const keywordFormInput = document.getElementById('keywordFormInput');
  const keywordFormTier = document.getElementById('keywordFormTier');

  function loadKeywordsList() {
    const keywords = SettingsManager.getAlertKeywords();
    const body = document.getElementById('keywordListTableBody');
    body.innerHTML = '';

    keywords.forEach((kw, index) => {
      let badgeClass = 'badge-info';
      if (kw.tier === 'HIGH') badgeClass = 'badge-danger';
      else if (kw.tier === 'LOW') badgeClass = 'badge-warning';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: Courier; font-weight: 600;">${kw.keyword}</td>
        <td><span class="badge ${badgeClass}">${kw.tier}</span></td>
        <td>
          <button class="btn btn-danger btn-sm delete-keyword-btn" data-index="${index}">Delete</button>
        </td>
      `;
      body.appendChild(tr);
    });
  }

  keywordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const keywordText = keywordFormInput.value.trim().toLowerCase();
    const tier = keywordFormTier.value;
    const keywords = SettingsManager.getAlertKeywords();

    if (keywords.some(k => k.keyword === keywordText)) {
      alert('This keyword rule already exists.');
      return;
    }

    keywords.push({ keyword: keywordText, tier });
    SettingsManager.setAlertKeywords(keywords);
    keywordForm.reset();
    loadKeywordsList();
  });

  document.getElementById('keywordListTableBody').addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-keyword-btn')) {
      const index = parseInt(e.target.dataset.index);
      if (isNaN(index)) return;

      const keywords = SettingsManager.getAlertKeywords();
      if (confirm(`Are you sure you want to delete keyword "${keywords[index].keyword}"?`)) {
        keywords.splice(index, 1);
        SettingsManager.setAlertKeywords(keywords);
        loadKeywordsList();
      }
    }
  });


  // --- TOPIC RULES ---
  const topicForm = document.getElementById('topicForm');
  const topicFormName = document.getElementById('topicFormName');
  const topicFormKeywords = document.getElementById('topicFormKeywords');

  function loadTopicsList() {
    const topics = SettingsManager.getTopics();
    const body = document.getElementById('topicListTableBody');
    body.innerHTML = '';

    topics.forEach((topic, index) => {
      const tags = topic.keywords.map(kw => `<span class="badge badge-info" style="margin-right: 4px; margin-bottom: 4px; display: inline-block;">${kw}</span>`).join('');
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600;">${topic.name}</td>
        <td style="max-width: 500px;">${tags}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-outline btn-sm edit-topic-btn" data-index="${index}">Edit</button>
            <button class="btn btn-danger btn-sm delete-topic-btn" data-index="${index}">Delete</button>
          </div>
        </td>
      `;
      body.appendChild(tr);
    });
  }

  topicForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = topicFormName.value.trim();
    const keywordsRaw = topicFormKeywords.value.split(',');
    const keywords = keywordsRaw.map(k => k.trim().toLowerCase()).filter(k => k !== '');

    const topics = SettingsManager.getTopics();
    const newTopic = { name, keywords };

    const existingIndex = topics.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
    if (existingIndex !== -1) {
      topics[existingIndex] = newTopic;
    } else {
      topics.push(newTopic);
    }

    SettingsManager.setTopics(topics);
    topicForm.reset();
    loadTopicsList();
  });

  document.getElementById('topicListTableBody').addEventListener('click', (e) => {
    const index = parseInt(e.target.dataset.index);
    if (isNaN(index)) return;

    const topics = SettingsManager.getTopics();

    if (e.target.classList.contains('edit-topic-btn')) {
      const topic = topics[index];
      topicFormName.value = topic.name;
      topicFormKeywords.value = topic.keywords.join(', ');
    } else if (e.target.classList.contains('delete-topic-btn')) {
      if (confirm(`Are you sure you want to delete topic "${topics[index].name}"?`)) {
        topics.splice(index, 1);
        SettingsManager.setTopics(topics);
        loadTopicsList();
      }
    }
  });


  // --- SYSTEM SETTINGS & CASCADING FALLBACK PRIORITY ---
  const settingsForm = document.getElementById('settingsForm');
  const settingsRefresh = document.getElementById('settingsRefresh');
  const settingsMaxArticles = document.getElementById('settingsMaxArticles');
  
  // Custom Prioritizations DOM controls
  const settingsFetchMethod = document.getElementById('settingsFetchMethod');
  const settingsTimeout = document.getElementById('settingsTimeout');
  const settingsCloudflareWorker = document.getElementById('settingsCloudflareWorker');
  const settingsCustomProxy = document.getElementById('settingsCustomProxy');
  const settingsAllOriginsFallback = document.getElementById('settingsAllOriginsFallback');
  const settingsDirectFallback = document.getElementById('settingsDirectFallback');

  const settingsSound = document.getElementById('settingsSound');
  const settingsNotifications = document.getElementById('settingsNotifications');
  const btnResetDefaults = document.getElementById('btnResetDefaults');
  const btnClearDB = document.getElementById('btnClearDB');

  function loadSettingsForm() {
    const settings = SettingsManager.getSettings();
    settingsRefresh.value = settings.refreshInterval;
    settingsMaxArticles.value = settings.maxArticles;
    
    settingsFetchMethod.value = settings.preferredFetchMethod || 'allorigins';
    settingsTimeout.value = settings.requestTimeout || 15000;
    settingsCloudflareWorker.value = settings.cloudflareWorkerUrl || '';
    settingsCustomProxy.value = settings.customProxyUrl || '';
    settingsAllOriginsFallback.checked = settings.useAllOriginsFallback !== false;
    settingsDirectFallback.checked = settings.useDirectFetchFallback !== false;

    settingsSound.checked = settings.soundEnabled;
    settingsNotifications.checked = settings.notificationsEnabled;
  }

  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const settings = {
      refreshInterval: parseInt(settingsRefresh.value),
      maxArticles: parseInt(settingsMaxArticles.value),
      preferredFetchMethod: settingsFetchMethod.value,
      requestTimeout: parseInt(settingsTimeout.value),
      cloudflareWorkerUrl: settingsCloudflareWorker.value.trim(),
      customProxyUrl: settingsCustomProxy.value.trim(),
      useAllOriginsFallback: settingsAllOriginsFallback.checked,
      useDirectFetchFallback: settingsDirectFallback.checked,
      soundEnabled: settingsSound.checked,
      notificationsEnabled: settingsNotifications.checked
    };

    if (settings.refreshInterval < 1 || settings.refreshInterval > 60) {
      alert('Refresh Interval must be between 1 and 60 minutes.');
      return;
    }
    if (settings.maxArticles < 100 || settings.maxArticles > 5000) {
      alert('Retention limit must be between 100 and 5000 articles.');
      return;
    }
    if (settings.requestTimeout < 1000 || settings.requestTimeout > 60000) {
      alert('Request timeout must be between 1000ms and 60000ms.');
      return;
    }

    SettingsManager.setSettings(settings);
    alert('System settings and Priority Fetch configurations updated successfully.');
  });

  btnResetDefaults.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset ALL configurations to defaults?')) {
      SettingsManager.resetToDefaults();
      alert('All configurations reset to defaults.');
      window.location.reload();
    }
  });

  btnClearDB.addEventListener('click', async () => {
    if (confirm('WARNING: Are you sure you want to clear the entire local database of saved articles? This action cannot be undone.')) {
      try {
        await clearAllArticles();
        alert('IndexedDB articles cleared successfully.');
      } catch (err) {
        alert(`Error clearing database: ${err.message}`);
      }
    }
  });


  // --- IMPORT / EXPORT CONFIGURATION ---
  const jsonConfigTextarea = document.getElementById('jsonConfigTextarea');
  const btnDownloadConfig = document.getElementById('btnDownloadConfig');
  const btnImportTextareaConfig = document.getElementById('btnImportTextareaConfig');
  const uploadConfigInput = document.getElementById('uploadConfigInput');
  const uploadConfigDropzone = document.getElementById('uploadConfigDropzone');
  const importErrorLog = document.getElementById('importErrorLog');

  function loadImportExportTab() {
    const config = {
      sources: SettingsManager.getSources(),
      topics: SettingsManager.getTopics(),
      keywords: SettingsManager.getAlertKeywords(),
      settings: SettingsManager.getSettings()
    };
    jsonConfigTextarea.value = JSON.stringify(config, null, 2);
  }

  function validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Config must be a JSON object.');
    }
    if (!Array.isArray(config.sources)) {
      throw new Error('Missing "sources" array.');
    }
    config.sources.forEach((s, i) => {
      if (!s.id || !s.name || !s.url) {
        throw new Error(`Source at index ${i} is missing required fields (id, name, url).`);
      }
    });

    if (!Array.isArray(config.topics)) {
      throw new Error('Missing "topics" array.');
    }
    config.topics.forEach((t, i) => {
      if (!t.name || !Array.isArray(t.keywords)) {
        throw new Error(`Topic at index ${i} must have "name" and a "keywords" array.`);
      }
    });

    if (!Array.isArray(config.keywords)) {
      throw new Error('Missing "keywords" array.');
    }
    config.keywords.forEach((k, i) => {
      if (!k.keyword || !k.tier) {
        throw new Error(`Keyword rule at index ${i} must have "keyword" and "tier".`);
      }
    });

    if (!config.settings || typeof config.settings !== 'object') {
      throw new Error('Missing "settings" object.');
    }
  }

  function applyImportedConfig(config) {
    SettingsManager.setSources(config.sources);
    SettingsManager.setTopics(config.topics);
    SettingsManager.setAlertKeywords(config.keywords);
    SettingsManager.setSettings(config.settings);
    
    alert('Configuration loaded successfully.');
    window.location.reload();
  }

  btnImportTextareaConfig.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(jsonConfigTextarea.value);
      validateConfig(parsed);
      applyImportedConfig(parsed);
    } catch (err) {
      alert(`Invalid configuration format: ${err.message}`);
    }
  });

  btnDownloadConfig.addEventListener('click', () => {
    const configStr = jsonConfigTextarea.value;
    const blob = new Blob([configStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cryptodesk-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  uploadConfigDropzone.addEventListener('click', () => {
    uploadConfigInput.click();
  });

  uploadConfigInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      processFile(file);
    }
  });

  uploadConfigDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadConfigDropzone.style.borderColor = 'var(--primary)';
  });

  uploadConfigDropzone.addEventListener('dragleave', () => {
    uploadConfigDropzone.style.borderColor = 'var(--border-color)';
  });

  uploadConfigDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadConfigDropzone.style.borderColor = 'var(--border-color)';
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  });

  function processFile(file) {
    importErrorLog.style.display = 'none';
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        validateConfig(parsed);
        applyImportedConfig(parsed);
      } catch (err) {
        importErrorLog.textContent = `Error importing file: ${err.message}`;
        importErrorLog.style.display = 'block';
      }
    };
    
    reader.onerror = () => {
      importErrorLog.textContent = 'Error reading file.';
      importErrorLog.style.display = 'block';
    };
    
    reader.readAsText(file);
  }
});
