(function () {
  const ua = navigator.userAgent.toLowerCase()
  let os = 'macos'
  if (ua.includes('win')) os = 'windows'
  else if (ua.includes('linux')) os = 'linux'

  const osLabel = { macos: 'macOS', linux: 'Linux', windows: 'Windows' }
  const ctaOs = document.getElementById('cta-os')
  if (ctaOs) ctaOs.textContent = osLabel[os]

  document.querySelectorAll('.download-card').forEach(function (card) {
    if (card.dataset.os === os) card.classList.add('highlighted')
  })

  const themes = ['system', 'light', 'dark']
  const themeIcons = {
    system: '<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1v12A6 6 0 1 1 8 2z"/>',
    light: '<circle cx="8" cy="8" r="3"/><path d="M8 0v2m0 12v2m8-8h-2M2 8H0m13.66-5.66L12.24 3.76M3.76 12.24l-1.42 1.42m0-11.32 1.42 1.42m8.48 8.48 1.42 1.42" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    dark: '<path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792 0 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278z"/>'
  }
  const themeLabels = { system: 'System', light: 'Light', dark: 'Dark' }
  let current = localStorage.getItem('arandu-site-theme') || 'system'

  const toggle = document.getElementById('theme-toggle')
  const toggleIcon = toggle ? toggle.querySelector('svg') : null

  function applyTheme (theme) {
    current = theme
    localStorage.setItem('arandu-site-theme', theme)
    document.documentElement.classList.remove('light', 'dark')
    if (theme !== 'system') document.documentElement.classList.add(theme)
    if (toggleIcon) toggleIcon.innerHTML = themeIcons[theme]
    if (toggle) toggle.title = 'Theme: ' + themeLabels[theme]
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      const idx = themes.indexOf(current)
      applyTheme(themes[(idx + 1) % themes.length])
    })
  }

  applyTheme(current)

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        observer.unobserve(entry.target)
      }
    })
  }, { threshold: 0.1 })

  document.querySelectorAll('.fade-in').forEach(function (el) {
    observer.observe(el)
  })

  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      const target = document.querySelector(a.getAttribute('href'))
      if (target) {
        e.preventDefault()
        target.scrollIntoView({ behavior: 'smooth' })
      }
    })
  })

  const outlineItems = document.querySelectorAll('.mockup-outline-item[data-target]')
  const mockupContent = document.querySelector('.mockup-content.markdown-body')

  if (outlineItems.length && mockupContent) {
    outlineItems.forEach(function (item) {
      item.addEventListener('click', function () {
        const target = document.getElementById(item.dataset.target)
        if (!target) return
        mockupContent.scrollTo({ top: target.offsetTop - mockupContent.offsetTop, behavior: 'smooth' })
        outlineItems.forEach(function (el) { el.classList.remove('active') })
        item.classList.add('active')
      })
    })

    mockupContent.addEventListener('scroll', function () {
      const headings = mockupContent.querySelectorAll('h1[id], h2[id]')
      const scrollTop = mockupContent.scrollTop
      let active = headings[0]
      headings.forEach(function (h) {
        if (h.offsetTop - mockupContent.offsetTop <= scrollTop + 10) active = h
      })
      if (active) {
        outlineItems.forEach(function (el) {
          el.classList.toggle('active', el.dataset.target === active.id)
        })
      }
    })
  }
  // Accordion for docs section
  document.querySelectorAll('.docs-item-header').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.docs-item')
      var isOpen = item.classList.contains('open')
      document.querySelectorAll('.docs-item').forEach(function (el) { el.classList.remove('open') })
      if (!isOpen) item.classList.add('open')
    })
  })

  // Install copy buttons
  document.querySelectorAll('.install-copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cmd = btn.closest('.install-option').querySelector('.install-cmd').textContent
      navigator.clipboard.writeText(cmd).then(function () {
        btn.classList.add('copied')
        setTimeout(function () { btn.classList.remove('copied') }, 1500)
      })
    })
  })

  // Fetch latest release and update download links
  fetch('https://api.github.com/repos/devitools/arandu/releases/latest')
    .then(function (r) { return r.json() })
    .then(function (release) {
      var assets = release.assets || []
      var map = {}
      assets.forEach(function (asset) {
        var name = asset.name.toLowerCase()
        var url = asset.browser_download_url
        if (name.includes('aarch64') && name.endsWith('.dmg')) map['macos-arm'] = url
        else if (name.includes('x64') && name.endsWith('.dmg')) map['macos-intel'] = url
        else if (name.endsWith('.appimage')) map['linux-appimage'] = url
        else if (name.endsWith('.deb')) map['linux-deb'] = url
        else if (name.endsWith('.exe')) map['windows-exe'] = url
      })
      Object.keys(map).forEach(function (key) {
        document.querySelectorAll('[data-asset="' + key + '"]').forEach(function (el) {
          el.href = map[key]
        })
      })
      // Update CTA button to direct download based on OS
      var ctaBtn = document.getElementById('cta-download')
      if (ctaBtn) {
        var assetKey = os === 'macos' ? 'macos-arm' : (os === 'linux' ? 'linux-appimage' : 'windows-exe')
        if (map[assetKey]) ctaBtn.href = map[assetKey]
      }
    })
    .catch(function () { /* silently fall back to releases page */ })
})()
