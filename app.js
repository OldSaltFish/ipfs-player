(() => {
  'use strict';

  const CONF = window.PLAYER_CONFIG || {};
  const DEFAULT_REF = CONF.playlistCid || '';
  const FETCH_TIMEOUT = 12000;
  const REPEAT_LABELS = ['顺序', '列表循环', '单曲循环'];
  const gateways = (CONF.gateways && CONF.gateways.length ? CONF.gateways : ['https://ipfs.io/ipfs/'])
    .map((g) => (g.endsWith('/') ? g : g + '/'));

  const $ = (id) => document.getElementById(id);
  const el = {
    status: $('status'), sourceInput: $('source-input'), sourceLoad: $('source-load'),
    playlistTitle: $('playlist-title'), playlistMeta: $('playlist-meta'),
    trackList: $('track-list'), kicker: $('kicker'),
    cover: $('cover'), coverFallback: $('cover-fallback'),
    trackTitle: $('track-title'), trackArtist: $('track-artist'), trackAlbum: $('track-album'),
    trackNote: $('track-note'),
    seek: $('seek'), timeNow: $('time-now'), timeTotal: $('time-total'),
    prev: $('prev'), toggle: $('toggle'), next: $('next'),
    repeat: $('repeat'), volume: $('volume'), download: $('download'),
    downloadMenu: $('download-menu'), selectAll: $('select-all'), downloadSelectedBtn: $('download-selected'),
    pipLyrics: $('pip-lyrics'),
    brand: document.querySelector('.brand'), extras: document.querySelector('.extras'),
    pickMode: $('pick-mode'), pickBar: $('pick-bar'), pickDone: $('pick-done'),
    streamRow: $('stream-row'),
    lyrics: $('lyrics'), follow: $('follow'),
    copyCid: $('copy-cid'),
    audio: $('audio'),
    drawer: $('drawer'), drawerToggle: $('drawer-toggle'), drawerClose: $('drawer-close'),
    scrim: $('scrim'),
    volumeBtn: $('volume-btn'), volumeValue: $('volume-value'),
    volumePopup: $('volume-popup'), volumeReadout: $('volume-readout'),
  };

  const state = {
    sourceRef: null, tracks: [], index: -1, repeat: 0, wantPlay: false, seeking: false,
    lyrics: [], lyricIndex: -1, lyricsToken: 0, coverToken: 0, follow: true,
    audioRef: null, audioTrack: null, audioAttempt: 0, currentAudioUrl: '', savedTime: 0,
    scrollGuardUntil: 0, loading: false, downloading: false,
    listTouchedUntil: 0, picks: new Set(), coverUrl: '',
  };

  function setStatus(text, kind) {
    el.status.textContent = text;
    el.status.className = 'status' + (kind ? ' ' + kind : '');
    el.status.hidden = !(kind && text);
  }

  function setProgress(percent) {
    el.seek.style.setProperty('--p', Math.max(0, Math.min(100, percent)) + '%');
  }

  function audioHost() {
    try { return new URL(state.currentAudioUrl).host; } catch { return '网关'; }
  }

  function setBuffered() {
    const a = el.audio, d = a.duration, b = a.buffered;
    const pct = Number.isFinite(d) && d > 0 && b.length
      ? Math.min(100, b.end(b.length - 1) / d * 100) : 0;
    el.seek.style.setProperty('--buffered', pct + '%');
  }

  function fmtTime(sec) {
    const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // 日文/德文等非英文标题附中文说明：原文（中文），英文标题保持原样
  function displayTitle(t, fallback) {
    const base = t.title || t.filename || fallback || '';
    return t.titleZh ? base + '（' + t.titleZh + '）' : base;
  }

  function displayArtist(t) {
    const base = t.artist || '';
    return t.artistZh ? base + '（' + t.artistZh + '）' : base;
  }

  function gatewayHost(gw) {
    try { return new URL(gw).host; } catch { return gw; }
  }

  function refLabel(ref) {
    return ref ? (ref.cid || '本地文件') : '未配置';
  }

  function safeUrl(u) {
    try { return new URL(u, location.href).href; } catch { return u; }
  }

  // ===== 在线收听平台跳转 / B站内嵌 =====
  const mqTouch = window.matchMedia('(hover: none) and (pointer: coarse)');
  const STREAM_META = [
    { key: 'bili', label: 'B站', icon: `<path fill="currentColor" stroke="none" d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z"/>` },
    { key: 'spotify', label: 'Spotify', icon: `<path fill="currentColor" stroke="none" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>` },
    { key: 'apple', label: '苹果音乐', icon: `<path fill="currentColor" stroke="none" d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z"/>` },
    { key: 'netease', label: '网易云', icon: `<path fill="currentColor" stroke="none" d="M13.046 9.388a3.919 3.919 0 0 0-.66.19c-.809.312-1.447.991-1.666 1.775a2.269 2.269 0 0 0-.074.81c.048.546.333 1.05.764 1.35a1.483 1.483 0 0 0 2.01-.286c.406-.531.355-1.183.24-1.636-.098-.387-.22-.816-.345-1.249a64.76 64.76 0 0 1-.269-.954zm-.82 10.07c-3.984 0-7.224-3.24-7.224-7.223 0-.98.226-3.02 1.884-4.822A7.188 7.188 0 0 1 9.502 5.6a.792.792 0 1 1 .587 1.472 5.619 5.619 0 0 0-2.795 2.462 5.538 5.538 0 0 0-.707 2.7 5.645 5.645 0 0 0 5.638 5.638c1.844 0 3.627-.953 4.542-2.428 1.042-1.68.772-3.931-.627-5.238a3.299 3.299 0 0 0-1.437-.777c.172.589.334 1.18.494 1.772.284 1.12.1 2.181-.519 2.989-.39.51-.956.888-1.592 1.064a3.038 3.038 0 0 1-2.58-.44 3.45 3.45 0 0 1-1.44-2.514c-.04-.467.002-.93.128-1.376.35-1.256 1.356-2.339 2.622-2.826a5.5 5.5 0 0 1 .823-.246l-.134-.505c-.37-1.371.25-2.579 1.547-3.007.329-.109.68-.145 1.025-.105.792.09 1.476.592 1.709 1.023.258.507-.096 1.153-.706 1.153a.788.788 0 0 1-.54-.213c-.088-.08-.163-.174-.259-.247a.825.825 0 0 0-.632-.166.807.807 0 0 0-.634.551c-.056.191-.031.406.02.595.07.256.159.597.217.82 1.11.098 2.162.54 2.97 1.296 1.974 1.844 2.35 4.886.892 7.233-1.197 1.93-3.509 3.177-5.889 3.177zM0 12c0 6.627 5.373 12 12 12s12-5.373 12-12S18.627 0 12 0 0 5.373 0 12Z"/>` },
    { key: 'kuwo', label: '酷我', icon: `img:img/kuwo.png` },
    { key: 'qq', label: 'QQ音乐', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M33.235 8.5c-3.736 3.173-8.608 4.076-15.715.507l9.44 10.012c4.308 4.307 4.257 8.173 4.5 12.103c.266 4.296-1.537 6.736-4.067 7.805c-3.655 1.544-9.574-.164-11.681-3.526c-1.748-2.787-1.001-7.727 1.621-10.045c4.699-4.153 10.14-3.406 13.84 2.063"/></svg>` },
    { key: 'kugou', label: '酷狗', icon: `img:img/kugou.png` },
  ];

  function buildStreamUrl(key, s, mobile) {
    const kw = encodeURIComponent(s.search || '');
    switch (key) {
      case 'bili': return 'https://www.bilibili.com/video/' + s.id;
      case 'netease': return 'https://music.163.com/#/song?id=' + s.id;
      case 'kuwo': return 'https://www.kuwo.cn/play_detail/' + s.id;
      case 'qq': return s.id
        ? 'https://y.qq.com/n/ryqq/songDetail/' + s.id
        : 'https://y.qq.com/n/ryqq/search?w=' + kw;
      case 'kugou': return s.code
        ? 'https://www.kugou.com/mixsong/' + s.code + '.html'
        : (mobile
          ? 'https://m.kugou.com/html/search.html?keyword=' + kw
          : 'https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=' + kw);
      case 'apple': return 'https://music.apple.com/cn/search?term=' + kw;
      case 'spotify': return 'https://open.spotify.com/search/' + kw;
      default: return '';
    }
  }

  // 已知歌曲深链的 App scheme（酷狗/酷我无公开歌曲深链不做唤端）
  // 网易云: PC 客户端吃 base64 JSON 命令(实测); 手机 App 认路径格式
  const NETEASE_SCHEME = (id, mobile) => mobile
    ? 'orpheus://song?id=' + id
    : 'orpheus://' + btoa('{"type":"song","id":"' + id + '","cmd":"play"}');
  const APP_LINK = {
    bili: { scheme: (s) => 'bilibili://video/' + s.id, pkg: 'tv.danmaku.bili', intent: true },
    netease: { scheme: (s) => NETEASE_SCHEME(s.id, mqTouch.matches), pkg: 'com.netease.cloudmusic', intent: false },
    qq: { scheme: (s) => 'qqmusic://qq.com/ui/openSongPageDetail?songmid=' + s.id, pkg: 'com.tencent.qqmusic', intent: false },
  };

  // 移动端唤端: 安卓 intent:// 自带网页兜底(仅结构简单的 scheme); 其余 scheme 失败后定时回退网页
  // 回退以"页面是否切走"为准: App 一旦打开(页面 hidden)立即取消; 浏览器弹选择框期间不误伤
  function openMobileStream(key, s, webUrl) {
    const app = APP_LINK[key];
    if (!app) { location.href = webUrl; return; }
    const schemeUrl = app.scheme(s);
    if (app.intent && /android/i.test(navigator.userAgent)) {
      const proto = schemeUrl.split('://')[0];
      const rest = schemeUrl.slice(proto.length + 3);
      const fb = 'S.browser_fallback_url=' + encodeURIComponent(webUrl);
      location.href = 'intent://' + rest + '#Intent;scheme=' + proto + ';package=' + app.pkg + ';' + fb + ';end';
      return;
    }
    let woke = false;
    const onHide = () => { if (document.hidden) woke = true; };
    document.addEventListener('visibilitychange', onHide);
    const timer = setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide);
      if (!woke && !document.hidden) location.href = webUrl;
    }, 3000);
    window.addEventListener('pagehide', () => {
      document.removeEventListener('visibilitychange', onHide);
      clearTimeout(timer);
    }, { once: true });
    location.href = schemeUrl;
  }

  // 桌面客户端注册的系统协议（网易云音乐/QQ音乐 PC 端公开支持；酷我/酷狗唤起后停在首页）
  function openDesktopStream(key, s, webUrl) {
    const schemes = {
      // 官方 PC 客户端协议: orpheus:// + base64(JSON 命令)，实测可直接播放歌曲
      netease: () => 'orpheus://' + btoa('{"type":"song","id":"' + s.id + '","cmd":"play"}'),
      qq: () => s.id ? 'qqmusic://qq.com/ui/openSongPageDetail?songmid=' + s.id : null,
      kuwo: () => 'com.kuwo.kwmusic.kwmusicForKwsing://',
      kugou: () => 'kugouURL://',
    };
    const mk = schemes[key];
    if (!mk) { window.open(webUrl, '_blank', 'noopener'); return; }
    const schemeUrl = mk(s);
    if (!schemeUrl) { window.open(webUrl, '_blank', 'noopener'); return; }
    // 浏览器弹"打开客户端"确认框会触发 blur；没发生过 blur 说明协议未注册或被取消 → 回退网页
    let blurred = false;
    const onBlur = () => { blurred = true; };
    window.addEventListener('blur', onBlur, { once: true });
    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      if (!blurred && document.hasFocus()) window.open(webUrl, '_blank', 'noopener');
    }, 2500);
    location.href = schemeUrl;
  }

  function handleStreamClick(key, t) {
    const s = t.stream && t.stream[key];
    if (!s) return;
    const url = buildStreamUrl(key, s, mqTouch.matches);
    if (!url) return;
    if (mqTouch.matches) openMobileStream(key, s, url);
    else openDesktopStream(key, s, url);
  }

  // cid 字段也允许直接写 http(s) URL 或站点内绝对路径，便于本地预览
  function parseRef(value) {
    const v = String(value || '').trim();
    if (!v) return null;
    const raw = v.startsWith('ipfs://') ? v.slice(7) : v;
    if (/^https?:\/\//i.test(raw) || /^\.{0,2}\//.test(raw)) return { url: safeUrl(raw) };
    return { cid: raw.replace(/^\/+/, '') };
  }

  function urlOf(gw, cid, filename) {
    return gw + cid + (filename ? '?filename=' + encodeURIComponent(filename) : '');
  }

  function assetUrl(ref, attempt) {
    return ref.url ? ref.url : urlOf(gateways[attempt % gateways.length], ref.cid);
  }

  function setThumb(img, ref) {
    if (!ref) { img.hidden = true; return; }
    if (ref.url) { img.src = ref.url; return; }
    let attempt = 0;
    img.onerror = () => {
      if (attempt + 1 >= gateways.length) { img.hidden = true; return; }
      attempt++;
      img.src = assetUrl(ref, attempt);
    };
    img.src = assetUrl(ref, 0);
  }

  function prefer(gw) {
    const i = gateways.indexOf(gw);
    if (i > 0) gateways.unshift(gateways.splice(i, 1)[0]);
    el.playlistMeta.textContent = '网关 ' + gatewayHost(gw);
  }

  function noteGateway(url) {
    const gw = gateways.find((g) => url.startsWith(g));
    if (gw) prefer(gw);
  }

  // 并发请求所有网关，取第一个真正能跨域取回内容的，其余立即取消
  async function fetchRef(ref, filename) {
    if (ref.url) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
      try {
        const res = await fetch(ref.url, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return { text: await res.text(), gateway: '本地数据源' };
      } finally { clearTimeout(timer); }
    }
    const controllers = [];
    const tasks = gateways.map((gw) => (async () => {
      const ctrl = new AbortController();
      controllers.push(ctrl);
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
      try {
        const res = await fetch(urlOf(gw, ref.cid, filename), { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return { text: await res.text(), gateway: gw };
      } finally { clearTimeout(timer); }
    })());
    try {
      return await Promise.any(tasks);
    } catch {
      throw new Error(gateways.length + ' 个网关均不可用或拒绝跨域访问');
    } finally {
      controllers.forEach((c) => c.abort());
    }
  }

  function resetFollow() {
    state.follow = true;
    el.follow.hidden = true;
  }

  function pauseFollow(ev) {
    if (!state.follow) return;
    if (ev && ev.type === 'wheel' && Math.abs(ev.deltaY) < 4) return;
    if (ev && ev.type !== 'pointerdown' && performance.now() < state.scrollGuardUntil) return;
    state.follow = false;
    el.follow.hidden = false;
  }

  function scrollToCurrent(smooth) {
    const node = el.lyrics.children[state.lyricIndex];
    if (!node) return;
    if (smooth) state.scrollGuardUntil = performance.now() + 1200;
    el.lyrics.scrollTo({
      top: node.offsetTop - el.lyrics.clientHeight / 2 + node.offsetHeight / 2,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }

  function setFollow() {
    resetFollow();
    scrollToCurrent(true);
  }

  async function loadPlaylist(ref) {
    state.sourceRef = ref;
    state.tracks = [];
    state.index = -1;
    state.lyricsToken++;
    state.lyrics = [];
    state.lyricIndex = -1;
    resetFollow();
    el.audio.pause();
    el.audio.removeAttribute('src');
    el.audio.load();
    el.trackList.replaceChildren();
    el.lyrics.replaceChildren();
    el.playlistTitle.textContent = '';
    el.playlistMeta.textContent = '';
    setStatus('正在从 IPFS 载入歌单…', 'loading');

    try {
      const { text, gateway } = await fetchRef(ref);
      const data = JSON.parse(text);
      if (!Array.isArray(data.tracks) || !data.tracks.length) throw new Error('歌单中没有曲目');
      if (gateway !== '本地数据源') prefer(gateway);
      state.tracks = data.tracks;
      renderPlaylist(data);
      const raw = Number(new URLSearchParams(location.search).get('i'));
      const start = Number.isFinite(raw) && raw > 0
        ? Math.min(Math.floor(raw), data.tracks.length - 1) : 0;
      selectTrack(start, false);
      setStatus('', '');
    } catch (e) {
      setStatus('歌单加载失败：' + e.message, 'error');
    }
  }

  function syncPicks() {
    el.trackList.querySelectorAll('.pick').forEach((p, i) => {
      p.setAttribute('aria-checked', String(state.picks.has(i)));
    });
  }

  function syncSelectAll() {
    const all = state.tracks.length > 0 && state.picks.size === state.tracks.length;
    el.selectAll.textContent = all ? '全不选' : '全选';
  }

  function renderPlaylist(data) {
    el.playlistTitle.textContent = data.title || '播放列表';
    document.title = (data.title || '播放列表') + ' - IPFS 云端播放器';
    el.playlistMeta.textContent = [data.updated || '', data.tracks.length + ' 首']
      .filter(Boolean).join(' / ');

    const frag = document.createDocumentFragment();
    data.tracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'track';
      const pick = document.createElement('span');
      pick.className = 'pick';
      pick.setAttribute('role', 'checkbox');
      pick.tabIndex = 0;
      pick.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (state.picks.has(i)) state.picks.delete(i); else state.picks.add(i);
        syncPicks();
        syncSelectAll();
      });
      pick.addEventListener('keydown', (ev) => {
        if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); pick.click(); }
      });
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      const img = document.createElement('img');
      img.className = 'track-thumb';
      img.alt = '';
      img.loading = 'lazy';
      thumb.append(img);
      setThumb(img, parseRef(t.coverCid || t.cover || t.coverUrl));
      const body = document.createElement('div');
      body.className = 'track-body';
      const name = document.createElement('div');
      name.className = 'track-name';
      name.textContent = displayTitle(t, '曲目 ' + (i + 1));
      const sub = document.createElement('div');
      sub.className = 'track-sub';
      sub.textContent = [displayArtist(t), t.note, t.album].filter(Boolean).join(' / ');
      body.append(name, sub);
      const time = document.createElement('span');
      time.className = 'track-time';
      time.textContent = t.duration ? fmtTime(t.duration) : '--:--';
      li.append(pick, thumb, body, time);
      li.addEventListener('click', () => selectTrack(i, true));
      frag.append(li);
    });
    el.trackList.append(frag);
    state.picks.clear();
    setPickMode(false);
    syncPicks();
    syncSelectAll();


  }

  function revealActiveTrack() {
    if (el.drawer.hidden) return;
    if (performance.now() < state.listTouchedUntil) return;
    const li = el.trackList.children[state.index];
    const box = el.trackList;
    if (!li) return;
    const r = li.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top >= b.top && r.bottom <= b.bottom) return;
    box.scrollTo({
      top: box.scrollTop + (r.top - b.top) - (b.height - r.height) / 2,
      behavior: 'smooth',
    });
  }

  function syncTrackUrl() {
    try {
      const u = new URL(location.href);
      if (state.index >= 0) u.searchParams.set('i', String(state.index));
      else u.searchParams.delete('i');
      history.replaceState(null, '', u.href);
    } catch { /* file:// 下不允许改写地址，忽略 */ }
  }

  // 在线收听入口: 桌面=图标行; 手机=单按钮开底部弹层(图标网格)
  function buildStreamBtn(meta, t) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stream-btn';
    btn.dataset.key = meta.key;
    btn.title = meta.label;
    btn.setAttribute('aria-label', meta.label + '在线收听');
    if (meta.icon.startsWith('img:')) {
      const img = document.createElement('img');
      img.className = 'stream-img';
      img.src = meta.icon.slice(4);
      img.alt = '';
      img.loading = 'lazy';
      btn.append(img);
    } else if (meta.icon.startsWith('<svg')) {
      btn.innerHTML = meta.icon;
    } else {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('class', 'line-ico');
      svg.innerHTML = meta.icon;
      btn.append(svg);
    }
    btn.addEventListener('click', () => handleStreamClick(meta.key, t));
    return btn;
  }

  function renderStreamRow(t) {
    el.streamRow.replaceChildren();
    if (!t || !t.stream || !Object.keys(t.stream).length) {
      el.streamRow.hidden = true;
      return;
    }
    el.streamRow.hidden = false;
    if (mqNarrow.matches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stream-btn';
      btn.title = '在线收听';
      btn.setAttribute('aria-label', '在线收听平台');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('class', 'line-ico');
      svg.innerHTML = '<path d="M4 14a8 8 0 0 1 16 0"/><rect x="3" y="13.5" width="4" height="6.5" rx="1.5"/><rect x="17" y="13.5" width="4" height="6.5" rx="1.5"/>';
      btn.append(svg);
      btn.addEventListener('click', () => openStreamSheet(t));
      el.streamRow.append(btn);
    } else {
      STREAM_META.forEach((meta) => {
        if (!t.stream[meta.key]) return;
        el.streamRow.append(buildStreamBtn(meta, t));
      });
    }
  }

  function openStreamSheet(t) {
    const grid = document.getElementById('stream-sheet-grid');
    grid.replaceChildren();
    STREAM_META.forEach((meta) => {
      if (!t.stream[meta.key]) return;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'stream-cell';
      cell.dataset.key = meta.key;
      cell.title = meta.label + '在线收听';
      const icon = buildStreamBtn(meta, t).firstChild;
      if (icon) cell.append(icon);
      const lab = document.createElement('span');
      lab.textContent = meta.label;
      cell.append(lab);
      cell.addEventListener('click', () => {
        closeStreamSheet();
        handleStreamClick(meta.key, t);
      });
      grid.append(cell);
    });
    // 锚定在触发按钮旁: 贴按钮正下方、右对齐, 手指不用挪远
    const pop = document.getElementById('stream-sheet');
    const anchor = el.streamRow.firstElementChild;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      pop.style.top = Math.round(r.bottom + 8) + 'px';
      pop.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
    }
    pop.hidden = false;
    el.scrim.hidden = false;
  }

  function closeStreamSheet() {
    document.getElementById('stream-sheet').hidden = true;
    if (el.drawer.hidden) el.scrim.hidden = true;
  }

  function selectTrack(i, autoplay) {
    if (!state.tracks.length) return;
    const n = state.tracks.length;
    state.index = ((i % n) + n) % n;
    syncTrackUrl();
    const t = state.tracks[state.index];

    resetFollow();
    Array.from(el.trackList.children).forEach((li, k) => li.classList.toggle('active', k === state.index));
    revealActiveTrack();
    el.kicker.textContent ='NOW PLAYING  ' + String(state.index + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0');
    el.trackTitle.textContent = displayTitle(t, '未命名曲目');
    el.trackArtist.textContent = displayArtist(t) || '未知艺术家';
    if (el.trackNote) el.trackNote.textContent = t.note || '';
    el.trackAlbum.textContent = t.album || '';
    el.timeNow.textContent = '0:00';
    el.timeTotal.textContent = t.duration ? fmtTime(t.duration) : '0:00';
    el.seek.value = '0';
    setProgress(0);
    state.savedTime = 0;
    state.wantPlay = Boolean(autoplay);
    state.loading = false;

    loadCover(t);
    loadLyrics(t);
    setAudio(t);
    renderStreamRow(t);
  }

  function loadCover(t) {
    const token = ++state.coverToken;
    const ref = parseRef(t.coverCid || t.cover || t.coverUrl);
    el.cover.onload = null;
    el.cover.onerror = null;
    el.cover.removeAttribute('src');
    el.cover.hidden = true;
    el.coverFallback.hidden = false;
    el.coverFallback.textContent = '暂无封面';
    if (!ref) return;
    let attempt = 0;
    const apply = () => {
      const url = assetUrl(ref, attempt);
      el.cover.onload = () => {
        if (token !== state.coverToken) return;
        noteGateway(url);
        el.cover.hidden = false;
        el.coverFallback.hidden = true;
      };
      el.cover.onerror = () => {
        if (token !== state.coverToken) return;
        if (ref.url || attempt + 1 >= gateways.length) {
          el.coverFallback.textContent = '封面不可用';
          return;
        }
        attempt++;
        apply();
      };
      el.cover.src = url;
    state.coverUrl = url;
    if (state.audioTrack) updateMediaSession(state.audioTrack);
    };
    apply();
  }

  function parseLrc(text) {
    const rows = [];
    const timeRe = /\[(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
    let offset = 0;
    for (const raw of String(text).split(/\r?\n/)) {
      const off = raw.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
      if (off) { offset = Number(off[1]) / 1000; continue; }
      const marks = Array.from(raw.matchAll(timeRe));
      if (!marks.length) continue;
      const content = raw.replace(timeRe, '').trim();
      for (const m of marks) {
        const sec = Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number('0.' + m[3]) : 0);
        rows.push({ time: Math.max(0, sec + offset), text: content });
      }
    }
    // 双语歌词里原文与译文紧邻且时间戳完全相同，合并成一条（text 原文 / sub 译文），
    // 否则会被拆成两条独立歌词，同一时刻只有其中一条能被高亮
    const lines = [];
    for (const row of rows) {
      const last = lines[lines.length - 1];
      if (last && last.time === row.time && !last.sub && row.text && row.text !== last.text) {
        last.sub = row.text;
        continue;
      }
      lines.push({ time: row.time, text: row.text, sub: '' });
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  async function loadLyrics(t) {
    const token = ++state.lyricsToken;
    const ref = parseRef(t.lyricsCid || t.lyrics || t.lyricsUrl);
    el.lyrics.replaceChildren();
    state.lyrics = [];
    state.lyricIndex = -1;
    if (!ref) return;
    try {
      const { text, gateway } = await fetchRef(ref);
      if (token !== state.lyricsToken) return;
      state.lyrics = parseLrc(text);
      const frag = document.createDocumentFragment();
      state.lyrics.forEach((line) => {
        const p = document.createElement('p');
        p.className = 'lyric-line';
        const words = document.createElement('span');
        words.className = 'lyric-text';
        words.textContent = line.text || ' ';
        p.append(words);
        if (line.sub) {
          const sub = document.createElement('span');
          sub.className = 'lyric-sub';
          sub.textContent = line.sub;
          p.append(sub);
        }
        const stamp = document.createElement('span');
        stamp.className = 'lyric-time';
        stamp.setAttribute('aria-hidden', 'true');
        stamp.textContent = fmtTime(line.time);
        p.append(stamp);
        p.addEventListener('click', () => {
          setFollow();
          seekTo(line.time);
          if (el.audio.paused) playSafely();
        });
        frag.append(p);
      });
      el.lyrics.append(frag);
      el.lyrics.scrollTop = 0;
      resetFollow();
      syncLyrics(el.audio.currentTime || 0);
      if (!state.lyrics.length) setStatus('歌词为空', 'warn');
    } catch (e) {
      if (token !== state.lyricsToken) return;
      setStatus('歌词加载失败：' + e.message, 'error');
    }
  }

  function syncLyrics(time) {
    if (!state.lyrics.length) return;
    let i = 0;
    while (i + 1 < state.lyrics.length && state.lyrics[i + 1].time <= time) i++;
    if (i === state.lyricIndex) return;
    const nodes = el.lyrics.children;
    if (state.lyricIndex >= 0 && nodes[state.lyricIndex]) nodes[state.lyricIndex].classList.remove('active');
    state.lyricIndex = i;
    const node = nodes[i];
    if (!node) return;
    node.classList.add('active');
    if (state.follow) scrollToCurrent(true);
    pipUpdate();
  }

  function setAudio(t) {
    state.audioRef = parseRef(t.cid || t.url || t.src);
    state.audioTrack = t;
    state.audioAttempt = 0;
    if (!state.audioRef) { setStatus('该曲目缺少音频 CID', 'error'); return; }
    applyAudio();
    updateMediaSession(t);
    pipUpdate();
  }

  function applyAudio() {
    const ref = state.audioRef;
    const t = state.audioTrack;
    if (!ref || !t) return;
    const url = ref.url ? ref.url : urlOf(gateways[state.audioAttempt % gateways.length], ref.cid, t.filename);
    state.currentAudioUrl = url;
    el.audio.src = url;
    el.audio.load();
    el.seek.style.setProperty('--buffered', '0%');
    if (state.wantPlay) playSafely();
  }

  function playSafely() {
    state.loading = true;
    setStatus('正在从 ' + audioHost() + ' 缓冲音频…', 'warn');
    updateToggle();
    const p = el.audio.play();
    if (p && p.catch) p.catch(() => {
      state.loading = false;
      updateToggle();
      setStatus('浏览器阻止了自动播放，请点播放按钮', 'warn');
    });
  }

  function saveBlob(blob, name) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }

  async function fetchAssetBytes(ref) {
    if (!ref) throw new Error('缺少资源 CID');
    const urls = ref.url ? [ref.url] : gateways.map((gw, i) => assetUrl(ref, i));
    let lastErr;
    for (const url of urls) {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
        return new Uint8Array(await res.arrayBuffer());
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('所有网关均不可用');
  }

  function trackFiles(t) {
    const base = (t.filename || 'track').replace(/\.mp3$/, '');
    return [
      { ref: parseRef(t.cid || t.url || t.src), name: t.filename || 'audio.mp3' },
      { ref: parseRef(t.coverCid || t.cover || t.coverUrl), name: base + '.jpg' },
      { ref: parseRef(t.lyricsCid || t.lyrics || t.lyricsUrl), name: base + '.lrc' },
    ];
  }

  async function buildAndSave(tracks, zipName, label) {
    let ok = 0, fail = 0, done = 0;
    const total = tracks.length * 3;
    async function* entries() {
      for (const t of tracks) {
        for (const f of trackFiles(t)) {
          done++;
          setStatus('正在打包 ' + label + ' [' + done + '/' + total + '] ' + f.name + '…', 'warn');
          if (!f.ref) { fail++; continue; }
          try {
            yield { name: f.name, data: await fetchAssetBytes(f.ref) };
            ok++;
          } catch (e) { fail++; }
        }
      }
    }
    const blob = await window.buildZip(entries());
    saveBlob(blob, zipName);
    return { ok, fail };
  }

  async function downloadMp3() {
    if (state.downloading) return;
    const t = state.audioTrack;
    const ref = t ? parseRef(t.cid || t.url || t.src) : null;
    if (!ref) { setStatus('当前曲目缺少音频 CID', 'warn'); return; }
    const name = t.filename || 'audio.mp3';
    state.downloading = true;
    setStatus('正在下载 ' + name + '…', 'warn');
    try {
      const bytes = await fetchAssetBytes(ref);
      saveBlob(new Blob([bytes], { type: 'audio/mpeg' }), name);
      setStatus('', '');
    } catch (e) {
      setStatus('下载失败：' + e.message, 'error');
    } finally {
      state.downloading = false;
    }
  }

  async function downloadBundle() {
    if (state.downloading) return;
    const t = state.audioTrack;
    if (!t) return;
    state.downloading = true;
    const zipName = (t.filename || 'track').replace(/\.mp3$/, '') + '.zip';
    setStatus('正在打包 ' + zipName + '（音频 + 封面 + 歌词）…', 'warn');
    try {
      const { ok, fail } = await buildAndSave([t], zipName, '当前曲目');
      setStatus('已下载 ' + zipName + '（' + ok + '/3 项' + (fail ? '，失败 ' + fail + ' 项' : '') + '）', fail ? 'warn' : '');
    } catch (e) {
      setStatus('下载失败：' + e.message, 'error');
    } finally {
      state.downloading = false;
    }
  }

  async function downloadSelected() {
    if (state.downloading) return;
    const list = state.tracks.filter((_, i) => state.picks.has(i));
    if (!list.length) { setStatus('请先在列表里勾选要下载的曲目', 'warn'); return; }
    state.downloading = true;
    const title = (el.playlistTitle.textContent || 'playlist').replace(/[\\/:*?"<>|]/g, '').trim();
    const suffix = list.length === state.tracks.length ? '' : ' 选中' + list.length + '首';
    const zipName = title + suffix + '.zip';
    setStatus('正在打包 ' + list.length + ' 首（音频 + 封面 + 歌词）…', 'warn');
    try {
      const { ok, fail } = await buildAndSave(list, zipName, '所选曲目');
      setStatus('已打包 ' + list.length + ' 首 / ' + ok + ' 个文件' + (fail ? '，失败 ' + fail + ' 个' : ''), fail ? 'warn' : '');
    } catch (e) {
      setStatus('批量下载失败：' + e.message, 'error');
    } finally {
      state.downloading = false;
    }
  }

  let pipWindow = null;
  let canvasPip = null;

  const PIP_CSS = `
    :root { --ink: #f0ece3; --ink-3: #605e58; --accent: #d9634a;
      --serif: "Noto Serif SC", "Songti SC", Georgia, serif; --mono: Consolas, monospace; }
    html, body { margin: 0; height: 100%; }
    body {
      position: relative; display: flex; flex-direction: column; justify-content: center; gap: 4px;
      padding: 22px 18px 12px; box-sizing: border-box; overflow: hidden;
      background: rgba(14, 15, 17, .88); color: var(--ink);
      font-family: var(--serif); user-select: none; -webkit-user-select: none;
    }
    .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cur { font-size: 25px; line-height: 1.35; border-left: 3px solid var(--accent); padding-left: 10px; }
    .next { font-size: 14px; color: var(--ink-3); padding-left: 13px; padding-right: 96px; }
    .title { position: absolute; top: 6px; left: 18px; right: 18px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
      font: 10px/1.4 var(--mono); letter-spacing: .1em; color: var(--ink-3); }
    .ctrls { position: absolute; right: 10px; bottom: 6px; display: flex; gap: 6px;
      opacity: 0; transition: opacity .18s ease; }
    body:hover .ctrls { opacity: 1; }
    .ctrls button { width: 26px; height: 26px; padding: 0; display: grid; place-items: center;
      border-radius: 50%; border: 1px solid rgba(240, 236, 227, .22);
      background: rgba(21, 22, 25, .92); color: #9c988e; cursor: pointer; }
    .ctrls button:hover { color: #d9634a; border-color: #d9634a; }
    .ctrls svg { width: 13px; height: 13px; fill: none; stroke: currentColor;
      stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
  `;

  function pipPayload() {
    const t = state.audioTrack;
    const lines = state.lyrics;
    const i = state.lyricIndex;
    const cur = i >= 0 ? lines[i] : null;
    return {
      title: t ? [displayTitle(t), displayArtist(t)].filter(Boolean).join(' / ') : '',
      cur: (cur && cur.text) || (lines.length ? '' : '暂无歌词'),
      // 有译文时浮窗第二行显示译文，否则显示下一句
      next: (cur && cur.sub) || (i >= 0 && lines[i + 1] && lines[i + 1].text) || '',
    };
  }

  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const bind = (action, fn) => {
      try { ms.setActionHandler(action, fn); } catch (e) { /* 该动作不支持时忽略 */ }
    };
    bind('play', () => { if (el.audio.paused) el.toggle.click(); });
    bind('pause', () => { if (!el.audio.paused) el.toggle.click(); });
    bind('previoustrack', () => selectTrack(state.index - 1, true));
    bind('nexttrack', () => selectTrack(state.index + 1, true));
    bind('seekbackward', () => { setFollow(); seekTo(el.audio.currentTime - 10); });
    bind('seekforward', () => { setFollow(); seekTo(el.audio.currentTime + 10); });
    el.audio.addEventListener('play', () => { ms.playbackState = 'playing'; });
    el.audio.addEventListener('pause', () => { ms.playbackState = 'paused'; });
    ms.playbackState = 'paused';
  }

  function updateMediaSession(t) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined' || !t) return;
    const meta = {
      title: displayTitle(t, '未知曲目'),
      artist: displayArtist(t) || '',
      album: t.album || '',
    };
    const cover = state.coverUrl;
    if (cover) meta.artwork = [{ src: cover, sizes: '512x512', type: 'image/jpeg' }];
    navigator.mediaSession.metadata = new MediaMetadata(meta);
  }

  function pipUpdate() {
    const p = pipPayload();
    if (pipWindow && !pipWindow.closed) {
      const doc = pipWindow.document;
      const curEl = doc.getElementById('pip-cur');
      if (curEl) {
        doc.getElementById('pip-title').textContent = p.title;
        curEl.textContent = p.cur || ' ';
        doc.getElementById('pip-next').textContent = p.next || ' ';
        const ico = doc.getElementById('pip-ico');
        if (ico) ico.innerHTML = el.audio.paused ? '<path d="M8 5 19 12 8 19z"/>' : '<path d="M9 5v14M15 5v14"/>';
      }
    }
    if (canvasPip) drawCanvasPip();
  }

  async function openDocumentPip() {
    try {
      pipWindow = await window.documentPictureInPicture.requestWindow({ width: 560, height: 126 });
    } catch (e) {
      pipWindow = null;
      return false;
    }
    const doc = pipWindow.document;
    doc.title = '桌面歌词';
    const style = doc.createElement('style');
    style.textContent = PIP_CSS;
    doc.head.append(style);
    doc.body.innerHTML =
      '<div class="title" id="pip-title"></div>' +
      '<div class="line cur" id="pip-cur"></div>' +
      '<div class="line next" id="pip-next"></div>' +
      '<div class="ctrls" id="pip-ctrls">' +
      '<button type="button" data-act="prev" aria-label="上一首"><svg viewBox="0 0 24 24"><path d="M5 5v14M19 5 9 12l10 7z"/></svg></button>' +
      '<button type="button" data-act="toggle" aria-label="播放或暂停"><svg viewBox="0 0 24 24" id="pip-ico"></svg></button>' +
      '<button type="button" data-act="next" aria-label="下一首"><svg viewBox="0 0 24 24"><path d="M19 5v14M5 5l10 7-10 7z"/></svg></button>' +
      '</div>';
    doc.getElementById('pip-ctrls').addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      if (btn.dataset.act === 'prev') el.prev.click();
      else if (btn.dataset.act === 'next') el.next.click();
      else el.toggle.click();
      setTimeout(pipUpdate, 80);
    });
    pipWindow.addEventListener('pagehide', () => { pipWindow = null; });
    pipUpdate();
    return true;
  }

  function wrapText(ctx, text, maxWidth) {
    const out = [];
    let line = '';
    for (const ch of String(text || '')) {
      const next = line + ch;
      if (line && ctx.measureText(next).width > maxWidth) {
        out.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
    return out;
  }

  function drawCanvasPip() {
    if (!canvasPip) return;
    const { ctx, dpr, W, H } = canvasPip;
    const p = pipPayload();
    const padX = 38;
    const maxW = W - padX - 26;
    const serif = '"Noto Serif SC", "Noto Serif CJK SC", "Songti SC", Georgia, serif';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#0e0f11';
    ctx.fillRect(0, 0, W, H);

    // 顶部：曲名 / 艺人
    ctx.fillStyle = '#605e58';
    ctx.font = '14px "SFMono-Regular", Consolas, monospace';
    ctx.fillText(p.title, padX, 50);

    // 当前句：大号衬线，最多两行
    const size = 42;
    ctx.font = '600 ' + size + 'px ' + serif;
    let lines = wrapText(ctx, p.cur, maxW);
    if (lines.length > 2) {
      lines = lines.slice(0, 2);
      lines[1] = lines[1].slice(0, -1) + '…';
    }
    const ys = lines.length > 1 ? [172, 230] : [204];
    ctx.fillStyle = '#f0ece3';
    lines.forEach((ln, i) => ctx.fillText(ln, padX, ys[Math.min(i, ys.length - 1)]));

    // 左侧橙色竖线
    ctx.fillStyle = '#d9634a';
    const vTop = lines.length > 1 ? 128 : 164;
    const vBot = lines.length > 1 ? 244 : 222;
    ctx.fillRect(padX - 18, vTop, 3, vBot - vTop);

    // 底部：下一句
    let nx = wrapText(ctx, p.next, maxW);
    if (!nx.length) nx = [''];
    ctx.font = '19px ' + serif;
    ctx.fillStyle = '#605e58';
    ctx.fillText(nx[0], padX, 288);
  }

  function closeCanvasPip() {
    if (!canvasPip) return;
    try { canvasPip.stream.getTracks().forEach((tr) => tr.stop()); } catch { /* ignore */ }
    canvasPip.video.remove();
    canvasPip = null;
  }

  async function openCanvasPip() {
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      setStatus('当前浏览器不支持桌面歌词', 'warn');
      return false;
    }
    const W = 640, H = 320;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:fixed;left:-9999px;top:0;width:' + W + 'px;height:' + H + 'px;opacity:0;pointer-events:none';
    document.body.append(video);
    const stream = canvas.captureStream(2);
    canvasPip = { canvas, ctx: canvas.getContext('2d'), dpr, W, H, video, stream };
    video.srcObject = stream;
    drawCanvasPip();
    try {
      await video.play();
      if (typeof video.requestPictureInPicture === 'function') {
        await video.requestPictureInPicture();
      } else if (typeof video.webkitSetPresentationMode === 'function') {
        video.webkitSetPresentationMode('picture-in-picture');
      } else {
        throw new Error('该浏览器不支持画中画');
      }
    } catch (e) {
      closeCanvasPip();
      setStatus('桌面歌词打开失败：' + (e.message || '该浏览器不支持画中画'), 'warn');
      return false;
    }
    video.addEventListener('leavepictureinpicture', closeCanvasPip);
    return true;
  }

  async function toggleDesktopLyrics() {
    if (pipWindow && !pipWindow.closed) { pipWindow.close(); pipWindow = null; return; }
    if (canvasPip) { closeCanvasPip(); return; }
    // 桌面 Chrome / Edge：独立 HTML 浮窗
    if ('documentPictureInPicture' in window && await openDocumentPip()) return;
    // 其余平台（Android Chrome / iOS Safari 等）：画布转视频画中画
    await openCanvasPip();
  }

  function seekTo(t) {
    if (!Number.isFinite(t) || t < 0) return;
    el.audio.currentTime = t;
    el.timeNow.textContent = fmtTime(t);
    syncLyrics(t);
  }

  function updateToggle() {
    const mode = state.loading ? 'loading'
      : (!el.audio.paused && !el.audio.ended ? 'playing' : 'paused');
    el.toggle.dataset.state = mode;
    const label = mode === 'loading' ? '正在缓冲音频' : (mode === 'playing' ? '暂停' : '播放');
    el.toggle.title = label;
    el.toggle.setAttribute('aria-label', label);
  }

  function openRef(value) {
    const ref = parseRef(value);
    if (!ref) { setStatus('请填写播放列表 CID 或 URL', 'error'); return; }
    const label = ref.cid || value.trim();
    el.sourceInput.value = label;
    try {
      const u = new URL(location.href);
      u.searchParams.set('p', label);
      u.searchParams.delete('i');
      history.replaceState(null, '', u);
    } catch { /* file:// 下不允许改写地址，忽略 */ }
    loadPlaylist(ref);
  }

  el.audio.volume = Number(el.volume.value);
  el.audio.addEventListener('play', updateToggle);
  el.audio.addEventListener('pause', () => {
    if (state.loading) return;
    updateToggle();
    if (el.audio.currentTime > 0) setStatus('已暂停');
  });
  el.audio.addEventListener('playing', () => {
    state.loading = false;
    updateToggle();
    setStatus('正在播放 · ' + audioHost());
  });
  el.audio.addEventListener('waiting', () => {
    if (el.audio.paused && !state.wantPlay) return;
    state.loading = true;
    updateToggle();
    setStatus('网络较慢，正在继续缓冲…', 'warn');
  });
  el.audio.addEventListener('progress', setBuffered);
  el.audio.addEventListener('ended', () => {
    state.loading = false;
    updateToggle();
    if (state.repeat === 2) { el.audio.currentTime = 0; playSafely(); return; }
    if (state.index + 1 < state.tracks.length) selectTrack(state.index + 1, true);
    else if (state.repeat === 1) selectTrack(0, true);
    else setStatus('播放列表已结束');
  });
  el.audio.addEventListener('loadedmetadata', () => {
    noteGateway(state.currentAudioUrl);
    if (Number.isFinite(el.audio.duration)) el.timeTotal.textContent = fmtTime(el.audio.duration);
    setBuffered();
    if (state.savedTime > 0) {
      el.audio.currentTime = state.savedTime;
      state.savedTime = 0;
    }
  });
  el.audio.addEventListener('error', () => {
    const ref = state.audioRef;
    if (!ref || el.audio.src !== state.currentAudioUrl) return;
    if (el.audio.currentTime > 0) state.savedTime = el.audio.currentTime;
    if (ref.url || state.audioAttempt + 1 >= gateways.length) {
      state.loading = false;
      updateToggle();
      setStatus('音频加载失败：' + (ref.url ? '数据源不可访问' : gateways.length + ' 个网关均不可用'), 'error');
      return;
    }
    state.audioAttempt++;
    applyAudio();
    setStatus('当前网关不可用，切换到第 ' + (state.audioAttempt + 1) + ' 个网关并继续缓冲…', 'warn');
  });
  el.audio.addEventListener('timeupdate', () => {
    const d = el.audio.duration;
    if (Number.isFinite(d) && d > 0) {
      el.timeTotal.textContent = fmtTime(d);
      if (!state.seeking) {
        el.seek.value = String(Math.round(el.audio.currentTime / d * 1000));
        setProgress(el.audio.currentTime / d * 100);
      }
    }
    el.timeNow.textContent = fmtTime(el.audio.currentTime);
    syncLyrics(el.audio.currentTime);
  });

  el.toggle.addEventListener('click', () => {
    if (el.audio.paused) { state.wantPlay = true; playSafely(); }
    else { state.wantPlay = false; el.audio.pause(); }
  });
  el.prev.addEventListener('click', () => {
    if (el.audio.currentTime > 3) { el.audio.currentTime = 0; return; }
    selectTrack(state.index - 1, true);
  });
  el.next.addEventListener('click', () => selectTrack(state.index + 1, true));
  el.repeat.addEventListener('click', () => {
    state.repeat = (state.repeat + 1) % 3;
    el.repeat.dataset.mode = String(state.repeat);
    const label = '播放模式：' + REPEAT_LABELS[state.repeat];
    el.repeat.title = label;
    el.repeat.setAttribute('aria-label', label);
  });
  function setDownloadMenu(open) {
    el.downloadMenu.hidden = !open;
    el.download.setAttribute('aria-expanded', String(open));
  }
  el.download.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setDownloadMenu(el.downloadMenu.hidden);
  });
  el.downloadMenu.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.menu-item');
    if (!btn) return;
    setDownloadMenu(false);
    if (btn.dataset.mode === 'mp3') downloadMp3(); else downloadBundle();
  });
  document.addEventListener('click', (ev) => {
    if (el.downloadMenu.hidden) return;
    if (el.downloadMenu.contains(ev.target) || el.download.contains(ev.target)) return;
    setDownloadMenu(false);
  });
  el.pipLyrics.addEventListener('click', toggleDesktopLyrics);
  el.audio.addEventListener('play', pipUpdate);
  el.audio.addEventListener('pause', pipUpdate);
  setupMediaSession();
  const mqNarrow = window.matchMedia('(max-width: 620px)');
  function placePip() {
    if (mqNarrow.matches) {
      if (el.pipLyrics.parentElement !== el.brand) {
        el.pipLyrics.classList.add('in-brand');
        el.brand.append(el.pipLyrics);
      }
    } else if (el.pipLyrics.parentElement !== el.extras) {
      el.pipLyrics.classList.remove('in-brand');
      el.extras.prepend(el.pipLyrics);
    }
  }
  mqNarrow.addEventListener('change', placePip);
  placePip();
  el.pickMode.addEventListener('click', () => setPickMode(true));
  el.pickDone.addEventListener('click', () => setPickMode(false));
  el.downloadSelectedBtn.addEventListener('click', downloadSelected);
  el.selectAll.addEventListener('click', () => {
    if (state.tracks.length && state.picks.size === state.tracks.length) state.picks.clear();
    else state.picks = new Set(state.tracks.map((_, i) => i));
    syncPicks();
    syncSelectAll();
  });
  function renderVolume(v) {
    const pct = Math.round(v * 100);
    el.volume.style.setProperty('--p', pct + '%');
    el.volumeValue.textContent = pct + '%';
    el.volumeReadout.textContent = pct + '%';
  }
  function setVolumePopup(open) {
    el.volumePopup.hidden = !open;
    el.volumeBtn.setAttribute('aria-expanded', String(open));
  }
  el.volume.addEventListener('input', () => {
    const v = Number(el.volume.value);
    el.audio.volume = v;
    renderVolume(v);
  });
  el.volumeBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setVolumePopup(el.volumePopup.hidden);
  });
  document.addEventListener('click', (ev) => {
    if (el.volumePopup.hidden) return;
    if (el.volumePopup.contains(ev.target) || el.volumeBtn.contains(ev.target)) return;
    setVolumePopup(false);
  });
  function seekPreviewTime() {
    const d = el.audio.duration;
    return Number.isFinite(d) && d > 0 ? Number(el.seek.value) / 1000 * d : null;
  }
  el.seek.addEventListener('input', () => {
    const t = seekPreviewTime();
    if (t === null) return;
    state.seeking = true;
    setProgress(Number(el.seek.value) / 10);
    el.timeNow.textContent = fmtTime(t);
  });
  function endSeek() {
    if (!state.seeking) return;
    state.seeking = false;
    const t = seekPreviewTime();
    if (t !== null) seekTo(t);
  }
  el.seek.addEventListener('change', endSeek);
  el.seek.addEventListener('pointerup', endSeek);
  el.seek.addEventListener('pointercancel', endSeek);
  el.seek.addEventListener('blur', endSeek);

  el.follow.addEventListener('click', setFollow);
  ['wheel', 'touchmove', 'pointerdown'].forEach((evt) => el.lyrics.addEventListener(evt, pauseFollow, { passive: true }));
  function setPickMode(on) {
    el.drawer.classList.toggle('selecting', on);
    el.pickMode.hidden = on;
    el.pickBar.hidden = !on;
    if (!on) { state.picks.clear(); syncPicks(); }
    syncSelectAll();
  }

  function setDrawer(open) {
    el.drawer.hidden = !open;
    el.scrim.hidden = !open;
    el.drawerToggle.setAttribute('aria-expanded', String(open));
    if (open) revealActiveTrack(); else setPickMode(false);
  }
  el.drawerToggle.addEventListener('click', () => setDrawer(el.drawer.hidden));
  el.drawerClose.addEventListener('click', () => setDrawer(false));
  el.scrim.addEventListener('click', () => {
    if (!document.getElementById('stream-sheet').hidden) closeStreamSheet();
    else setDrawer(false);
  });
  function renderPlaza() {
    const list = CONF.playlists || [];
    const box = document.getElementById('plaza-list');
    box.replaceChildren();
    list.forEach((p) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'plaza-item';
      const thumb = document.createElement('span');
      thumb.className = 'plaza-thumb';
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      setThumb(img, parseRef(p.coverCid));
      thumb.append(img);
      const body = document.createElement('span');
      body.className = 'plaza-body';
      const t = document.createElement('span');
      t.className = 'plaza-title';
      t.textContent = p.title;
      const m = document.createElement('span');
      m.className = 'plaza-meta';
      m.textContent = p.meta || p.cid;
      body.append(t, m);
      row.append(thumb, body);
      row.addEventListener('click', () => {
        setPlaza(false);
        openRef(p.cid);
      });
      box.append(row);
    });
  }
  function setPlaza(open) {
    document.getElementById('plaza-pop').hidden = !open;
    document.getElementById('plaza-btn').setAttribute('aria-expanded', String(open));
    if (open) renderPlaza();
  }
  document.getElementById('plaza-btn').addEventListener('click', (ev) => {
    ev.stopPropagation();
    const pop = document.getElementById('plaza-pop');
    setPlaza(pop.hidden);
  });
  document.addEventListener('click', (ev) => {
    const pop = document.getElementById('plaza-pop');
    if (pop.hidden) return;
    if (pop.contains(ev.target) || document.getElementById('plaza-btn').contains(ev.target)) return;
    setPlaza(false);
  });
  document.getElementById('stream-sheet-close').addEventListener('click', closeStreamSheet);

  ['pointerdown', 'touchstart'].forEach((evt) => el.trackList.addEventListener(evt, () => {
    state.listTouchedUntil = Date.now() + 1500;
  }, { passive: true }));

  el.sourceLoad.addEventListener('click', () => openRef(el.sourceInput.value));
  el.sourceInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') openRef(el.sourceInput.value);
  });
  el.copyCid.addEventListener('click', () => {
    const ref = state.sourceRef;
    if (!ref) { setStatus('尚未载入歌单，没有可复制的 CID', 'warn'); return; }
    const text = ref.cid || ref.url;
    try {
      const p = navigator.clipboard && navigator.clipboard.writeText(text);
      if (!p) { setStatus('当前环境不支持剪贴板，请手动复制输入框内容', 'warn'); return; }
      p.then(() => setStatus('已复制数据源 CID')).catch(() => setStatus('复制失败，请手动复制', 'warn'));
    } catch {
      setStatus('当前环境不支持剪贴板，请手动复制输入框内容', 'warn');
    }
  });

  document.addEventListener('keydown', (ev) => {
    const tag = (ev.target && ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (ev.key === 'Escape') { setPlaza(false); closeStreamSheet(); setDrawer(false); setVolumePopup(false); setDownloadMenu(false); return; }
    if (ev.code === 'Space') { ev.preventDefault(); el.toggle.click(); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); setFollow(); seekTo(el.audio.currentTime - 5); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); setFollow(); seekTo(el.audio.currentTime + 5); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); selectTrack(state.index - 1, true); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); selectTrack(state.index + 1, true); }
    else if (ev.key === 'PageUp' || ev.key === 'PageDown') { state.follow = false; el.follow.hidden = false; }
  });

  el.audio.volume = Number(el.volume.value);
  renderVolume(Number(el.volume.value));
  // 单曲卡片模式 (?card=1&i=序号): 网易云外链式小卡片, 供文章穿插排版
  const CARD = new URLSearchParams(location.search).has('card');
  if (CARD) {
    document.body.classList.add('card');
    const card = document.createElement('div');
    card.className = 'mini-card';
    card.innerHTML = '<img class="mini-cover" alt="">' +
      '<div class="mini-mid"><div class="mini-title"></div><div class="mini-artist"></div>' +
      '<input class="mini-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="播放进度"></div>' +
      '<div class="mini-btns">' +
      '<button class="mini-sbtn" type="button" data-act="full" title="打开完整播放器" aria-label="打开完整播放器">' +
      '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4 10 14M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg></button>' +
      '</div>' +
      '<button class="mini-toggle" type="button" title="播放" aria-label="播放">' +
      '<svg viewBox="0 0 24 24" class="ico-play"><path d="M8 5 19 12 8 19z"/></svg>' +
      '<svg viewBox="0 0 24 24" class="ico-pause"><path d="M9 5v14M15 5v14"/></svg></button>';
    document.body.append(card);

    let miniSeeking = false;
    const seekEl = card.querySelector('.mini-seek');
    seekEl.addEventListener('input', () => {
      miniSeeking = true;
      seekEl.style.setProperty('--p', (Number(seekEl.value) / 10) + '%');
    });
    seekEl.addEventListener('change', () => {
      const d = el.audio.duration;
      if (Number.isFinite(d) && d > 0) { setFollow(); seekTo(Number(seekEl.value) / 1000 * d); }
      miniSeeking = false;
    });

    card.querySelector('.mini-toggle').addEventListener('click', () => el.toggle.click());
    card.querySelector('[data-act="full"]').addEventListener('click', () => {
      const u = new URL(location.href);
      u.searchParams.delete('card');
      u.searchParams.set('i', String(state.index));
      window.open(u.href, '_blank', 'noopener');
    });

    const syncMini = () => {
      const t = state.audioTrack;
      if (!t) return;
      const tt = card.querySelector('.mini-title');
      const ta = card.querySelector('.mini-artist');
      const cov = card.querySelector('.mini-cover');
      const tg = card.querySelector('.mini-toggle');
      const title = (t.titleZh ? t.title + '（' + t.titleZh + '）' : t.title) || '加载中…';
      if (tt.textContent !== title) {
        tt.textContent = title;
        ta.textContent = [t.artist, t.album].filter(Boolean).join(' / ');
        if (state.coverUrl) cov.src = state.coverUrl;
      }
      if (!miniSeeking) {
        const d = el.audio.duration;
        const pct = Number.isFinite(d) && d > 0 ? el.audio.currentTime / d * 100 : 0;
        seekEl.value = String(Math.round(pct * 10));
        seekEl.style.setProperty('--p', pct + '%');
      }
      tg.classList.toggle('playing', !el.audio.paused && !el.audio.ended);
    };
    el.audio.addEventListener('timeupdate', syncMini);
    el.audio.addEventListener('play', syncMini);
    el.audio.addEventListener('pause', syncMini);
    el.audio.addEventListener('loadedmetadata', syncMini);
  }
  const initial = new URLSearchParams(location.search).get('p') || DEFAULT_REF;
  el.sourceInput.value = initial;
  if (initial) loadPlaylist(parseRef(initial));
  else setStatus('未配置歌单：在 config.js 填写 playlistCid，或用 ?p=CID 指定', 'warn');
})();
