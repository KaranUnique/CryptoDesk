/**
 * CryptoDesk Notification & Audio Synthesizer Engine
 * Uses the Notification API and Web Audio API for custom sound alerts.
 */

const NotificationManager = {
  audioCtx: null,

  /**
   * Initializes or resumes the Web Audio context.
   * Browsers require a user interaction to unlock audio.
   */
  initAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(err => console.error('AudioContext resume failed:', err));
    }
  },

  /**
   * Helper to play a sine wave beep.
   * @param {number} frequency - in Hz
   * @param {number} duration - in seconds
   * @param {number} startTime - relative to AudioContext.currentTime
   */
  beep(frequency, duration, startTime) {
    if (!this.audioCtx) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = frequency;
      
      // Prevent click sounds by ramping gain down smoothly
      gainNode.gain.setValueAtTime(0.12, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      
      osc.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {
      console.warn('Oscillator build failed:', e);
    }
  },

  /**
   * Synthesizes notification sounds depending on alert tier.
   * @param {string} tier 
   */
  playSound(tier) {
    const settings = SettingsManager.getSettings();
    if (!settings.soundEnabled) return;

    try {
      this.initAudio();
      
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;

      if (tier === 'HIGH') {
        // Double tone (HIGH): two rapid high-pitched notes
        this.beep(880, 0.08, now);     // A5 note
        this.beep(880, 0.12, now + 0.12); // Repeat A5 slightly longer
      } else if (tier === 'LOW') {
        // Single tone (LOW): one medium-pitched note
        this.beep(587.33, 0.15, now);  // D5 note
      }
      // INFO is silent
    } catch (e) {
      console.error('Web Audio playback failed:', e);
    }
  },

  /**
   * Requests permission to display notifications.
   */
  requestPermission() {
    const settings = SettingsManager.getSettings();
    if (settings.notificationsEnabled && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          console.log('Desktop notification permission:', permission);
        });
      }
    }
  },

  /**
   * Triggers a desktop notification for a specific article.
   * @param {Object} article 
   */
  notify(article) {
    const settings = SettingsManager.getSettings();
    if (!settings.notificationsEnabled) return;

    if ('Notification' in window && Notification.permission === 'granted') {
      const title = `Alert [${article.alertTier}] from ${article.source}`;
      const options = {
        body: article.title,
        tag: article.id,
        requireInteraction: article.alertTier === 'HIGH' // Remain visible on screen for high-tier alerts
      };

      try {
        const notification = new Notification(title, options);
        notification.onclick = () => {
          window.open(article.link, '_blank');
          notification.close();
        };
      } catch (err) {
        console.warn('System notifications failed, falling back to Service Worker...', err);
        // Fallback for some browsers in PWA mode
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, options);
          });
        }
      }
    }
  },

  /**
   * Handles batching of newly ingested alerts.
   * Sends separate desktop notifications and plays the audio alert once.
   * @param {Array<Object>} alerts 
   */
  handleNewAlerts(alerts) {
    const tierPriority = {
      'HIGH': 3,
      'LOW': 2,
      'INFO': 1,
      'NONE': 0
    };

    let highestTier = 'NONE';

    alerts.forEach(art => {
      // Trigger notification
      this.notify(art);

      // Track highest alert tier for single synthesized sound
      if (tierPriority[art.alertTier] > tierPriority[highestTier]) {
        highestTier = art.alertTier;
      }
    });

    if (highestTier !== 'NONE') {
      this.playSound(highestTier);
    }
  }
};

// Hook up event listener to auto-initialize AudioContext on user gesture
const unlockAudioHandler = () => {
  NotificationManager.initAudio();
  document.removeEventListener('click', unlockAudioHandler);
  document.removeEventListener('keydown', unlockAudioHandler);
};
document.addEventListener('click', unlockAudioHandler);
document.addEventListener('keydown', unlockAudioHandler);
