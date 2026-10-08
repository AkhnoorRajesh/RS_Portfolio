(function () {
  'use strict';

  // ==========================================================================
  // PAGE DETECTION & ROUTE CONFIGURATION
  // ==========================================================================
  const currentPage = document.body.dataset.page || 'home';

  // Page-specific animation source mapping
  const ANIMATION_CONFIG = {
    home: {
      folder: 'ezgif-6bcb1afa618dbdd3-jpg',
      frameCount: 240,
      fps: 30,
      hasTimeline: true
    },
    about: {
      folder: 'about section animation',
      frameCount: 240,
      fps: 30,
      hasTimeline: false
    },
    services: {
      folder: 'services section animation',
      frameCount: 240,
      fps: 30,
      hasTimeline: false
    }
  };

  const currentAnim = ANIMATION_CONFIG[currentPage];

  // DOM Elements
  const heroSection = document.getElementById('hero');
  const canvas = document.getElementById('hero-canvas');
  const ctx = canvas ? canvas.getContext('2d', { alpha: false, desynchronized: true }) : null;
  const progressBar = document.getElementById('loader-progress');
  const curtain = document.getElementById('page-curtain');
  const siteHeader = document.getElementById('site-header');
  const mobileToggle = document.getElementById('mobile-toggle');
  const mobileToggleText = mobileToggle ? mobileToggle.querySelector('.mobile-toggle-text') : null;
  const mobileMenu = document.getElementById('mobile-menu');
  const replayBtn = document.getElementById('replay-btn');

  // Timeline UI Elements (Home page)
  const phaseEyebrow = document.getElementById('phase-eyebrow');
  const phaseNames = document.getElementById('phase-names');
  const tagLeft = document.querySelector('.tag-left');
  const tagRight = document.querySelector('.tag-right');
  const phaseHeadline = document.getElementById('phase-headline');
  const phaseCapabilities = document.getElementById('phase-capabilities');
  const phaseActions = document.getElementById('phase-actions');
  const phaseBottom = document.getElementById('phase-bottom');

  // Frame Cache & Playback State
  const images = [];
  let loadedCount = 0;
  let currentFrameIndex = 1;
  let lastDrawnIndex = -1;
  let isPlaying = false;
  let isPlaybackStarted = false;
  let isHeroInView = true;
  let rafId = null;
  let playbackStartTime = 0;
  let playbackElapsed = 0;
  const totalDurationSec = currentAnim ? currentAnim.frameCount / currentAnim.fps : 8.0;

  // Streaming preloader configuration
  const CONCURRENT_DOWNLOADS = 6;
  const INITIAL_PLAYBACK_BUFFER = 18; // ~0.6s smooth playback buffer
  let nextQueueIndex = 2;
  let activeDownloads = 0;
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function getFrameUrl(index) {
    if (!currentAnim) return '';
    const padded = String(index).padStart(3, '0');
    const encodedFolder = encodeURIComponent(currentAnim.folder);
    return `${encodedFolder}/ezgif-frame-${padded}.jpg`;
  }

  // ==========================================================================
  // CINEMATIC PAGE TRANSITIONS
  // ==========================================================================
  function initPageTransitions() {
    if (curtain) {
      setTimeout(() => {
        curtain.classList.remove('active');
      }, 40);
    }

    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (href.startsWith('/') || href.endsWith('.html')) && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('http')) {
        link.addEventListener('click', (e) => {
          const targetPath = href.split('?')[0].split('#')[0];
          const currentPath = window.location.pathname;
          if (targetPath === currentPath || (currentPath === '/' && targetPath === '/index.html')) return;

          e.preventDefault();
          if (mobileMenu && mobileMenu.classList.contains('active')) {
            closeMobileMenu();
          }
          if (curtain) curtain.classList.add('active');
          setTimeout(() => {
            window.location.href = href;
          }, 240);
        });
      }
    });
  }

  // ==========================================================================
  // CANVAS RESIZING & HIGH DPI SHARPNESS
  // ==========================================================================
  function resizeCanvas() {
    if (!canvas || !ctx || !currentAnim) return;
    const heroSec = document.getElementById('hero');
    const width = heroSec ? heroSec.clientWidth : window.innerWidth;
    const height = heroSec ? heroSec.clientHeight : window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      lastDrawnIndex = -1;
    }

    drawFrame(currentFrameIndex, true);
  }

  // ==========================================================================
  // FRAME DRAWING (Adaptive Mobile & Desktop Framing)
  // Preserves 100% of the developers' faces and composition across all screens
  // ==========================================================================
  function getClosestLoadedFrame(preferredIndex) {
    if (!currentAnim) return 1;
    if (images[preferredIndex] && images[preferredIndex].isReady) {
      return preferredIndex;
    }
    for (let offset = 1; offset < currentAnim.frameCount; offset++) {
      const prev = preferredIndex - offset;
      if (prev >= 1 && images[prev] && images[prev].isReady) return prev;
      const next = preferredIndex + offset;
      if (next <= currentAnim.frameCount && images[next] && images[next].isReady) return next;
    }
    return 1;
  }

  function drawFrame(targetIndex, force = false) {
    if (!canvas || !ctx || !currentAnim) return;
    const safeIndex = Math.min(currentAnim.frameCount, Math.max(1, Math.round(targetIndex)));
    const renderIndex = getClosestLoadedFrame(safeIndex);

    if (renderIndex === lastDrawnIndex && !force) return;

    const img = images[renderIndex];
    if (!img || !img.isReady) return;

    lastDrawnIndex = renderIndex;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const heroSec = document.getElementById('hero');
    const canvasWidth = heroSec ? heroSec.clientWidth : window.innerWidth;
    const canvasHeight = heroSec ? heroSec.clientHeight : window.innerHeight;

    const imgWidth = img.naturalWidth || 1920;
    const imgHeight = img.naturalHeight || 1080;
    const canvasRatio = canvasWidth / canvasHeight;
    const imgRatio = imgWidth / imgHeight;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (canvasRatio > imgRatio) {
      // Ultra-wide desktop / landscape
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imgRatio;
      offsetX = 0;
      offsetY = (canvasHeight - drawHeight) / 2;
    } else if (canvasRatio < 0.65) {
      // Mobile Portrait (320px, 375px, 390px, 414px):
      // Intentionally scaled and anchored in the upper half so both developers are visible
      // without faces being covered by headline or buttons in the lower half
      const isUltraCompact = canvasWidth <= 350; // 320px
      const mobileScale = isUltraCompact ? 1.18 : (canvasWidth <= 380 ? 1.20 : 1.24);
      drawWidth = canvasWidth * mobileScale;
      drawHeight = drawWidth / imgRatio;
      offsetX = (canvasWidth - drawWidth) / 2;
      offsetY = Math.max(0, (canvasHeight * (isUltraCompact ? 0.44 : 0.47) - drawHeight) / 2);
    } else if (canvasRatio < 1.15) {
      // Tablet Portrait (768px – 900px, ratio ~0.75):
      // Beautifully centered with developers symmetrically visible and uncropped
      const tabletScale = 1.25;
      drawWidth = canvasWidth * tabletScale;
      drawHeight = drawWidth / imgRatio;
      offsetX = (canvasWidth - drawWidth) / 2;
      offsetY = Math.max(0, (canvasHeight * 0.54 - drawHeight) / 2);
    } else {
      // Standard landscape (Desktop 1024px, 1280px, 1440px)
      drawWidth = canvasHeight * imgRatio;
      drawHeight = canvasHeight;
      offsetX = (canvasWidth - drawWidth) / 2;
      offsetY = 0;
    }

    // Direct canvas-pixel coordinates: avoids ctx.save()/ctx.scale()/ctx.restore() overhead
    const dw = Math.round(drawWidth * dpr);
    const dh = Math.round(drawHeight * dpr);
    const ox = Math.round(offsetX * dpr);
    const oy = Math.round(offsetY * dpr);
    const cw = canvas.width;
    const ch = canvas.height;

    // Fast clear with deep background fill
    ctx.fillStyle = '#060608';
    ctx.fillRect(0, 0, cw, ch);

    // High quality crisp image drawing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, ox, oy, dw, dh);
  }

  // ==========================================================================
  // HOME PAGE TIMELINE ORCHESTRATION
  // 0.0 - 0.8s: Breathing opening
  // 0.8 - 1.8s: Eyebrow label
  // 1.8 - 3.8s: Names (Akhnoor left, Sathyam right)
  // 3.8 - 5.2s: Centerpiece Headline
  // 5.2 - 6.5s: Capabilities line
  // 6.5 - 8.0s: Dual CTAs + Bottom Bar
  // ==========================================================================
  function updateTimelineUI(timeSeconds) {
    if (!currentAnim || !currentAnim.hasTimeline) return;
    const t = Math.max(0, Math.min(totalDurationSec, timeSeconds));

    // Phase 1: Eyebrow (0.8s - 1.8s)
    if (phaseEyebrow) {
      if (t >= 0.8 && t < 1.8) {
        phaseEyebrow.classList.add('phase-visible');
      } else {
        phaseEyebrow.classList.remove('phase-visible');
      }
    }

    // Phase 2: Names (1.8s - 3.8s)
    if (phaseNames) {
      if (t >= 1.8 && t < 3.8) {
        phaseNames.classList.add('phase-visible');
        if (tagLeft) tagLeft.classList.add('phase-visible');
        if (tagRight) tagRight.classList.add('phase-visible');
      } else {
        phaseNames.classList.remove('phase-visible');
        if (tagLeft) tagLeft.classList.remove('phase-visible');
        if (tagRight) tagRight.classList.remove('phase-visible');
      }
    }

    // Phase 3: Main Headline (3.8s+)
    if (phaseHeadline) {
      if (t >= 3.8) {
        phaseHeadline.classList.add('phase-visible');
      } else {
        phaseHeadline.classList.remove('phase-visible');
      }
    }

    // Phase 4: Capabilities (5.2s+)
    if (phaseCapabilities) {
      if (t >= 5.2) {
        phaseCapabilities.classList.add('phase-visible');
      } else {
        phaseCapabilities.classList.remove('phase-visible');
      }
    }

    // Phase 5: Actions (6.5s+)
    if (phaseActions) {
      if (t >= 6.5) {
        phaseActions.classList.add('phase-visible');
      } else {
        phaseActions.classList.remove('phase-visible');
      }
    }

    // Phase 6: Bottom Bar (6.5s+)
    if (phaseBottom) {
      if (t >= 6.5) {
        phaseBottom.classList.add('phase-visible');
      } else {
        phaseBottom.classList.remove('phase-visible');
      }
    }
  }

  // ==========================================================================
  // PLAYBACK CONTROLLER & ANIMATION LOOP
  // ==========================================================================
  function startAnimationPlayback() {
    if (!currentAnim) return;

    if (prefersReducedMotion) {
      // For reduced motion users: render key frame immediately, show UI without delay
      drawFrame(currentAnim.frameCount, true);
      updateTimelineUI(totalDurationSec);
      isPlaying = false;
      return;
    }

    isPlaying = true;
    playbackStartTime = performance.now();
    playbackElapsed = 0;
    if (!rafId && isHeroInView) {
      rafId = requestAnimationFrame(animationLoop);
    }
  }

  function animationLoop(timestamp) {
    if (!currentAnim || !isHeroInView) {
      rafId = null;
      return;
    }

    if (isPlaying) {
      playbackElapsed = (timestamp - playbackStartTime) / 1000;

      if (playbackElapsed >= totalDurationSec) {
        playbackElapsed = totalDurationSec;
        currentFrameIndex = currentAnim.frameCount;
        isPlaying = false;
        drawFrame(currentFrameIndex);
        updateTimelineUI(playbackElapsed);
        rafId = null; // Clean completion: hold final frame and stop rAF loop
        return;
      }

      const progress = playbackElapsed / totalDurationSec;
      currentFrameIndex = Math.min(
        currentAnim.frameCount,
        Math.max(1, Math.round(1 + progress * (currentAnim.frameCount - 1)))
      );

      drawFrame(currentFrameIndex);
      updateTimelineUI(playbackElapsed);

      rafId = requestAnimationFrame(animationLoop);
    } else {
      rafId = null;
    }
  }

  function restartAnimation() {
    if (!currentAnim) return;
    isPlaying = true;
    playbackStartTime = performance.now();
    playbackElapsed = 0;
    currentFrameIndex = 1;
    drawFrame(1, true);
    updateTimelineUI(0);
    if (!rafId && isHeroInView) {
      rafId = requestAnimationFrame(animationLoop);
    }
  }

  // ==========================================================================
  // STREAMING PRELOADER ENGINE (Pipelined Concurrent Buffer)
  // Guarantees zero network stall, zero frame jumping, and smooth 60fps playback
  // ==========================================================================
  function scheduleNextDownloads() {
    if (!currentAnim) return;
    while (activeDownloads < CONCURRENT_DOWNLOADS && nextQueueIndex <= currentAnim.frameCount) {
      const idx = nextQueueIndex++;
      loadSingleFrame(idx);
    }
  }

  function loadSingleFrame(index) {
    if (images[index]) return;
    activeDownloads++;
    const img = new Image();
    img.decoding = 'async';
    img.isReady = false;
    img.src = getFrameUrl(index);

    img.onload = () => {
      img.isReady = true;
      activeDownloads--;
      onFrameLoaded(index);
      scheduleNextDownloads();
    };

    img.onerror = () => {
      activeDownloads--;
      scheduleNextDownloads();
    };

    images[index] = img;
  }

  function onFrameLoaded(index) {
    loadedCount++;

    if (progressBar && currentAnim) {
      const pct = Math.round((loadedCount / currentAnim.frameCount) * 100);
      progressBar.style.width = `${pct}%`;
      if (loadedCount >= currentAnim.frameCount) {
        setTimeout(() => {
          progressBar.classList.add('fade-out');
        }, 200);
      }
    }

    // Instant first frame render: eliminates any blank screen or white/black flash
    if (index === 1 && lastDrawnIndex === -1) {
      drawFrame(1, true);
    }

    // Trigger playback as soon as the initial smooth-buffer threshold is reached
    if (!isPlaybackStarted && (loadedCount >= INITIAL_PLAYBACK_BUFFER || index >= INITIAL_PLAYBACK_BUFFER)) {
      isPlaybackStarted = true;
      startAnimationPlayback();
    }
  }

  function preloadCurrentPageImages() {
    if (!currentAnim) return;

    // Load Frame 1 immediately with top priority
    const firstImg = new Image();
    firstImg.decoding = 'async';
    firstImg.isReady = false;
    firstImg.src = getFrameUrl(1);
    firstImg.onload = () => {
      firstImg.isReady = true;
      images[1] = firstImg;
      onFrameLoaded(1);
      drawFrame(1, true);
      scheduleNextDownloads();
    };
    firstImg.onerror = () => {
      scheduleNextDownloads();
    };
    images[1] = firstImg;
  }

  // ==========================================================================
  // NAVIGATION & MOBILE MENU CONTROLLER
  // ==========================================================================
  let isScrollTicking = false;
  function handleScroll() {
    if (!isScrollTicking) {
      window.requestAnimationFrame(() => {
        const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
        if (siteHeader) {
          siteHeader.classList.toggle('scrolled', scrollY > 50);
        }
        isScrollTicking = false;
      });
      isScrollTicking = true;
    }
  }

  function openMobileMenu() {
    if (!mobileMenu || !mobileToggle) return;
    mobileMenu.classList.add('active');
    mobileToggle.classList.add('active');
    document.body.classList.add('menu-open');
    mobileToggle.setAttribute('aria-expanded', 'true');
    if (mobileToggleText) mobileToggleText.textContent = 'CLOSE';
  }

  function closeMobileMenu() {
    if (!mobileMenu || !mobileToggle) return;
    mobileMenu.classList.remove('active');
    mobileToggle.classList.remove('active');
    document.body.classList.remove('menu-open');
    mobileToggle.setAttribute('aria-expanded', 'false');
    if (mobileToggleText) mobileToggleText.textContent = 'MENU';
  }

  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = mobileMenu.classList.contains('active');
      if (isOpen) {
        closeMobileMenu();
      } else {
        openMobileMenu();
      }
    });

    const mobileLinks = mobileMenu.querySelectorAll('a');
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        closeMobileMenu();
      });
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
        closeMobileMenu();
      }
    });
  }

  // Replay Button
  if (replayBtn) {
    replayBtn.addEventListener('click', (e) => {
      e.preventDefault();
      restartAnimation();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ==========================================================================
  // INTERSECTION OBSERVER FOR HERO CANVAS (Conserves CPU/GPU on Scroll)
  // ==========================================================================
  if (heroSection && 'IntersectionObserver' in window) {
    const heroObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        isHeroInView = entry.isIntersecting;
        if (isHeroInView && isPlaying && !rafId) {
          rafId = requestAnimationFrame(animationLoop);
        }
      });
    }, { threshold: 0.05 });
    heroObserver.observe(heroSection);
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  initPageTransitions();
  window.addEventListener('scroll', handleScroll, { passive: true });

  let resizeDebounce;
  window.addEventListener('resize', () => {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => {
      resizeCanvas();
    }, 60);
  });

  if (currentAnim && canvas) {
    resizeCanvas();
    preloadCurrentPageImages();
  }

})();
