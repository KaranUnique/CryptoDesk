/**
 * CryptoDesk Main Dashboard Controller
 * Manages article rendering, scroll-based pagination, 8-card analytics counters,
 * status filters, layout view modes, dual-view dashboards, and individual source sync triggers.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Global dashboard state
  const state = {
    articles: [],
    filterType: "all", // 'all' | 'unread' | 'read' | 'alerts' | 'new24h'
    activeTopic: null, // string | null
    activeSource: null, // string | null
    searchQuery: "",
    sortBy: "newest", // 'newest' | 'oldest' | 'alerts' | 'source'
    view: "grid", // 'grid' | 'list'

    // Diagnostic filters
    statusFilter: "all", // 'all' | 'LIVE' | 'CORS_BLOCKED' | 'TIMEOUT' | 'PARSE_ERROR' | 'RATE_LIMITED' | 'ERROR'
    reliabilityFilter: "all", // 'all' | 'high' (>=90%) | 'low' (<90%)
    alertTierFilter: "all", // 'all' | 'HIGH' | 'LOW' | 'INFO'

    // Lazy rendering limits
    renderedLimit: 30,
    currentTab: "feed", // 'feed' | 'sources'
  };

  // DOM Elements
  const refreshBtn = document.getElementById("refreshBtn");
  const lastRefreshText = document.getElementById("lastRefreshText");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const viewGridBtn = document.getElementById("viewGridBtn");
  const viewListBtn = document.getElementById("viewListBtn");
  const articlesContainer = document.getElementById("articlesContainer");
  const sidebarTopicsList = document.getElementById("sidebarTopicsList");
  const sidebarSourcesList = document.getElementById("sidebarSourcesList");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const appSidebar = document.getElementById("appSidebar");
  const feedScrollContainer = document.getElementById("feedScrollContainer");

  // Dynamic filter dropdowns
  const statusFilterSelect = document.getElementById("statusFilter");
  const reliabilityFilterSelect = document.getElementById("reliabilityFilter");
  const alertTierFilterSelect = document.getElementById("alertTierFilter");

  // View navigation tabs
  const btnDashFeed = document.getElementById("btnDashFeed");
  const btnDashSources = document.getElementById("btnDashSources");
  const viewFeedContent = document.getElementById("viewFeedContent");
  const viewSourcesContent = document.getElementById("viewSourcesContent");
  const sourcesMonitorContainer = document.getElementById(
    "sourcesMonitorContainer",
  );

  // Stats row indicators (8 Cards)
  const statTotalArticles = document.getElementById("statTotalArticles");
  const statTotalAlerts = document.getElementById("statTotalAlerts");
  const statTotalSources = document.getElementById("statTotalSources");
  const statActiveSources = document.getElementById("statActiveSources");
  const statFailedSources = document.getElementById("statFailedSources");
  const statMostReliable = document.getElementById("statMostReliable");
  const statLeastReliable = document.getElementById("statLeastReliable");
  const statAvgResponse = document.getElementById("statAvgResponse");

  // Sidebar badge indicators
  const countAll = document.getElementById("countAll");
  const countUnread = document.getElementById("countUnread");
  const countRead = document.getElementById("countRead");
  const countAlerts = document.getElementById("countAlerts");
  const countNew24h = document.getElementById("countNew24h");

  // Initialize DB and fetch articles
  try {
    await initDB();
    await loadInitialData();
  } catch (err) {
    console.error("Failed to initialize database:", err);
    articlesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3 class="empty-title">Database Error</h3>
        <p class="empty-text">Failed to open local storage database. Please check your browser privacy/security permissions.</p>
      </div>
    `;
  }

  // Hook up automatic ingestion loop
  RSSEngine.startAutoRefresh();

  // Load and apply View preference
  const savedView = localStorage.getItem("cryptodesk_view_preference");
  if (savedView === "list" || savedView === "grid") {
    state.view = savedView;
    toggleViewButtons(savedView);
  }

  // --- DATA LOADING & SYNC ---
  async function loadInitialData() {
    renderSkeletons();
    state.articles = await getAllArticles();
    refreshUI();
    updateLastSyncText();
  }

  function renderSkeletons() {
    articlesContainer.className =
      state.view === "grid" ? "articles-grid" : "articles-list";
    articlesContainer.innerHTML = Array(6)
      .fill(0)
      .map(() => '<div class="skeleton-card"></div>')
      .join("");
  }

  function refreshUI() {
    // 1. Render lists
    renderSidebarTopics();
    renderSidebarSources();

    // 2. Render view modes
    if (state.currentTab === "feed") {
      filterAndRenderArticles();
    } else {
      renderSourcesMonitorGrid();
    }

    // 3. Update Stats and badges
    updateStatsRow();
    updateSidebarBadges();
  }

  function updateLastSyncText() {
    const reliability = SettingsManager.getSourceReliability();
    let latestTime = 0;
    Object.values(reliability).forEach((stat) => {
      const time = stat.lastSuccessfulFetch || stat.lastFailure || 0;
      if (time > latestTime) {
        latestTime = time;
      }
    });

    if (latestTime > 0) {
      lastRefreshText.textContent = `Last sync: ${new Date(latestTime).toLocaleTimeString()}`;
    } else {
      lastRefreshText.textContent = `Last sync: Never`;
    }
  }

  // --- TAB TOGGLE TRIGGERS ---
  btnDashFeed.addEventListener("click", () => {
    switchDashboardTab("feed");
  });

  btnDashSources.addEventListener("click", () => {
    switchDashboardTab("sources");
  });

  function switchDashboardTab(tab) {
    state.currentTab = tab;
    if (tab === "feed") {
      btnDashFeed.classList.add("active");
      btnDashSources.classList.remove("active");
      btnDashFeed.setAttribute("aria-selected", "true");
      btnDashSources.setAttribute("aria-selected", "false");

      viewFeedContent.classList.add("active");
      viewSourcesContent.classList.remove("active");

      filterAndRenderArticles();
    } else {
      btnDashSources.classList.add("active");
      btnDashFeed.classList.remove("active");
      btnDashSources.setAttribute("aria-selected", "true");
      btnDashFeed.setAttribute("aria-selected", "false");

      viewSourcesContent.classList.add("active");
      viewFeedContent.classList.remove("active");

      renderSourcesMonitorGrid();
    }
  }

  // --- LAZY SCROLLING REGISTRY ---
  feedScrollContainer.addEventListener("scroll", () => {
    const threshold = 120; // threshold proximity to bottom in px
    const isClose =
      feedScrollContainer.scrollHeight -
        feedScrollContainer.scrollTop -
        feedScrollContainer.clientHeight <
      threshold;

    if (isClose) {
      // Calculate active count of in-memory filtered items
      const activeFiltered = getFilteredArticlesList();
      if (state.renderedLimit < activeFiltered.length) {
        state.renderedLimit += 20; // Append chunk
        filterAndRenderArticles(true); // Re-render with expanded limit
      }
    }
  });

  // --- EVENT LISTENERS ---

  // Sidebar toggling (Mobile only)
  sidebarToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    appSidebar.classList.toggle("active");
  });

  document.addEventListener("click", (e) => {
    if (!appSidebar.contains(e.target) && e.target !== sidebarToggle) {
      appSidebar.classList.remove("active");
    }
  });

  // Manual Ingestion trigger
  refreshBtn.addEventListener("click", async () => {
    if (RSSEngine.isSyncing) return;

    refreshBtn.disabled = true;
    const svgIcon = refreshBtn.querySelector("svg");
    svgIcon.classList.add("sync-spinning");
    refreshBtn.querySelector("span").textContent = "Syncing...";

    // Clear feed connections cache first, then run sync
    await RSSEngine.syncAll((sourceId, statusText, isDone) => {
      console.log(`Global Feed Sync [${sourceId}]: ${statusText}`);
      if (state.currentTab === "sources") {
        renderSourcesMonitorGrid(); // Refresh diagnostic metrics live
      }
    });

    // Reset button states
    svgIcon.classList.remove("sync-spinning");
    refreshBtn.disabled = false;
    refreshBtn.querySelector("span").textContent = "Refresh";

    updateLastSyncText();
  });

  // Listener for complete RSS Sync background loop
  window.addEventListener("cryptodesk-sync-complete", async (e) => {
    console.log("Ingestion Sync cycle finished.", e.detail);
    state.articles = await getAllArticles();
    refreshUI();
    updateLastSyncText();
  });

  // Layout View preferences
  viewGridBtn.addEventListener("click", () => changeViewPreference("grid"));
  viewListBtn.addEventListener("click", () => changeViewPreference("list"));

  function changeViewPreference(mode) {
    state.view = mode;
    localStorage.setItem("cryptodesk_view_preference", mode);
    toggleViewButtons(mode);
    filterAndRenderArticles();
  }

  function toggleViewButtons(mode) {
    if (mode === "grid") {
      viewGridBtn.classList.add("active");
      viewListBtn.classList.remove("active");
    } else {
      viewListBtn.classList.add("active");
      viewGridBtn.classList.remove("active");
    }
  }

  // Debounced search
  searchInput.addEventListener(
    "input",
    debounce((e) => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      state.renderedLimit = 30; // Reset lazy limit
      filterAndRenderArticles();
    }, 300),
  );

  // Sorting
  sortSelect.addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    state.renderedLimit = 30; // Reset lazy limit
    filterAndRenderArticles();
  });

  // Status Filter
  statusFilterSelect.addEventListener("change", (e) => {
    state.statusFilter = e.target.value;
    state.renderedLimit = 30;
    filterAndRenderArticles();
  });

  // Reliability Filter
  reliabilityFilterSelect.addEventListener("change", (e) => {
    state.reliabilityFilter = e.target.value;
    state.renderedLimit = 30;
    filterAndRenderArticles();
  });

  // Alert Tier Filter
  alertTierFilterSelect.addEventListener("change", (e) => {
    state.alertTierFilter = e.target.value;
    state.renderedLimit = 30;
    filterAndRenderArticles();
  });

  // Primary sidebar filters click
  document.querySelectorAll("[data-filter]").forEach((item) => {
    item.addEventListener("click", () => {
      document
        .querySelectorAll("[data-filter]")
        .forEach((el) => el.classList.remove("active"));
      item.classList.add("active");

      state.filterType = item.dataset.filter;
      state.activeTopic = null;
      state.activeSource = null;
      state.renderedLimit = 30; // Reset limit

      // Clear active items on dynamic list elements
      clearDynamicListActives();
      filterAndRenderArticles();

      appSidebar.classList.remove("active");
    });
  });

  function clearDynamicListActives() {
    document
      .querySelectorAll(".topic-item")
      .forEach((el) => el.classList.remove("active"));
    document
      .querySelectorAll(".source-item")
      .forEach((el) => el.classList.remove("active"));
  }

  // --- SOURCE-BASED ANALYTICS (8 CARDS) ---

  function updateStatsRow() {
    const total = state.articles.length;
    const alertCount = state.articles.filter((a) => a.isAlert).length;
    const sources = SettingsManager.getSources();
    const activeSources = sources.filter((s) => s.active);
    const reliability = SettingsManager.getSourceReliability();

    const totalSourcesCount = sources.length;
    const activeSourcesCount = activeSources.length;

    // Failed sources: active sources whose last fetch status is not LIVE and not Pending
    let failedCount = 0;
    let totalResponseTime = 0;
    let trackedResponseCount = 0;

    let mostReliableSource = null;
    let leastReliableSource = null;

    activeSources.forEach((src) => {
      const stats = reliability[src.id];
      if (stats) {
        if (
          stats.status !== "LIVE" &&
          stats.status !== "Pending" &&
          stats.status !== "UNKNOWN"
        ) {
          failedCount++;
        }

        if (stats.averageResponseTime > 0) {
          totalResponseTime += stats.averageResponseTime;
          trackedResponseCount++;
        }

        // Track Most Reliable (highest score, tie-breaker: success fetches)
        if (
          !mostReliableSource ||
          stats.reliabilityScore > mostReliableSource.score ||
          (stats.reliabilityScore === mostReliableSource.score &&
            stats.successCount > mostReliableSource.success)
        ) {
          mostReliableSource = {
            name: src.name,
            score: stats.reliabilityScore,
            success: stats.successCount,
          };
        }

        // Track Least Reliable (lowest score, only if fetches occurred)
        if (stats.successCount + stats.failureCount > 0) {
          if (
            !leastReliableSource ||
            stats.reliabilityScore < leastReliableSource.score
          ) {
            leastReliableSource = {
              name: src.name,
              score: stats.reliabilityScore,
            };
          }
        }
      }
    });

    const avgResponseTime =
      trackedResponseCount > 0
        ? Math.round(totalResponseTime / trackedResponseCount)
        : 0;

    // Write to UI (with null checks for potentially hidden elements)
    if (statTotalArticles) statTotalArticles.textContent = total;
    if (statTotalAlerts) statTotalAlerts.textContent = alertCount;
    if (statTotalSources) statTotalSources.textContent = totalSourcesCount;
    if (statActiveSources) statActiveSources.textContent = activeSourcesCount;
    if (statFailedSources) statFailedSources.textContent = failedCount;

    if (statMostReliable)
      statMostReliable.textContent = mostReliableSource
        ? `${mostReliableSource.name} (${mostReliableSource.score}%)`
        : "N/A";
    if (statLeastReliable)
      statLeastReliable.textContent = leastReliableSource
        ? `${leastReliableSource.name} (${leastReliableSource.score}%)`
        : "N/A";
    if (statAvgResponse)
      statAvgResponse.textContent =
        avgResponseTime > 0 ? `${avgResponseTime}ms` : "0ms";
  }

  function updateSidebarBadges() {
    const total = state.articles.length;
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const unread = state.articles.filter((a) => !a.isRead).length;
    const read = total - unread;
    const alertCount = state.articles.filter((a) => a.isAlert).length;
    const newCount = state.articles.filter(
      (a) => a.publishedAt >= oneDayAgo,
    ).length;

    countAll.textContent = total;
    countUnread.textContent = unread;
    countRead.textContent = read;
    countAlerts.textContent = alertCount;
    countNew24h.textContent = newCount;
  }

  // --- DYNAMIC SIDEBAR LIST RENDERING ---

  function renderSidebarTopics() {
    const topics = SettingsManager.getTopics();
    sidebarTopicsList.innerHTML = "";

    const topicCounts = {};
    state.articles.forEach((art) => {
      if (art.topicMatches && Array.isArray(art.topicMatches)) {
        art.topicMatches.forEach((tName) => {
          topicCounts[tName] = (topicCounts[tName] || 0) + 1;
        });
      }
    });

    topics.forEach((topic) => {
      const count = topicCounts[topic.name] || 0;
      const li = document.createElement("li");
      li.className = `sidebar-item topic-item ${state.activeTopic === topic.name ? "active" : ""}`;
      li.tabIndex = 0;

      li.innerHTML = `
        <span class="sidebar-item-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10h10V2zM12 12H2v10h10V12zM22 2h-10v10h10V2zM22 12h-10v10h10V12z"></path></svg>
          ${topic.name}
        </span>
        <span class="sidebar-item-badge">${count}</span>
      `;

      li.addEventListener("click", () => {
        document
          .querySelectorAll("[data-filter]")
          .forEach((el) => el.classList.remove("active"));
        clearDynamicListActives();

        state.filterType = "all";
        state.activeSource = null;
        state.renderedLimit = 30; // Reset

        if (state.activeTopic === topic.name) {
          state.activeTopic = null;
          document.querySelector('[data-filter="all"]').classList.add("active");
        } else {
          state.activeTopic = topic.name;
          li.classList.add("active");
        }

        // Switch back to Articles Feed tab if in Sources Monitor
        if (state.currentTab !== "feed") {
          switchDashboardTab("feed");
        } else {
          filterAndRenderArticles();
        }
        appSidebar.classList.remove("active");
      });

      sidebarTopicsList.appendChild(li);
    });
  }

  function renderSidebarSources() {
    const sources = SettingsManager.getSources().filter((s) => s.active);
    const reliability = SettingsManager.getSourceReliability();
    sidebarSourcesList.innerHTML = "";

    const sourceCounts = {};
    state.articles.forEach((art) => {
      if (art.sourceId) {
        sourceCounts[art.sourceId] = (sourceCounts[art.sourceId] || 0) + 1;
      }
    });

    sources.forEach((source) => {
      const count = sourceCounts[source.id] || 0;
      const stats = reliability[source.id] || { status: "Pending" };

      let statusClass = "";
      if (stats.status === "LIVE") {
        statusClass = "ok";
      } else if (stats.status !== "Pending" && stats.status !== "UNKNOWN") {
        statusClass = "error";
      }

      const li = document.createElement("li");
      li.className = `sidebar-item source-item ${state.activeSource === source.id ? "active" : ""}`;
      li.tabIndex = 0;

      li.innerHTML = `
        <span class="sidebar-item-label">
          <span class="source-status ${statusClass}" title="Status: ${stats.status}"></span>
          ${source.name}
        </span>
        <span class="sidebar-item-badge">${count}</span>
      `;

      li.addEventListener("click", () => {
        document
          .querySelectorAll("[data-filter]")
          .forEach((el) => el.classList.remove("active"));
        clearDynamicListActives();

        state.filterType = "all";
        state.activeTopic = null;
        state.renderedLimit = 30; // Reset

        if (state.activeSource === source.id) {
          state.activeSource = null;
          document.querySelector('[data-filter="all"]').classList.add("active");
        } else {
          state.activeSource = source.id;
          li.classList.add("active");
        }

        // Switch back to Feed tab if in Sources Monitor
        if (state.currentTab !== "feed") {
          switchDashboardTab("feed");
        } else {
          filterAndRenderArticles();
        }
        appSidebar.classList.remove("active");
      });

      sidebarSourcesList.appendChild(li);
    });
  }

  // --- ARTICLE FILTERING & RENDERING (With Lazy Loading Limit) ---

  // Helper to retrieve the sorted & filtered list matching search/categories
  function getFilteredArticlesList() {
    let filtered = [...state.articles];
    const reliability = SettingsManager.getSourceReliability();

    // 1. Sidebar Primary Filters
    if (state.filterType === "unread") {
      filtered = filtered.filter((a) => !a.isRead);
    } else if (state.filterType === "read") {
      filtered = filtered.filter((a) => a.isRead);
    } else if (state.filterType === "alerts") {
      filtered = filtered.filter((a) => a.isAlert);
    } else if (state.filterType === "new24h") {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      filtered = filtered.filter((a) => a.publishedAt >= oneDayAgo);
    }

    // 2. Sidebar Topic Filter
    if (state.activeTopic) {
      filtered = filtered.filter(
        (a) => a.topicMatches && a.topicMatches.includes(state.activeTopic),
      );
    }

    // 3. Sidebar Source Filter
    if (state.activeSource) {
      filtered = filtered.filter((a) => a.sourceId === state.activeSource);
    }

    // 4. Diagnostic Status Filter (Enhancement)
    if (state.statusFilter !== "all") {
      filtered = filtered.filter((a) => {
        const stats = reliability[a.sourceId];
        const status = stats ? stats.status : "Pending";
        if (state.statusFilter === "ERROR") {
          return (
            status !== "LIVE" && status !== "Pending" && status !== "UNKNOWN"
          );
        }
        return status === state.statusFilter;
      });
    }

    // 5. Reliability Filter (Enhancement)
    if (state.reliabilityFilter !== "all") {
      filtered = filtered.filter((a) => {
        const stats = reliability[a.sourceId];
        const score = stats ? stats.reliabilityScore : 100;
        return state.reliabilityFilter === "high" ? score >= 90 : score < 90;
      });
    }

    // 6. Alert Tier Filter (Enhancement)
    if (state.alertTierFilter !== "all") {
      filtered = filtered.filter((a) => a.alertTier === state.alertTierFilter);
    }

    // 7. Toolbar Text Search
    if (state.searchQuery) {
      filtered = filtered.filter((a) => {
        const title = (a.title || "").toLowerCase();
        const desc = (a.description || "").toLowerCase();
        return (
          title.includes(state.searchQuery) || desc.includes(state.searchQuery)
        );
      });
    }

    // 8. Toolbar Sorting
    const tierWeights = {
      HIGH: 3,
      LOW: 2,
      INFO: 1,
      NONE: 0,
      undefined: 0,
      null: 0,
    };

    if (state.sortBy === "newest") {
      filtered.sort((a, b) => b.publishedAt - a.publishedAt);
    } else if (state.sortBy === "oldest") {
      filtered.sort((a, b) => a.publishedAt - b.publishedAt);
    } else if (state.sortBy === "alerts") {
      filtered.sort((a, b) => {
        const weightA = tierWeights[a.alertTier] || 0;
        const weightB = tierWeights[b.alertTier] || 0;
        if (weightA !== weightB) {
          return weightB - weightA;
        }
        return b.publishedAt - a.publishedAt;
      });
    } else if (state.sortBy === "source") {
      filtered.sort((a, b) => {
        const sourceA = (a.source || "").toLowerCase();
        const sourceB = (b.source || "").toLowerCase();
        if (sourceA < sourceB) return -1;
        if (sourceA > sourceB) return 1;
        return b.publishedAt - a.publishedAt;
      });
    }

    return filtered;
  }

  function filterAndRenderArticles(isScrolling = false) {
    const filtered = getFilteredArticlesList();

    if (filtered.length === 0) {
      articlesContainer.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">📂</div>
          <h3 class="empty-title">No Articles Found</h3>
          <p class="empty-text">No headlines match the chosen filters or search constraints.</p>
        </div>
      `;
      return;
    }

    // Apply lazy limit slice
    const sliced = filtered.slice(0, state.renderedLimit);
    articlesContainer.innerHTML = sliced
      .map((art) => renderArticleCard(art))
      .join("");

    // Attach click events to rendered cards
    attachArticleCardEvents();
  }

  function renderArticleCard(art) {
    const unreadClass = art.isRead ? "" : "unread";
    const timeText = formatTimeAgo(art.publishedAt);

    // Color highlight border dynamically per source
    const sourceClass = `source-${art.sourceId}`;

    // Alert badge
    let alertBadgeHTML = "";
    if (art.isAlert && art.alertTier) {
      alertBadgeHTML = `<span class="alert-badge ${art.alertTier.toLowerCase()}">${art.alertTier}</span>`;
    }

    // Topics list
    let topicsHTML = "";
    if (art.topicMatches && art.topicMatches.length > 0) {
      topicsHTML =
        `<div class="article-tags">` +
        art.topicMatches
          .map((t) => `<span class="topic-tag">${t}</span>`)
          .join("") +
        `</div>`;
    }

    const readToggleTooltip = art.isRead ? "Mark as Unread" : "Mark as Read";

    if (state.view === "grid") {
      return `
        <article class="article-card ${unreadClass} ${sourceClass}" data-id="${art.id}" tabindex="0" aria-label="Article: ${art.title}">
          <div class="article-header">
            <div class="article-source-meta">
              <span class="article-source-tag">${art.source}</span>
              ${alertBadgeHTML}
            </div>
            <span class="article-time">${timeText}</span>
          </div>
          <h2 class="article-title">${art.title}</h2>
          <p class="article-desc">${art.description || "No description preview available."}</p>
          <div class="article-footer">
            ${topicsHTML}
            <div class="article-actions">
              <button class="action-icon btn-toggle-read" title="${readToggleTooltip}" aria-label="${readToggleTooltip}">
                ${art.isRead ? "Mark Unread" : "Mark Read"}
              </button>
              <a href="${art.link}" target="_blank" class="action-icon link-open" title="Open source in new tab" aria-label="Open source article">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </a>
            </div>
          </div>
        </article>
      `;
    } else {
      // List View layout
      return `
        <article class="article-card ${unreadClass} ${sourceClass}" data-id="${art.id}" tabindex="0" aria-label="Article: ${art.title}">
          <div class="article-left">
            <div class="article-header">
              <div class="article-source-meta">
                <span class="article-source-tag" style="margin-right: 8px;">${art.source}</span>
                ${alertBadgeHTML}
              </div>
              <span class="article-time">${timeText}</span>
            </div>
            <h2 class="article-title">${art.title}</h2>
            <p class="article-desc">${art.description || "No description preview available."}</p>
          </div>
          <div class="article-right">
            ${topicsHTML}
            <div class="article-actions">
              <button class="action-icon btn-toggle-read" title="${readToggleTooltip}" style="font-size: 12px; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px;">
                ${art.isRead ? "Unread" : "Read"}
              </button>
              <a href="${art.link}" target="_blank" class="action-icon link-open" title="Open source in new tab">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </a>
            </div>
          </div>
        </article>
      `;
    }
  }

  function attachArticleCardEvents() {
    const cards = document.querySelectorAll(".article-card");

    cards.forEach((card) => {
      const id = card.dataset.id;

      card.addEventListener("click", async (e) => {
        if (
          e.target.closest(".btn-toggle-read") ||
          e.target.closest(".link-open")
        ) {
          return;
        }

        // Mark read on click
        const article = state.articles.find((a) => a.id === id);
        if (article && !article.isRead) {
          await updateReadStatus(id, true);
          article.isRead = true;
          refreshUI();
        }

        window.open(article.link, "_blank");
      });

      // Toggle read state button
      const toggleBtn = card.querySelector(".btn-toggle-read");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const article = state.articles.find((a) => a.id === id);
          if (article) {
            const newState = !article.isRead;
            await updateReadStatus(id, newState);
            article.isRead = newState;
            refreshUI();
          }
        });
      }

      // External link click marks as read
      const openLink = card.querySelector(".link-open");
      if (openLink) {
        openLink.addEventListener("click", async () => {
          const article = state.articles.find((a) => a.id === id);
          if (article && !article.isRead) {
            await updateReadStatus(id, true);
            article.isRead = true;
            refreshUI();
          }
        });
      }
    });
  }

  // --- SOURCE MONITOR DASHBOARD VIEW (Enhancement) ---

  function renderSourcesMonitorGrid() {
    sourcesMonitorContainer.innerHTML = "";
    const sources = SettingsManager.getSources().filter((s) => s.active);
    const reliability = SettingsManager.getSourceReliability();

    // Map source IDs to total articles currently cached in DB
    const articleCounts = {};
    state.articles.forEach((art) => {
      if (art.sourceId) {
        articleCounts[art.sourceId] = (articleCounts[art.sourceId] || 0) + 1;
      }
    });

    sources.forEach((source) => {
      const stats = reliability[source.id] || {
        status: "Pending",
        successCount: 0,
        failureCount: 0,
        reliabilityScore: 100,
        averageResponseTime: 0,
        lastSuccessfulFetch: 0,
        lastFailure: 0,
        errorMessage: "",
      };

      const count = articleCounts[source.id] || 0;
      const initials = source.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .substring(0, 2);
      const avatarClass = `avatar-${source.id}`;

      let badgeClass = "warning";
      if (stats.status === "LIVE") {
        badgeClass = "live";
      } else if (stats.status !== "Pending" && stats.status !== "UNKNOWN") {
        badgeClass = "error";
      }

      const successTimeText = stats.lastSuccessfulFetch
        ? formatTimeAgo(stats.lastSuccessfulFetch)
        : "Never";
      const failTimeText = stats.lastFailure
        ? formatTimeAgo(stats.lastFailure)
        : "Never";

      const card = document.createElement("div");
      card.className = "source-monitor-card";

      card.innerHTML = `
        <div class="source-card-header">
          <div class="source-card-title-section">
            <div class="source-avatar-icon ${avatarClass}">${initials}</div>
            <div class="source-card-name">${source.name}</div>
          </div>
          <span class="health-status-badge ${badgeClass}">${stats.status}</span>
        </div>
        
        <table class="source-details-table">
          <tr>
            <td class="label">Reliability</td>
            <td class="value">${stats.reliabilityScore}%</td>
          </tr>
          <tr>
            <td class="label">Cached Articles</td>
            <td class="value">${count}</td>
          </tr>
          <tr>
            <td class="label">Response Time</td>
            <td class="value">${stats.averageResponseTime > 0 ? stats.averageResponseTime + "ms" : "0ms"}</td>
          </tr>
          <tr>
            <td class="label">Fetch Ratio</td>
            <td class="value">${stats.successCount} / ${stats.successCount + stats.failureCount}</td>
          </tr>
          <tr>
            <td class="label">Last Success</td>
            <td class="value">${successTimeText}</td>
          </tr>
        </table>
        
        ${stats.errorMessage ? `<div class="source-error-desc" title="${stats.errorMessage}"><strong>Reason:</strong> ${stats.errorMessage}</div>` : ""}
        
        <div style="margin-top: auto; display: flex; justify-content: flex-end;">
          <button class="btn btn-outline btn-sm btn-sync-single" data-id="${source.id}" style="width: 100%;">
            <svg class="sync-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: middle;">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
            <span>Sync Source</span>
          </button>
        </div>
      `;

      // Event listener for source-specific refresh click
      const syncBtn = card.querySelector(".btn-sync-single");
      syncBtn.addEventListener("click", async () => {
        syncBtn.disabled = true;
        const icon = syncBtn.querySelector(".sync-icon");
        icon.classList.add("sync-spinning");
        syncBtn.querySelector("span").textContent = "Syncing...";

        await RSSEngine.syncSingle(source.id);

        // Refresh databases and UI
        state.articles = await getAllArticles();
        refreshUI();
        updateLastSyncText();
      });

      sourcesMonitorContainer.appendChild(card);
    });
  }

  // --- HELPERS ---

  function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return "Never";
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Register Service Worker for PWA
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then((reg) => {
          console.log("ServiceWorker scope: ", reg.scope);
        })
        .catch((err) => {
          console.error("ServiceWorker failed: ", err);
        });
    });
  }
});
