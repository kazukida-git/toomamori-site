














(function () {
  'use strict';

  var STORAGE_KEY = 'ecn_preparedness_profile';
  var MEMO_KEY = 'ecn_care_memo';

  var CONFIG = {
    REQUEST_FORM_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSfNdQkHPwUGusWBU_m6ZH34dwqKXDpPm0AhbnyxSaL44XT4Vg/viewform?usp=pp_url&entry.147722481=',
    REQUEST_MAIL_TO: ''
  };

  var PREF_CODE = {
    '北海道': '01', '青森県': '02', '岩手県': '03', '宮城県': '04', '秋田県': '05',
    '山形県': '06', '福島県': '07', '茨城県': '08', '栃木県': '09', '群馬県': '10',
    '埼玉県': '11', '千葉県': '12', '東京都': '13', '神奈川県': '14', '新潟県': '15',
    '富山県': '16', '石川県': '17', '福井県': '18', '山梨県': '19', '長野県': '20',
    '岐阜県': '21', '静岡県': '22', '愛知県': '23', '三重県': '24', '滋賀県': '25',
    '京都府': '26', '大阪府': '27', '兵庫県': '28', '奈良県': '29', '和歌山県': '30',
    '鳥取県': '31', '島根県': '32', '岡山県': '33', '広島県': '34', '山口県': '35',
    '徳島県': '36', '香川県': '37', '愛媛県': '38', '高知県': '39', '福岡県': '40',
    '佐賀県': '41', '長崎県': '42', '熊本県': '43', '大分県': '44', '宮崎県': '45',
    '鹿児島県': '46', '沖縄県': '47'
  };

  var state = {
    areaId: 'national',
    areaPref: '',
    areaMuni: '',
    questions: [],
    index: 0,
    answers: {},
    data: { questions: null, rules: null, catalog: null, scenes: null, areas: null, mirror: null, faq: null, glossary: null, municipalities: null, areaWindows: null, prefWindows: null, verifiedWindows: null },
    statuses: {},
    flags: {},
    mirror: null,
    memo: {},
    completed: [],
    todoSnapshot: [],
    diagnosed: false
  };

  var MEMO_FIELDS = [
    { group: 'ケアマネジャー', fields: [
      { key: 'care_manager_name', label: '氏名・事業所' },
      { key: 'care_manager_phone', label: '電話', tel: true }
    ] },
    { group: '駆けつけ役', fields: [
      { key: 'responder_name', label: '名前(続柄)' },
      { key: 'responder_phone', label: '電話', tel: true }
    ] },
    { group: '介護タクシー', fields: [
      { key: 'care_taxi_name', label: '事業者名(複数可)' },
      { key: 'care_taxi_phone', label: '電話', tel: true }
    ] },
    { group: 'ヘルパー事業所', fields: [
      { key: 'helper_name', label: '名称' },
      { key: 'helper_phone', label: '電話', tel: true }
    ] },
    { group: '訪問看護ステーション', fields: [
      { key: 'visiting_nurse_name', label: '事業所名' },
      { key: 'visiting_nurse_phone', label: '電話', tel: true }
    ] },
    { group: 'かかりつけ医', fields: [
      { key: 'doctor_name', label: '医院名' },
      { key: 'doctor_phone', label: '電話', tel: true }
    ] },
    { group: '鍵', fields: [
      { key: 'key_location', label: '手段と所在(自由記入)', wide: true }
    ] },
    { group: '情報セット', fields: [
      { key: 'info_location', label: '保管場所(自由記入)', wide: true }
    ] }
  ];

  var MEMO_GROUP_CARD = {
    'ケアマネジャー': 'care_manager',
    '駆けつけ役': 'family_responder',
    '介護タクシー': 'care_taxi',
    'ヘルパー事業所': 'helper_office',
    '訪問看護ステーション': 'visiting_nurse',
    'かかりつけ医': 'family_doctor',
    '鍵': 'key_access',
    '情報セット': 'info_set'
  };
  var PROGRESS_KEY = 'ecn_preparedness_profile';

  var ICONS = {
    phone: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    car: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 13l2-5.2A2 2 0 0 1 6.9 6.5h10.2a2 2 0 0 1 1.9 1.3L21 13v5h-3v-2H6v2H3z"/><circle cx="7.5" cy="16" r="1.6"/><circle cx="16.5" cy="16" r="1.6"/></svg>',
    check: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12.5l5 5 11-11"/></svg>',
    chevron: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7"/></svg>',
    copy: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>'
  };
  function icon(name) { return ICONS[name] || ''; }

  var ILLUS = {
    'hero': '<svg viewBox="0 0 400 180" role="img" aria-label="離れた二つの家を点線の道が結び、左の家から電話の音が広がる" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M60 104 L90 80 L120 104 M68 100 L68 140 L112 140 L112 100"/><path d="M280 104 L310 80 L340 104 M288 100 L288 140 L332 140 L332 100"/><path d="M120 142 Q200 168 288 142" stroke-dasharray="1 9"/><path d="M110 70 Q120 80 110 90 M118 62 Q134 80 118 98" stroke="var(--color-kaki)"/><path d="M356 40 C368 42 372 56 362 64 C352 58 350 44 356 40 Z M359 46 L363 60" stroke="var(--color-kaki)"/></g></svg>',
    'step-home': '<svg viewBox="0 0 48 48" role="img" aria-label="家と虫めがね" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 24 L22 13 L35 24 M13 21 L13 38 L31 38 L31 21"/><circle cx="31" cy="29" r="7"/><path d="M36 34 L42 40"/><path d="M16 30 L16 38 L22 38 L22 30" stroke="currentColor"/></g></svg>',
    'step-prepare': '<svg viewBox="0 0 48 48" role="img" aria-label="鍵と手帳" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13 L8 37 L22 37 L22 13 Z M15 13 L15 37"/><path d="M30 25 L30 40 M30 36 L34 36 M30 32 L33 32"/><circle cx="30" cy="20" r="5" stroke="currentColor"/></g></svg>',
    'step-emergency': '<svg viewBox="0 0 48 48" role="img" aria-label="電話の受話器" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 15 Q11 13 14 12 Q18 11 20 15 Q21 18 19 20 Q24 29 33 34 Q35 32 38 33 Q42 35 41 39 Q40 42 36 42 Q19 40 11 21 Q9 16 13 15 Z"/><path d="M30 10 Q37 12 38 19" stroke="currentColor"/></g></svg>',
    'scene-phone': '<svg viewBox="0 0 48 48" role="img" aria-label="鳴っている固定電話" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 40 L37 40 L35 30 L13 30 Z"/><path d="M13 30 L13 26 Q13 23 16 23 L32 23 Q35 23 35 26 L35 30"/><path d="M39 14 Q44 19 42 25 M42 11 Q49 18 46 27" stroke="currentColor"/></g></svg>',
    'scene-fever': '<svg viewBox="0 0 48 48" role="img" aria-label="体温計と湯呑み" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 10 Q13 7 16 7 Q19 7 19 10 L19 31 Q19 36 16 36 Q13 36 13 31 Z"/><circle cx="16" cy="32" r="2.5"/><path d="M27 28 L29 39 Q29 40 30 40 L40 40 Q41 40 41 39 L43 28 Z"/><path d="M43 30 Q47 30 47 33 Q47 36 43 36"/><path d="M33 24 Q35 21 33 18 M38 24 Q40 21 38 18" stroke="currentColor"/></g></svg>',
    'scene-fall': '<svg viewBox="0 0 48 48" role="img" aria-label="手すりと杖" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 18 L40 18 M10 18 L10 13 M38 18 L38 13" stroke="currentColor"/><path d="M20 28 Q20 24 24 24 Q28 24 28 28 M24 24 L24 42"/></g></svg>',
    'scene-handover': '<svg viewBox="0 0 48 48" role="img" aria-label="封筒と鍵" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 18 L8 38 L40 38 L40 18 Z"/><path d="M8 18 L24 30 L40 18"/><circle cx="30" cy="12" r="4" stroke="currentColor"/><path d="M30 16 L30 24 M30 21 L33 21" stroke="currentColor"/></g></svg>',
    'mame-door': '<svg viewBox="0 0 400 140" role="img" aria-label="縁側に置かれた二つの湯呑み" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M40 88 L360 88 L360 112 L40 112 Z"/><path d="M130 88 L130 112 M250 88 L250 112"/><path d="M70 44 L70 88 M330 44 L330 88 M55 44 L345 44"/><path d="M150 74 L152 88 L170 88 L172 74 Z"/><path d="M230 74 L232 88 L250 88 L252 74 Z"/><path d="M158 70 Q161 66 158 62 M240 70 Q243 66 240 62" stroke="var(--color-kaki)"/></g></svg>'
  };
  function illus(name) { return ILLUS[name] || ''; }
  var SCENE_ILLUS = {
    scene_no_answer: 'scene-phone',
    scene_fever: 'scene-fever',
    scene_fall: 'scene-fall',
    scene_caregiver_down: 'scene-handover'
  };

  function memoGroupFilled(memo, group) {
    return group.fields.some(function (f) { return memo && memo[f.key]; });
  }
  function recommendedMemoGroups() {
    var base = RulesEngine.deriveCardStatuses(state.answers);
    return MEMO_FIELDS.filter(function (g) {
      var cid = MEMO_GROUP_CARD[g.group];
      var card = cardById(cid);
      if (!card) return false;
      if (card.status_type !== 'derived') return true;
      return base[cid] !== 'not_applicable';
    });
  }

  var PLACEHOLDER_FALLBACK = '(この項目は表示できませんでした。お手数ですが、お住まいの市の窓口でお確かめください)';
  var OPTIONAL_PLACEHOLDERS = { sharp7119: true, chiiki_houkatsu_hours_note: true, touban_i_link: true };

  var PLACEHOLDER_DEFS = {
    emergency_call_system: {
      label: '緊急通報システム',
      get: function (a) { return a.emergency_call_system; },
      display: function (o) { return o.name; }
    },
    emergency_call_system_contact: {
      label: '緊急通報システムの窓口',
      get: function (a) { return a.emergency_call_system; },
      display: function (o) { return o.contact || o.how_to_find || o.name; }
    },
    chiiki_houkatsu: {
      label: '地域包括支援センター',
      get: function (a) { return a.elderly_consult && a.elderly_consult.chiiki_houkatsu; },
      display: function (o) { return o.coordinator ? o.name + '（' + o.coordinator + '）' : o.name; }
    },
    chiiki_houkatsu_hours_note: {
      label: '地域包括支援センターの時間',
      get: function (a) { return a.elderly_consult && a.elderly_consult.chiiki_houkatsu; },
      display: function (o) { return o.hours ? '相談時間: ' + o.hours : ''; }
    },
    medical_info_kit: {
      label: '救急医療情報キット',
      get: function (a) { return a.medical_info_kit; },
      display: function (o) { return o.text; }
    },
    taxi_directory: {
      label: '介護タクシーの探し方',
      get: function (a) { return a.taxi_directory; },
      display: function (o) { return o.text; }
    },
    touban_i_link: {
      label: '当番医・夜間休日診療の案内',
      get: function (a) {
        if (!a.directory_links) return null;
        var m = a.directory_links.filter(function (l) {
          return (l.use_for || []).indexOf('当番医') !== -1;
        });
        return m[0] || null;
      },
      display: function (o) { return o.name; }
    },
    ai_kyukyu: {
      label: 'AI救急相談',
      get: function (a) {
        return a.emergency_consult && (a.emergency_consult.ai_kyukyu || a.emergency_consult.q_jyosuke);
      },
      display: function (o) { return o.name; }
    },
    sharp7119: {
      label: '救急電話相談(#7119)',
      get: function (a) { return a.emergency_consult && a.emergency_consult.sharp7119; },
      display: function (o) { return o.available === 'yes' ? (o.phone || '#7119') : ''; }
    }
  };

  function $(id) { return document.getElementById(id); }

  var SCREENS = ['screen-top', 'screen-home', 'screen-diagnosis', 'screen-mirror', 'screen-result', 'screen-emergency', 'screen-memo', 'screen-about', 'screen-mame'];

  var SIGNATURE = '埼玉県川口市から始めました。ここで確かめながら、全国へ広げていきます。';

  var SCREEN_STEP = { 'screen-mirror': '1', 'screen-home': '2', 'screen-result': '2', 'screen-memo': '2', 'screen-emergency': '3' };

  function showRaw(screenId) {
    SCREENS.forEach(function (id) {
      var el = $(id);
      if (el) el.classList.toggle('hidden', id !== screenId);
    });
    var band = $('step-band');
    if (SCREEN_STEP[screenId] && loadProfile()) renderStepBand(SCREEN_STEP[screenId]);
    else if (band) band.classList.add('hidden');
    if (screenId === 'screen-top') updateTopPrimary();
    var bar = $('back-bar');
    if (bar) bar.classList.toggle('hidden', screenId === 'screen-top');
    var homeBtn = $('home-btn');
    if (homeBtn) homeBtn.classList.toggle('hidden', screenId === 'screen-top');
    window.scrollTo(0, 0);
  }

  function show(screenId) {
    if (currentScreen() !== screenId) {
      try { window.history.pushState({ screen: screenId }, ''); } catch (e) {}
    }
    showRaw(screenId);
  }

  function goBack() {
    var st = window.history.state;
    if (st && st.screen && currentScreen() !== 'screen-top') window.history.back();
    else showRaw('screen-top');
  }

  function primaryCtaState() {
    return loadProfile()
      ? { label: 'わが家の備えに戻る', action: function () { openHome(); } }
      : { label: '5分で、わが家の手札を確認する', action: startDiagnosis };
  }

  function updateTopPrimary() {
    var btn = $('btn-start');
    if (!btn) return;
    var c = primaryCtaState();
    btn.textContent = c.label;
    btn.onclick = c.action;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }


  var SCENE_ALIAS = { scene_immobile: 'scene_no_answer' };

  function sceneTitleById(id) {
    var real = SCENE_ALIAS[id] || id;
    var list = (state.data.scenes && state.data.scenes.scenes) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].scene_id === real) return list[i].title;
    }
    return null;
  }

  function sceneNames(text) {
    return String(text == null ? '' : text).replace(/scene_[a-z_]+/g, function (id) {
      var t = sceneTitleById(id);
      return t ? '「' + t + '」' : id;
    });
  }

  function personalizeArea(text) {
    if (!state.areaMuni) return text;
    return String(text == null ? '' : text).replace(/\(市区町村名\)/g, state.areaMuni);
  }

  function searchUrl(q) {
    return 'https://www.google.com/search?q=' + encodeURIComponent(q);
  }

  function linkifySearch(html) {
    return html.replace(/「([^「」]+)」で検索/g, function (whole, q) {
      return '<a href="' + searchUrl(q) + '" target="_blank" rel="noopener noreferrer">「' + q + '」で検索</a>';
    });
  }

  function boldMd(escaped) {
    return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
  function linkifyPhones(escaped) {
    var re = /(#7119|0\d{1,4}-\d{1,4}-\d{3,4}|\b119\b)/g;
    return escaped.replace(re, function (m) {
      return '<a href="tel:' + m + '">' + m + '</a>';
    });
  }
  function rich(text) {
    return linkifySearch(linkifyPhones(boldMd(esc(sceneNames(personalizeArea(text)))))).replace(/\n/g, '<br>');
  }

  function linkGlossary(html, seen) {
    var g = state.data.glossary;
    if (!g || !g.terms) return html;
    var terms = g.terms.slice().sort(function (a, b) { return b.term.length - a.term.length; });
    terms.forEach(function (t) {
      if (seen[t.term]) return;
      var idx = html.indexOf(t.term);
      if (idx === -1) return;
      var before = html.slice(0, idx);
      var lt = before.lastIndexOf('<'), gt = before.lastIndexOf('>');
      if (lt > gt) return;
      seen[t.term] = true;
      var btn = '<button type="button" class="glossary-term" data-term="' + esc(t.term) + '">' + esc(t.term) + '</button>';
      html = html.slice(0, idx) + btn + html.slice(idx + t.term.length);
    });
    return html;
  }
  function richG(text, seen) {
    return linkGlossary(rich(text), seen || {});
  }


  function supportedAreaMap() {
    var byId = {};
    var areas = (state.data.areas && state.data.areas.areas) || [];
    areas.forEach(function (a) { byId[a.area_id] = a; });
    var map = {};
    areas.forEach(function (a) {
      if (a.area_type !== 'municipality') return;
      var parent = a.parent ? byId[a.parent] : null;
      var pref = parent ? parent.display_name : '';
      map[pref + '|' + a.display_name] = a.area_id;
    });
    return map;
  }

  function areaIdFor(pref, muni) {
    return supportedAreaMap()[pref + '|' + muni] || 'national';
  }

  function requestUrl(pref, muni) {
    var name = (pref || '') + (muni || '');
    if (CONFIG.REQUEST_FORM_URL) {
      return CONFIG.REQUEST_FORM_URL + encodeURIComponent(name);
    }
    return 'mailto:' + CONFIG.REQUEST_MAIL_TO +
      '?subject=' + encodeURIComponent('地域の追加リクエスト: ' + name) +
      '&body=' + encodeURIComponent(name);
  }

  var WINDOW_ITEMS = [
    { key: 'chiiki_houkatsu', label: '介護の相談窓口(地域包括支援センター)' },
    { key: 'koureifukushi_ka', label: '高齢福祉の担当課' },
    { key: 'kinkyu_tsuho', label: '緊急通報のしくみ' },
    { key: 'haishoku_mimamori', label: '配食・見守り' },
    { key: 'shougaisha_kojo', label: '障害者控除対象者認定書(税の軽減)' },
    { key: 'kazoku_kaigo', label: '介護するご家族への支援' }
  ];

  function areaWindowFor(pref, muni) {
    var w = state.data.areaWindows;
    if (!w || !w.areas || !pref || !muni) return null;
    return w.areas[pref + '|' + muni] || null;
  }

  function verifiedWindowFor(pref, muni) {
    var w = state.data.verifiedWindows;
    if (!w || !w.areas || !pref || !muni) return null;
    return w.areas[pref + '|' + muni] || null;
  }

  function checkedMonthLabel(iso) {
    var m = String(iso == null ? '' : iso).match(/^(\d{4})-(\d{2})/);
    if (!m) return '';
    return '(' + m[1] + '年' + parseInt(m[2], 10) + '月確認)';
  }

  function hasVerifiedContent(verified) {
    if (!verified) return false;
    var items = verified.items || {};
    return Object.keys(items).length > 0 || ((verified.extra_items || []).length > 0);
  }

  function areaWinSummaryLabel(muni, verified) {
    return hasVerifiedContent(verified)
      ? muni + 'の窓口を見る(電話で確かめた費用や条件も載せています)'
      : muni + 'の窓口を見る(公式ページへの入口をご案内します)';
  }

  function renderWindowList(muni, win, verified) {
    var vItems = (verified && verified.items) || {};
    var vLabel = (verified && verified.confirmed_label) || '';
    var confirmed = hasVerifiedContent(verified);
    var html = '<details class="area-win-section"><summary class="area-win-summary">' +
      esc(areaWinSummaryLabel(muni, verified)) + '</summary><div class="area-win-body">';
    if (!confirmed) {
      html += '<p>いまご案内できるのは、市の公式ページへの入口までです。費用や対象になる条件は市によって異なりますので、くわしくはリンク先か、お電話で直接お確かめください。</p>';
    }
    html += '<ul class="area-links area-win-list">';
    var seenUrls = {};
    WINDOW_ITEMS.forEach(function (it) {
      var url = win.items && win.items[it.key];
      var v = vItems[it.key];
      if (!url && !v) return;
      if (!v) {
        if (seenUrls[url]) return;
        seenUrls[url] = true;
        html += '<li>' + esc(it.label) + ' → <a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">公式ページを見る</a></li>';
        return;
      }
      html += '<li class="area-win-verified"><span class="area-win-label">' + esc(it.label) + '</span>' +
        '<div class="area-win-detail">' + rich(v.detail) + '</div>' +
        (v.contact ? '<div class="area-win-contact">' + rich(v.contact) + '</div>' : '') +
        (vLabel ? '<div class="area-win-confirmed">' + esc(vLabel) + '</div>' : '') +
        (url ? '<div class="area-win-official"><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">公式ページを見る</a></div>' : '') +
        '</li>';
    });
    ((verified && verified.extra_items) || []).forEach(function (ex) {
      html += '<li class="area-win-verified"><span class="area-win-label">' + esc(ex.label) + '</span>' +
        '<div class="area-win-detail">' + rich(ex.detail) + '</div>' +
        (ex.contact ? '<div class="area-win-contact">' + rich(ex.contact) + '</div>' : '') +
        (vLabel ? '<div class="area-win-confirmed">' + esc(vLabel) + '</div>' : '') +
        '</li>';
    });
    html += '</ul>';
    html += '<p>ここに出ていないことは、高齢福祉の担当課におたずねになるのが近道です。</p>';
    html += '<p class="area-win-date">' + checkedMonthLabel(win.checked_at) + '</p>';
    html += '<p>この地域の情報をもっとくわしくしてほしい、というご要望は<a id="area-request-win" class="area-request-link" href="' + esc(requestUrl(state.areaPref, muni)) + '" target="_blank" rel="noopener noreferrer">こちら</a>からお寄せください。</p>';
    html += areaCtaHtml();
    html += '</div></details>';
    return html;
  }

  function areaCtaHtml() {
    return '<div class="area-cta-wrap"><button type="button" class="btn btn-primary area-cta"></button></div>';
  }

  var PREF_SECTION = {
    closedLabel: '市に聞いても分からないことがあります(○○県の窓口)',
    intro: '介護の窓口は市区町村だけではありません。県が担当しているものもあります。市役所に聞いても「それは県です」と言われるだけのことがあるので、先にお伝えしておきます。',
    notFound: '調べた時点では、○○県では見当たりませんでした。念のため、県の窓口でご確認ください。',
    items: [
      { key: 'kaigo_shinsakai', heading: '要介護認定に納得できないとき — ○○県 介護保険審査会',
        body: '「思ったより軽い判定だった」というとき、市に言っても判定は変わりません。都道府県に置かれた介護保険審査会に審査請求をします。市の窓口では扱っていないので、ここを知らないと諦めることになります。\n期限があるので、納得できないときは早めにお問い合わせください。' },
      { key: 'kokuho_kujo', heading: 'サービスの内容に困ったとき — ○○県 国民健康保険団体連合会(国保連)',
        body: 'ヘルパーさんや事業所の対応に困っても、直接は言いにくいものです。国保連が県ごとに苦情の相談を受け付けています。まずはケアマネージャーさんや市の窓口に相談し、それでも解決しないときの行き先です。' },
      { key: 'kouki_koiki', heading: '75歳以上の医療のこと — ○○後期高齢者医療広域連合',
        body: '75歳になると、それまでの健康保険から後期高齢者医療制度に移ります。運営しているのは市ではなく、県内の市町村が集まって作った広域連合です。保険料や医療費の上限は、ここが決めています。\n申請の窓口は、お住まいの市の担当課になることが多いです。' },
      { key: 'parking_permit', heading: '車椅子用の駐車スペースを使いたいとき',
        body: '商業施設などにある車椅子マークの駐車スペース。県が利用証を発行していて、これがあると駐められます。要介護の高齢者も対象になることがあります。\n県によって名前が違います。' },
      { key: 'nichijo_jiritsu', heading: 'お金の管理が難しくなってきたとき — 日常生活自立支援事業',
        body: '通帳の管理や支払いの手続きを手伝ってもらえます。担っているのは社会福祉協議会で、県の社協が実施主体、実際の相談はお住まいの市町村の社協が窓口です。成年後見より軽い段階で使えるのが特徴です。\n県によって愛称があります。' },
      { key: 'ninchisho_call', heading: '認知症のことを、誰かに相談したいとき — ○○県 認知症コールセンター',
        body: '診断がついていなくても、ご家族が話を聞いてもらえる電話窓口です。同じ経験をしたご家族が電話を受けていることが多く、制度の説明だけでなく、気持ちの相談もできます。\n受付の曜日や時間が限られていることがあります。' },
      { key: 'carer_shien', heading: '介護しているあなた自身のこと — ケアラー支援',
        body: '介護する人(ケアラー)を支えるしくみを、県が持っていることがあります。相談窓口、家族の会の一覧、仕事との両立の情報など。' }
    ]
  };

  function subPref(text, pref) {
    return String(text == null ? '' : text).replace(/○○県/g, pref).replace(/○○/g, pref);
  }

  function renderPrefSection(pref) {
    var code = PREF_CODE[pref];
    var prefs = state.data.prefWindows && state.data.prefWindows.prefs;
    var p = code && prefs ? prefs[code] : null;
    if (!p || !p.windows) return '';
    var S = PREF_SECTION;
    var html = '<details class="pref-section"><summary class="pref-section-h">' + esc(subPref(S.closedLabel, pref)) + '</summary>';
    html += '<div class="pref-section-body">';
    html += '<p class="pref-section-intro">' + esc(S.intro) + '</p>';
    S.items.forEach(function (item) {
      var w = p.windows[item.key] || { found: false };
      html += '<div class="pref-item">';
      html += '<h4 class="pref-item-h">' + esc(subPref(item.heading, pref)) + '</h4>';
      subPref(item.body, pref).split('\n').forEach(function (para) {
        html += '<p class="pref-item-p">' + esc(para) + '</p>';
      });
      if (w.found) {
        if (w.name) {
          html += '<p class="pref-item-name">' +
            (w.url ? '<a href="' + esc(w.url) + '" target="_blank" rel="noopener noreferrer">' + esc(w.name) + '</a>' : esc(w.name)) +
            '</p>';
        }
        if (w.tel) {
          var dial = String(w.tel).replace(/[^0-9#+]/g, '');
          html += '<p class="pref-item-tel">電話: ' + (dial ? '<a href="tel:' + esc(dial) + '">' + esc(w.tel) + '</a>' : esc(w.tel)) + '</p>';
        }
        if (w.hours) html += '<p class="pref-item-hours">受付: ' + esc(w.hours) + '</p>';
        if (w.checked_at) html += '<p class="pref-item-date">' + esc(checkedMonthLabel(w.checked_at)) + '</p>';
      } else {
        html += '<p class="pref-item-notfound">' + esc(subPref(S.notFound, pref)) + '</p>';
      }
      html += '</div>';
    });
    html += areaCtaHtml();
    html += '</div></details>';
    return html;
  }

  function renderAreaNotice() {
    var box = $('area-notice');
    var bridge = $('bridge-b');
    if (!box) return;
    if (!state.areaMuni) {
      box.classList.add('hidden'); box.innerHTML = '';
      if (bridge) bridge.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    if (bridge) bridge.classList.remove('hidden');
    var muni = state.areaMuni;
    var html;
    var win = areaWindowFor(state.areaPref, muni);
    var verified = verifiedWindowFor(state.areaPref, muni);
    if (win) {
      html = renderWindowList(muni, win, verified);
    } else if (state.areaId !== 'national') {
      html = '<p class="area-ready">' + esc(muni) + 'の窓口情報をご案内できます。</p>';
    } else {
      html = '<p>' + esc(muni) + 'の詳しい窓口情報は、まだ準備中です。<strong>下のボタンから追加をリクエストできます。</strong>' +
        'いただいたリクエストから数日以内に追加し、次にお越しいただいたときに反映されています。' +
        'それまでの間も、診断・備えプラン・緊急時ガイドはすべてお使いいただけます</p>';
      html += '<ul class="area-links">';
      html += '<li><a href="' + searchUrl(muni + ' 地域包括支援センター') + '" target="_blank" rel="noopener noreferrer">「' + esc(muni) + ' 地域包括支援センター」で検索</a></li>';
      html += '<li><a href="' + searchUrl(muni + ' 公式サイト') + '" target="_blank" rel="noopener noreferrer">「' + esc(muni) + ' 公式サイト」で検索</a></li>';
      html += '</ul>';
      html += '<p><a id="area-request" class="area-request" href="' + esc(requestUrl(state.areaPref, muni)) + '" target="_blank" rel="noopener noreferrer">' + esc(muni) + 'の追加リクエストを送る</a></p>';
    }
    html += renderPrefSection(state.areaPref);
    box.innerHTML = html;
    var cta = primaryCtaState();
    [].forEach.call(box.querySelectorAll('.area-cta'), function (b) {
      b.textContent = cta.label;
      b.onclick = cta.action;
    });
  }

  function renderMuniOptions(pref) {
    var sel = $('area-muni');
    if (!sel) return;
    var list = [];
    ((state.data.municipalities && state.data.municipalities.prefectures) || []).forEach(function (p) {
      if (p.name === pref) list = p.municipalities;
    });
    var html = '<option value="">市区町村を選ぶ</option>';
    list.forEach(function (m) { html += '<option value="' + esc(m.name) + '">' + esc(m.name) + '</option>'; });
    sel.innerHTML = html;
    sel.disabled = !list.length;
  }

  function muniCode(pref, muni) {
    if (!pref || !muni) return null;
    var prefs = (state.data.municipalities && state.data.municipalities.prefectures) || [];
    for (var i = 0; i < prefs.length; i++) {
      if (prefs[i].name !== pref) continue;
      var list = prefs[i].municipalities || [];
      for (var j = 0; j < list.length; j++) {
        if (list[j].name === muni) return list[j].code || null;
      }
    }
    return null;
  }

  function bindAreaSelects() {
    var pref = $('area-pref'), muni = $('area-muni');
    if (!pref || !muni) return;
    var html = '<option value="">都道府県を選ぶ</option>';
    ((state.data.municipalities && state.data.municipalities.prefectures) || []).forEach(function (p) {
      html += '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>';
    });
    pref.innerHTML = html;

    pref.addEventListener('change', function () {
      state.areaPref = pref.value;
      state.areaMuni = '';
      state.areaId = 'national';
      renderMuniOptions(pref.value);
      renderAreaNotice();
      syncAreaToProfile();
    });
    muni.addEventListener('change', function () {
      state.areaMuni = muni.value;
      state.areaId = state.areaMuni ? areaIdFor(state.areaPref, state.areaMuni) : 'national';
      renderAreaNotice();
      syncAreaToProfile();
    });
  }

  function syncAreaToProfile() {
    var p = loadProfile();
    if (!p) return;
    p.area_id = state.areaId;
    p.area_pref = state.areaPref;
    p.area_muni = state.areaMuni;
    p.updated_at = todayStr();
    persist(STORAGE_KEY, JSON.stringify(p));
  }

  function restoreAreaSelects() {
    var pref = $('area-pref'), muni = $('area-muni');
    if (!pref || !muni || !state.areaPref) return;
    pref.value = state.areaPref;
    renderMuniOptions(state.areaPref);
    if (state.areaMuni) muni.value = state.areaMuni;
    renderAreaNotice();
  }

  function buildChain(areaId) {
    var byId = {};
    state.data.areas.areas.forEach(function (a) { byId[a.area_id] = a; });
    var chain = [];
    var cur = byId[areaId] || byId.national;
    while (cur) {
      chain.push(cur);
      cur = cur.parent ? byId[cur.parent] : null;
    }
    if (!chain.some(function (a) { return a.area_id === 'national'; }) && byId.national) {
      chain.push(byId.national);
    }
    return chain;
  }

  function resolvePlaceholder(chain, token) {
    var def = PLACEHOLDER_DEFS[token];
    if (!def) return null;
    for (var i = 0; i < chain.length; i++) {
      var obj = def.get(chain[i]);
      if (obj) {
        return {
          text: def.display(obj),
          last_checked: obj.last_checked || null,
          label: def.label,
          areaName: chain[i].display_name
        };
      }
    }
    return null;
  }

  function reportPlaceholderMiss(token, chain, text) {
    if (typeof console === 'undefined' || !console.error) return;
    var area = (chain && chain[0] && chain[0].display_name) || state.areaId || '(地域不明)';
    console.error('[placeholder] 未解決: {' + token + '} / 地域=' + area + ' / 文=「' + String(text).slice(0, 40) + '」');
  }

  function substitute(text, chain, bracketOpts) {
    var used = [];
    var seen = {};
    var opts = bracketOpts || {};
    if (opts.responder == null) opts.responder = (state.memo && state.memo.responder_name) || '';
    var filled = RulesEngine.fillBrackets(text, state.answers, opts);
    var out = String(filled == null ? '' : filled).replace(/\{(\w+)\}/g, function (whole, token) {
      var r = resolvePlaceholder(chain, token);
      var val = r && r.text != null ? String(r.text) : '';
      if (val === '') {
        if (OPTIONAL_PLACEHOLDERS[token]) return '';
        reportPlaceholderMiss(token, chain, text);
        return PLACEHOLDER_FALLBACK;
      }
      if (r.last_checked && !seen[token]) {
        seen[token] = true;
        used.push({ label: r.label, last_checked: r.last_checked, areaName: r.areaName });
      }
      return val;
    });
    return { text: out, used: used };
  }

  function nationalSharp7119Note(chain) {
    for (var i = 0; i < chain.length; i++) {
      var ec = chain[i].emergency_consult;
      if (ec && ec.sharp7119 && ec.sharp7119.note) return ec.sharp7119.note;
    }
    return null;
  }

  function sharp7119Menu(chain) {
    for (var i = 0; i < chain.length; i++) {
      var ec = chain[i].emergency_consult;
      var s7 = ec && ec.sharp7119;
      if (s7 && (s7.menu || s7.excluded)) return { menu: s7.menu || null, excluded: s7.excluded || null };
    }
    var areas = (state.data.areas && state.data.areas.areas) || [];
    for (var j = 0; j < areas.length; j++) {
      var a = areas[j];
      if (a.display_name === state.areaPref && a.emergency_consult && a.emergency_consult.sharp7119) {
        var ps7 = a.emergency_consult.sharp7119;
        if (ps7.menu || ps7.excluded) return { menu: ps7.menu || null, excluded: ps7.excluded || null };
      }
    }
    return { menu: null, excluded: null };
  }

  function resolveSharp7119(chain) {
    var mx = sharp7119Menu(chain);
    var code = PREF_CODE[state.areaPref] || null;
    var prefs = state.data.prefWindows && state.data.prefWindows.prefs;
    var p = code && prefs ? prefs[code] : null;
    var s7 = p && p.sharp7119;
    if (s7 && s7.available && s7.available !== 'unknown') {
      var src = s7, subName = null;
      if (Array.isArray(s7.subdivisions) && s7.subdivisions.length) {
        var mc = parseInt(muniCode(state.areaPref, state.areaMuni), 10);
        if (mc) {
          for (var i = 0; i < s7.subdivisions.length; i++) {
            var sd = s7.subdivisions[i];
            var hit = (sd.ranges || []).some(function (r) { return mc >= r[0] && mc <= r[1]; });
            if (hit) { src = sd; subName = sd.name; break; }
          }
        }
      }
      return {
        available: src.available,
        phone: src.phone || null,
        hours: src.hours || null,
        alt_phone: src.alt_phone || null,
        alt_phone_note: src.alt_phone_note || null,
        menu: mx.menu,
        excluded: mx.excluded,
        note: null,
        source_url: src.source_url || null,
        last_checked: p.checked_at || null,
        areaName: subName || p.name || state.areaPref || null
      };
    }
    return {
      available: 'unknown', phone: null, hours: null, alt_phone: null, alt_phone_note: null,
      menu: mx.menu, excluded: mx.excluded,
      note: nationalSharp7119Note(chain), source_url: null, last_checked: null, areaName: null
    };
  }

  function sharp7119Tel(chain) {
    var v = resolveSharp7119(chain);
    if (v.available !== 'yes') return '';
    var dial = String(v.phone || '#7119').replace(/[^0-9#+]/g, '');
    return dial ? '<a class="chip-tel" href="tel:' + esc(dial) + '">発信</a>' : '';
  }

  var SHARP7119_NO_BLOCK = [
    '急な病気やけがで「救急車を呼んだほうがいいのか」と迷ったときに、相談できる電話窓口です。看護師などが受けて、受診の目安を教えてくれます。',
    'ただし、全国どこでも使えるわけではありません。実施しているかどうかは都道府県や市町村によって違い、行っていない地域があります。',
    '調べたところ、お住まいの地域では見当たりませんでした。お住まいの市町村が独自に行っている場合もあるので、気になるときは市の窓口でお尋ねください。',
    '迷ったときは、Q助(全国どこでも使えるアプリ)か、かかりつけのお医者さんにご相談ください。命に関わりそうなときは、ためらわず119番へ。'
  ];

  function sharp7119CardBlock(chain) {
    var v = resolveSharp7119(chain);
    var inner = '';
    if (v.available === 'yes') {
      inner += '<p class="s7-line"><strong>' + esc(v.phone || '#7119') + '</strong>' + (v.hours ? '（受付時間: ' + esc(v.hours) + '）' : '') + '</p>';
      if (v.alt_phone) inner += '<p class="s7-alt">#が使えない回線用: <strong>' + esc(v.alt_phone) + '</strong>' + (v.alt_phone_note ? '（' + esc(v.alt_phone_note) + '）' : '') + '</p>';
    } else if (v.available === 'partial') {
      inner += '<p class="s7-line">お住まいの地域が対象か、県のページでご確認ください</p>';
      if (v.source_url) inner += '<p class="s7-link"><a href="' + esc(v.source_url) + '" target="_blank" rel="noopener noreferrer">県のページを見る</a></p>';
    } else if (v.available === 'no') {
      inner = SHARP7119_NO_BLOCK.map(function (p) { return '<p class="s7-no">' + esc(p) + '</p>'; }).join('');
    } else {
      if (v.note) inner += '<p class="s7-note">' + esc(v.note) + '</p>';
    }
    if (v.available === 'yes') {
      if (v.menu) inner += '<p class="s7-menu">' + esc(v.menu) + '</p>';
      if (v.excluded) inner += '<p class="s7-excluded">' + esc(v.excluded) + '</p>';
    }
    return inner ? '<div class="sharp7119-state">' + inner + '</div>' : '';
  }

  function checkedNote(used) {
    if (!used || !used.length) return '';
    var parts = used
      .filter(function (u) { return u.last_checked; })
      .map(function (u) { return esc(u.label) + '(' + esc(u.areaName) + ') 確認日: ' + esc(u.last_checked); });
    if (!parts.length) return '';
    return '<div class="checked-note"><span>' + parts.join('</span><span>') + '</span></div>';
  }

  function flattenQuestions() {
    var list = [];
    state.data.questions.blocks.forEach(function (block) {
      block.questions.forEach(function (q) {
        list.push({ id: q.id, text: q.text, type: q.type, options: q.options || null, hint: q.hint || null, optional: !!q.optional, blockTitle: block.title });
      });
    });
    return list;
  }

  var YN_OPTIONS = [
    { value: 'yes', label: 'はい' },
    { value: 'no', label: 'いいえ' },
    { value: 'unknown', label: 'わからない' }
  ];

  function renderQuestion() {
    var q = state.questions[state.index];
    var total = state.questions.length;
    var num = state.index + 1;
    $('progress-fill').style.width = Math.round((num / total) * 100) + '%';
    $('progress-block').textContent = q.blockTitle;
    $('progress-count').textContent = '質問 ' + num + ' / ' + total;

    var area = $('question-area');
    area.innerHTML = '';
    var h = document.createElement('div');
    h.className = 'q-text';
    h.textContent = q.text;
    area.appendChild(h);
    if (q.hint) {
      var qh = document.createElement('p');
      qh.className = 'q-hint q-hint-note';
      qh.textContent = q.hint;
      area.appendChild(qh);
    }

    if (q.type === 'yn_unknown') renderSingleChoice(area, q, YN_OPTIONS);
    else if (q.type === 'select') renderSingleChoice(area, q, q.options);
    else if (q.type === 'select_optional') renderSingleChoice(area, q, q.options, true);
    else if (q.type === 'age_optional') renderAge(area, q);
    else if (q.type === 'multi' || q.type === 'worry_multi') renderMulti(area, q);

    $('btn-back').textContent = state.index === 0 ? '← トップに戻る' : '← 戻る';
  }

  function skipButton(area) {
    var actions = document.createElement('div');
    actions.className = 'q-actions';
    var skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'btn btn-ghost';
    skip.textContent = '答えないで進む →';
    skip.addEventListener('click', function () { next(); });
    actions.appendChild(skip);
    area.appendChild(actions);
  }

  var AGE_BANDS = [
    { v: '60s', l: '60代' }, { v: '70s', l: '70代' }, { v: '80s', l: '80代' },
    { v: '90s', l: '90代' }, { v: '100plus', l: '100歳以上' }
  ];
  function renderAge(area, q) {
    var hint = document.createElement('p');
    hint.className = 'q-hint';
    hint.textContent = '当てはまるものを選んでください(だいたいで構いません)。';
    area.appendChild(hint);

    var current = state.answers[q.id];
    var isNum = current != null && /^\d+$/.test(String(current));

    var wrap = document.createElement('div');
    wrap.className = 'options age-chips';
    AGE_BANDS.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt-btn age-chip' + (current === b.v ? ' selected' : '');
      btn.textContent = b.l;
      btn.addEventListener('click', function () { state.answers[q.id] = b.v; next(); });
      wrap.appendChild(btn);
    });
    var skipChip = document.createElement('button');
    skipChip.type = 'button';
    skipChip.className = 'opt-btn age-chip age-skip';
    skipChip.textContent = '答えない';
    skipChip.addEventListener('click', function () { delete state.answers[q.id]; next(); });
    wrap.appendChild(skipChip);
    area.appendChild(wrap);

    var detail = document.createElement('div');
    detail.className = 'age-detail' + (isNum ? '' : ' hidden');
    var input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.min = '40';
    input.max = '115';
    input.step = '1';
    input.className = 'age-field';
    input.placeholder = '例: 80';
    if (isNum) input.value = current;

    var link = document.createElement('button');
    link.type = 'button';
    link.className = 'link-btn age-detail-link' + (isNum ? ' hidden' : '');
    link.textContent = '詳しく入力する';
    link.addEventListener('click', function () {
      detail.classList.remove('hidden');
      link.classList.add('hidden');
      if (input.value === '') input.value = '80';
      input.focus();
    });
    area.appendChild(link);

    var row = document.createElement('div');
    row.className = 'age-input';
    var unit = document.createElement('span');
    unit.className = 'age-unit';
    unit.textContent = '歳';
    row.appendChild(input);
    row.appendChild(unit);
    detail.appendChild(row);

    var actions = document.createElement('div');
    actions.className = 'q-actions';
    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-primary';
    nextBtn.textContent = '次へ →';
    nextBtn.addEventListener('click', function () {
      var v = input.value.trim();
      if (v !== '' && !isNaN(parseInt(v, 10))) {
        var n = Math.max(40, Math.min(115, parseInt(v, 10)));
        state.answers[q.id] = String(n);
      } else {
        delete state.answers[q.id];
      }
      next();
    });
    actions.appendChild(nextBtn);
    detail.appendChild(actions);
    area.appendChild(detail);
  }

  function renderSingleChoice(area, q, options, optional) {
    var hint = document.createElement('p');
    hint.className = 'q-hint';
    hint.textContent = '当てはまるものを1つ選んでください。選ぶと次に進みます。';
    area.appendChild(hint);
    var wrap = document.createElement('div');
    wrap.className = 'options';
    options.forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt-btn' + (state.answers[q.id] === opt.value ? ' selected' : '');
      b.textContent = opt.label;
      b.addEventListener('click', function () {
        state.answers[q.id] = opt.value;
        next();
      });
      wrap.appendChild(b);
    });
    area.appendChild(wrap);
    if (optional) skipButton(area);
  }

  function renderMulti(area, q) {
    var hint = document.createElement('p');
    hint.className = 'q-hint';
    hint.textContent = '当てはまるものをすべて選び、「次へ」を押してください。';
    area.appendChild(hint);
    var current = Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : [];
    var wrap = document.createElement('div');
    wrap.className = 'options';
    q.options.forEach(function (opt) {
      var label = document.createElement('label');
      label.className = 'multi-opt' + (current.indexOf(opt.value) !== -1 ? ' checked' : '');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = opt.value;
      cb.checked = current.indexOf(opt.value) !== -1;
      cb.addEventListener('change', function () {
        if (opt.value === 'none') {
          current = cb.checked ? ['none'] : [];
        } else {
          current = current.filter(function (v) { return v !== 'none'; });
          if (cb.checked) { if (current.indexOf(opt.value) === -1) current.push(opt.value); }
          else { current = current.filter(function (v) { return v !== opt.value; }); }
        }
        state.answers[q.id] = current;
        renderQuestion();
      });
      var span = document.createElement('span');
      span.textContent = opt.label;
      label.appendChild(cb);
      label.appendChild(span);
      wrap.appendChild(label);
    });
    area.appendChild(wrap);
    var actions = document.createElement('div');
    actions.className = 'q-actions';
    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-primary';
    nextBtn.textContent = '次へ →';
    nextBtn.addEventListener('click', function () {
      if (!Array.isArray(state.answers[q.id])) state.answers[q.id] = [];
      next();
    });
    actions.appendChild(nextBtn);
    area.appendChild(actions);
  }

  function next() {
    if (state.index < state.questions.length - 1) { state.index++; renderQuestion(); }
    else finishDiagnosis();
  }
  function back() {
    if (state.index === 0) show('screen-top');
    else { state.index--; renderQuestion(); }
  }

  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function computeDerived() {
    state.statuses = RulesEngine.deriveCardStatuses(state.answers);
    (state.completed || []).forEach(function (id) { if (state.statuses[id]) state.statuses[id] = 'available'; });
    state.flags = RulesEngine.deriveFlags(state.answers);
    state.mirror = RulesEngine.deriveMirror(state.answers);
    state.memo = loadMemo();
    state.diagnosed = Object.keys(state.answers).length > 0;
  }

  function finishDiagnosis() {
    state.completed = [];
    computeDerived();
    state.todoSnapshot = orderedPreparableCards();
    var existing = loadProfile();
    var profile = {
      profile_version: PROFILE_VERSION,
      area_id: state.areaId,
      area_pref: state.areaPref,
      area_muni: state.areaMuni,
      answers: state.answers,
      flags: state.flags,
      mirror: state.mirror,
      completed: [],
      todo_cards: state.todoSnapshot,
      created_at: existing && existing.created_at ? existing.created_at : todayStr(),
      updated_at: todayStr()
    };
    var saved = persist(STORAGE_KEY, JSON.stringify(profile));
    renderMirror(profile);
    show('screen-mirror');
    if (!saved) notifySaveFailed();
  }

  function renderMirror(profile) {
    if (!state.mirror) computeDerived();
    var mc = state.data.mirror;
    var a = state.answers;
    var chain = buildChain(profile.area_id);
    var areaName = (chain[0] && chain[0].area_type !== 'national') ? chain[0].display_name : '';

    var subject = mc.fact.relation_subject[a.q_parent_relation] || mc.fact.relation_subject['default'];
    var agePhrase = RulesEngine.ageDisplay(a.q_parent_age);
    var agePart = agePhrase ? '(' + esc(agePhrase) + ')' : '';
    var household = mc.fact.household[a.q_household] || '';
    var s1 = esc(subject) + agePart + 'は';
    if (areaName) s1 += esc(areaName) + 'で';
    s1 += (household ? esc(household) : 'お住まい') + 'です。';

    var s2parts = [];
    if (mc.fact.distance[a.q_my_distance]) s2parts.push('あなたのお住まいからは' + esc(mc.fact.distance[a.q_my_distance]));
    if (mc.fact.backup[a.q_backup_person]) s2parts.push(esc(mc.fact.backup[a.q_backup_person]));
    var s2 = s2parts.join('、');
    if (s2) s2 += '。';
    if (mc.fact.weekday[a.q_weekday_availability]) s2 += esc(mc.fact.weekday[a.q_weekday_availability]) + '。';

    var pat = mc.patterns[state.mirror.pattern] || mc.patterns['default'];
    var themeLabel = mc.theme_labels[state.mirror.theme] || '';

    var html = '';
    html += '<h2 class="mirror-h2">いまの、あなたの家の状況</h2>';
    html += '<div class="mirror-facts"><p>' + s1 + '</p>' + (s2 ? '<p>' + s2 + '</p>' : '') + '</div>';
    html += '<div class="mirror-implication">' + rich(pat.implication) + '</div>';
    html += '<div class="mirror-theme"><span class="mirror-theme-label">あなたの備えのテーマ</span>' +
      '<span class="mirror-theme-value">' + esc(themeLabel) + '</span></div>';
    html += '<p class="mirror-note">このあとの備えプランは、すべてこのテーマの答えとして並べています。</p>';
    html += '<div class="mirror-flow"><h3 class="mirror-flow-h">ここからの流れ</h3>';
    html += '<p><strong>① わが家を知る</strong>(いま終わりました)</p>';
    html += '<p><strong>② 備えを整える</strong>──このあと出てくる「やること」を、できるものから一つずつ。済んだら登録してください。</p>';
    html += '<p><strong>③ いざという時</strong>──何かあったら、右下の「いま困っている」を押すだけ。②で備えた分だけ、そこに出る手順があなたの家専用になっていきます。</p>';
    html += '</div>';
    $('mirror-area').innerHTML = html;
  }

  var PROFILE_VERSION = 3;
  function loadProfile() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || typeof p !== 'object' || p.profile_version !== PROFILE_VERSION) return null;
      return p;
    } catch (e) { return null; }
  }
  function loadMemo() {
    try { var raw = localStorage.getItem(MEMO_KEY); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
  }
  var SAVE_FAIL_MSG = '保存できませんでした。プライベートブラウズ中や、端末の空き容量が少ないときに起こることがあります。';
  var DIAG_LEAVE_MSG = '回答の途中です。このページを離れると、ここまでの回答が消えます。';
  function persist(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { return false; }
  }
  function notifySaveFailed(statusEl) {
    if (statusEl) { statusEl.textContent = SAVE_FAIL_MSG; return; }
    var root = $('toast-root');
    if (!root) return;
    var t = document.createElement('div');
    t.className = 'toast toast-error';
    var span = document.createElement('span');
    span.className = 'toast-msg';
    span.textContent = SAVE_FAIL_MSG;
    t.appendChild(span);
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', '閉じる');
    close.textContent = '×';
    close.addEventListener('click', function () { removeToast(t); });
    t.appendChild(close);
    root.appendChild(t);
    t._timer = setTimeout(function () { removeToast(t); }, 6000);
  }
  function saveMemo(memo) {
    return persist(MEMO_KEY, JSON.stringify(memo));
  }

  function cardById(id) {
    var arr = state.data.catalog.cards;
    for (var i = 0; i < arr.length; i++) if (arr[i].card_id === id) return arr[i];
    return null;
  }
  var CATEGORY_LABELS = null;

  function scriptBox(text, chain) {
    var s = substitute(text, chain);
    return '<div class="script-box">' +
      '<div class="script-label">そのまま言えばOK</div>' +
      '<p class="script-text">' + rich(s.text) + '</p>' +
      '<button type="button" class="btn btn-copy-script" data-copy="' + esc(s.text.replace(/\*\*/g, '')) + '">' + icon('copy') + ' コピー</button>' +
      '</div>';
  }

  function section(label, text, chain) {
    if (!text) return '';
    var s = substitute(text, chain);
    return '<div class="card-sec"><div class="card-sec-h">' + esc(label) + '</div>' +
      '<div class="card-sec-b">' + rich(s.text) + '</div>' + checkedNote(s.used) + '</div>';
  }

  function howtoBlocks(card, chain) {
    if (!card.howto || !card.howto.length) return '';
    var label = card.howto_label || 'やり方';
    var inner = '';
    card.howto.forEach(function (blk) {
      if (blk.t === 'script') inner += scriptBox(blk.text, chain);
      else { var s = substitute(blk.text, chain); inner += '<p class="card-p">' + rich(s.text) + '</p>' + checkedNote(s.used); }
    });
    return '<div class="card-sec"><div class="card-sec-h">' + esc(label) + '</div><div class="card-sec-b">' + inner + '</div></div>';
  }

  var COST_DISCLAIMER = null;

  function emgRoleHtml(card) {
    if (!card.emergency_role) return '';
    return '<div class="emg-role"><span class="emg-role-h">いざという時の出番:</span> ' + rich(card.emergency_role) + '</div>';
  }

  function faqLeads(faq, chain, gseen) {
    if (!faq.leads) return '';
    var techoHas = state.answers.q_techo === 'level12' || state.answers.q_techo === 'level3';
    var html = '';
    faq.leads.forEach(function (ld) {
      var match = false;
      if (ld.when_tax && state.answers.q_tax_status === ld.when_tax) match = true;
      if (ld.when_techo === 'has' && techoHas) match = true;
      if (!match) return;
      var s = substitute(ld.text, chain);
      html += '<div class="faq-lead">' + (ld.label ? '<span class="faq-lead-label">' + esc(ld.label) + '</span>' : '') +
        richG(s.text, gseen) + '</div>';
    });
    return html;
  }

  function faqBody(card, chain) {
    var faq = state.data.faq && state.data.faq.faq_cards[card.card_id];
    if (!faq) return unpreparedBody(card, chain);
    var gseen = {};
    var html = '<p class="faq-heading">' + esc(faq.heading) + '</p>';
    if (card.target) html += '<p class="card-target">対象: ' + rich(card.target) + '</p>';
    html += faqLeads(faq, chain, gseen);
    faq.blocks.forEach(function (b) {
      var s;
      if (b.t === 'q') { s = substitute(b.text, chain); html += '<p class="faq-q">' + richG(s.text, gseen) + '</p>'; }
      else if (b.t === 'a') { s = substitute(b.text, chain); html += '<p class="faq-a">' + richG(s.text, gseen) + '</p>' + checkedNote(s.used); }
      else if (b.t === 'script') { html += scriptBox(b.text, chain); }
      else if (b.t === 'apply') { s = substitute(b.text, chain); html += '<p class="faq-apply">→ ' + richG(s.text, gseen) + '</p>' + checkedNote(s.used); }
    });
    html += '<p class="cost-note">' + esc(COST_DISCLAIMER) + '</p>';
    html += emgRoleHtml(card);
    return html;
  }
  function hasFaq(cardId) {
    return !!(state.data.faq && state.data.faq.faq_cards && state.data.faq.faq_cards[cardId]);
  }

  function taxLimitsBlock(card, chain) {
    var tl = card.tax_limits;
    if (!tl) return '';
    var keys = RulesEngine.taxLimitKeys(state.answers.q_tax_status);
    var both = keys.length > 1;
    var html = '<div class="card-sec tax-limits"><div class="card-sec-h">' + esc(tl.label) + '</div><div class="card-sec-b">';
    if (both && tl.unknown_note) html += '<p class="tax-unknown">' + rich(tl.unknown_note) + '</p>';
    html += '<ul class="tax-list">';
    keys.forEach(function (k) {
      var prefix = both ? (k === 'hikazei' ? '非課税世帯: ' : '課税世帯: ') : '';
      html += '<li>' + esc(prefix) + rich(tl[k]) + '</li>';
    });
    html += '</ul><p class="cost-note">' + rich(tl.note) + '</p></div></div>';
    return html;
  }

  function appendixBlock(card, chain) {
    var ap = card.appendix;
    if (!ap) return '';
    var html = '<div class="card-sec card-appendix-sec"><div class="card-sec-h">' + esc(ap.label) + '</div><ul class="card-appendix">';
    (ap.items || []).forEach(function (it) { var s = substitute(it, chain); html += '<li>' + rich(s.text) + '</li>'; });
    html += '</ul></div>';
    return html;
  }

  function unpreparedBody(card, chain) {
    var html = '';
    if (card.card_id === 'sharp7119') html += sharp7119CardBlock(chain);
    if (card.target) html += '<p class="card-target">対象: ' + rich(card.target) + '</p>';
    html += section('起こり得ること', card.risk, chain);
    html += section(card.whatis_label || 'これは何か', card.whatis, chain);
    html += section(card.recommendation_label || 'おすすめの備え', card.recommendation, chain);
    (card.recommendation_script || []).forEach(function (t) { html += scriptBox(t, chain); });
    html += taxLimitsBlock(card, chain);
    if (card.cost) {
      var c = substitute(card.cost, chain);
      html += '<div class="card-sec"><div class="card-sec-h">費用の目安</div><div class="card-sec-b">' +
        rich(c.text) + '<p class="cost-note">' + esc(COST_DISCLAIMER) + '</p></div>' + checkedNote(c.used) + '</div>';
    }
    html += howtoBlocks(card, chain);
    html += appendixBlock(card, chain);
    if (card.emergency_role) html += '<div class="emg-role"><span class="emg-role-h">いざという時の出番:</span> ' + rich(card.emergency_role) + '</div>';
    return html;
  }

  var DISTANCE_LABEL = { within30: '30分以内', within60: '1時間以内', within120: '2時間以内', over: '当日中は難しい' };
  function bracketOptsFor(cardId) {
    var m = state.memo || {};
    if (cardId === 'family_responder') return { registered: m.responder_name || '', time: DISTANCE_LABEL[state.answers.q_my_distance] || '' };
    if (cardId === 'key_access') return { registered: m.key_location || '' };
    if (cardId === 'info_set') return { registered: m.info_location || '' };
    if (cardId === 'care_taxi') return { registered: m.care_taxi_name || '' };
    return {};
  }

  function preparedBody(card, chain) {
    var opts = bracketOptsFor(card.card_id);
    var html = '<p class="prepared-mark">' + icon('check') + ' すでに使える手札です</p>';
    if (card.prepared) { var p = substitute(card.prepared, chain, opts); html += '<div class="card-sec-b">' + rich(p.text) + '</div>'; }
    (card.prepared_script || []).forEach(function (t) { html += scriptBox(t, chain); });
    html += emgRoleHtml(card);
    return html;
  }

  function naBody(card, chain) {
    var html = '';
    if (card.not_applicable_note) html += '<p class="na-note">' + rich(card.not_applicable_note) + '</p>';
    if (card.emergency_role) html += '<div class="emg-role"><span class="emg-role-h">いざという時の出番:</span> ' + rich(card.emergency_role) + '</div>';
    return html;
  }

  function renderCard(card, chain, status, mode) {
    var cls = 'card card-' + (status || card.status_type);
    var badge = '';
    if (status === 'available' || card.status_type === 'always') badge = '<span class="badge-status badge-avail">使える</span>';
    else if (status === 'preparable') badge = '<span class="badge-status badge-prep">準備すれば使える</span>';
    else if (status === 'not_applicable') badge = '<span class="badge-status badge-na">今は対象外</span>';
    else if (status === 'knowledge' || card.status_type === 'knowledge') badge = '<span class="badge-status badge-knowledge">知っておく</span>';

    var body;
    if (mode === 'available') body = preparedBody(card, chain);
    else if (mode === 'na') body = naBody(card, chain);
    else if (mode === 'reference') body = unpreparedBody(card, chain);
    else if (hasFaq(card.card_id)) body = faqBody(card, chain);
    else body = unpreparedBody(card, chain);

    if (mode === 'available' || mode === 'na' || mode === 'reference') {
      return '<details id="card-' + esc(card.card_id) + '" class="' + cls + '"><summary class="card-summary">' +
        '<span class="card-name">' + esc(card.name) + '</span>' + badge + '</summary>' +
        '<div class="card-body">' + body + '</div></details>';
    }
    return '<div id="card-' + esc(card.card_id) + '" class="' + cls + '"><div class="card-head"><span class="card-name">' + esc(card.name) + '</span>' + badge + '</div>' +
      '<div class="card-body">' + body + '</div></div>';
  }

  function telLinkHtml(phone) {
    if (!phone) return '';
    var dial = String(phone).replace(/[^0-9#+]/g, '');
    if (!dial) return '';
    return '<a href="tel:' + esc(dial) + '">' + esc(phone) + '</a>';
  }
  function compactDone(card) {
    var res = RulesEngine.emergencyResource(card.card_id, state.memo, 'available');
    var nameHtml = '';
    if (res && res.registered) {
      nameHtml = ' <span class="done-name">' + esc((res.prefix || '') + res.name);
      if (res.phone) nameHtml += ' ' + telLinkHtml(res.phone);
      nameHtml += '</span>';
    }
    return '<div class="done-line"><span class="done-check">' + icon('check') + ' 済</span> <strong>' + esc(card.name) + '</strong>' + nameHtml +
      (card.emergency_role ? '<div class="done-role">いざという時: ' + rich(card.emergency_role) + '</div>' : '') + '</div>';
  }

  function renderThemeCards(themeId, chain, used) {
    var mc = state.data.mirror;
    var ids = (mc.theme_cards && mc.theme_cards[themeId]) || [];
    var body = '';
    ids.forEach(function (id) {
      if (used[id]) return;
      var card = cardById(id);
      if (!card) return;
      if (card.status_type === 'derived') {
        var st = state.statuses[id];
        if (st === 'not_applicable') return;
        used[id] = true;
        body += st === 'available' ? compactDone(card) : renderCard(card, chain, 'preparable', 'open');
      } else if (card.status_type === 'knowledge') {
        used[id] = true;
        body += renderCard(card, chain, 'knowledge', 'open');
      } else if (card.status_type === 'always') {
        used[id] = true;
        body += renderCard(card, chain, 'always', 'open');
      } else if (card.status_type === 'special') {
        return;
      }
    });
    return body;
  }

  function renderResult(profile) {
    if (!state.statuses || !Object.keys(state.statuses).length) computeDerived();
    if (!state.mirror) computeDerived();
    var chain = buildChain(profile.area_id);
    var container = $('result-area');
    var cards = state.data.catalog.cards;
    var mc = state.data.mirror;
    var used = {};

    var derivedAvail = [], derivedPrep = [], derivedNa = [];
    cards.forEach(function (c) {
      if (c.status_type !== 'derived') return;
      var st = state.statuses[c.card_id];
      if (st === 'available') derivedAvail.push(c);
      else if (st === 'preparable') derivedPrep.push(c);
      else derivedNa.push(c);
    });
    var CONDITIONAL_IDS = ['fukushi_taxi_ken', 'fukushi_yusho', 'parking_permit'];
    var always = cards.filter(function (c) { return c.status_type === 'always'; });
    var knowledge = cards.filter(function (c) { return c.status_type === 'knowledge' && CONDITIONAL_IDS.indexOf(c.card_id) === -1; });
    var yushoEligible = RulesEngine.fukushiYushoEligible(state.answers);
    var yushoCard = cardById('fukushi_yusho');
    var taxiKenEligible = RulesEngine.fukushiTaxiKenEligible(state.answers);
    var parkingEligible = RulesEngine.parkingPermitEligible(state.answers);
    var conditional = cards.filter(function (c) {
      if (c.card_id === 'fukushi_taxi_ken') return !taxiKenEligible;
      if (c.card_id === 'fukushi_yusho') return !yushoEligible;
      if (c.card_id === 'parking_permit') return !parkingEligible;
      return false;
    });
    if (yushoEligible && yushoCard) derivedPrep.push(yushoCard);
    var self21 = cardById('self_down_plan');
    var worries = Array.isArray(state.answers.q_worries) ? state.answers.q_worries : [];

    var html = '';
    html += '<h2 class="result-h2">あなたの備えプラン</h2>';
    var themeLabel = mc.theme_labels[state.mirror.theme] || '';
    html += '<div class="theme-banner"><span class="theme-banner-label">テーマ</span> ' + esc(themeLabel) +
      ' <button type="button" id="btn-back-mirror" class="link-btn">状況の鏡を見直す</button></div>';
    var availCount = derivedAvail.length + always.length;
    html += '<p class="summary-line">いま使える手札 <strong>' + availCount + '枚</strong> / 準備すれば増える手札 <strong>' + derivedPrep.length + '枚</strong></p>';

    var cmCard = cardById('care_manager');
    if (cmCard && state.statuses.care_manager === 'preparable' && !used.care_manager) {
      used.care_manager = true;
      html += '<div class="group group-pin">';
      html += '<h3 class="group-h">まず、ここから — 介護のすべての入口</h3>';
      html += renderCard(cmCard, chain, 'preparable', 'open');
      html += '</div>';
    }

    if (worries.indexOf('w_work') !== -1) {
      var wl = cardById('work_leave');
      if (wl && !used.work_leave) {
        used.work_leave = true;
        html += '<div class="group group-pin">';
        html += '<h3 class="group-h">仕事と両立するために — まず知っておく制度</h3>';
        html += renderCard(wl, chain, 'knowledge', 'open');
        html += '</div>';
      }
    }

    var themeOrder = [state.mirror.theme];
    worries.forEach(function (w) {
      var t = mc.worry_theme[w];
      if (t && themeOrder.indexOf(t) === -1) themeOrder.push(t);
    });
    themeOrder.forEach(function (themeId, idx) {
      var body = renderThemeCards(themeId, chain, used);
      if (!body) return;
      var label = mc.theme_labels[themeId] || '';
      var heading = idx === 0 ? 'このテーマの備え — ' + label : '気がかりへの備え — ' + label;
      html += '<div class="group group-theme"><h3 class="group-h">' + esc(heading) + '</h3>' + body + '</div>';
    });

    var otherAvail = derivedAvail.filter(function (c) { return !used[c.card_id]; });
    var otherAlways = always.filter(function (c) { return !used[c.card_id]; });
    var otherPrep = derivedPrep.filter(function (c) { return !used[c.card_id]; });
    var otherKnow = knowledge.filter(function (c) { return !used[c.card_id]; });

    if (otherPrep.length) {
      html += '<div class="group"><h3 class="group-h">＋ そのほか、準備すれば使える手札</h3>';
      otherPrep.forEach(function (c) { html += renderCard(c, chain, 'preparable', 'open'); });
      html += '</div>';
    }
    if (otherKnow.length) {
      var moneyPri = RulesEngine.moneyPriorityCards(state.answers);
      if (moneyPri.length) {
        otherKnow = otherKnow.slice().sort(function (a, b) {
          var ia = moneyPri.indexOf(a.card_id); ia = ia === -1 ? 999 : ia;
          var ib = moneyPri.indexOf(b.card_id); ib = ib === -1 ? 999 : ib;
          return ia - ib;
        });
      }
      html += '<div class="group" id="group-money"><h3 class="group-h">知らないと損する制度</h3>';
      html += '<p class="group-note">使う・使わないの前に、知っておくだけで選択肢が変わります。</p>';
      otherKnow.forEach(function (c) { html += renderCard(c, chain, 'knowledge', 'open'); });
      html += '</div>';
    }

    var promotedIds = [];
    if (taxiKenEligible && cardById('fukushi_taxi_ken')) promotedIds.push('fukushi_taxi_ken');
    if (parkingEligible && cardById('parking_permit')) promotedIds.push('parking_permit');
    if (promotedIds.length) {
      html += '<div class="group group-pin"><h3 class="group-h">' + icon('car') + '使える可能性のある補助 — 手帳をお持ちの方</h3>';
      promotedIds.forEach(function (id) { html += renderCard(cardById(id), chain, 'knowledge', 'open'); });
      html += '</div>';
    }

    if (otherAvail.length) {
      html += '<div class="group"><h3 class="group-h">' + icon('check') + 'すでに使える手札(登録内容を家族と共有しておきましょう)</h3>';
      otherAvail.forEach(function (c) { html += renderCard(c, chain, 'available', 'available'); });
      html += '</div>';
    }
    if (otherAlways.length) {
      html += '<div class="group"><h3 class="group-h">' + icon('phone') + 'いつでも使える相談・受診の窓口</h3>';
      html += '<p class="group-note">申し込み不要で、いざという時にそのまま使えます。タップして中身を確認しておきましょう。</p>';
      otherAlways.forEach(function (c) { html += renderCard(c, chain, 'always', 'reference'); });
      html += '</div>';
    }

    if (self21 && !used.self_down_plan) {
      used.self_down_plan = true;
      html += '<div class="group group-self-down"><h3 class="group-h">あなたが倒れたときの引き継ぎ(念のため)</h3>';
      html += renderCard(self21, chain, 'special', 'open');
      html += '</div>';
    }

    html += '<div class="group">';
    html += '<details class="fold-group"><summary class="fold-group-h">対象の方向けの制度(手帳をお持ちの方・移動の支援)</summary><div class="fold-group-body">';
    conditional.forEach(function (c) { html += renderCard(c, chain, 'knowledge', 'open'); });
    html += '</div></details>';
    html += '</div>';

    var otherNa = derivedNa.filter(function (c) { return !used[c.card_id]; });
    if (otherNa.length) {
      html += '<div class="group">';
      html += '<details class="fold-group"><summary class="fold-group-h">今は対象外の手札(' + otherNa.length + '枚) — 条件が変われば使えます</summary><div class="fold-group-body">';
      otherNa.forEach(function (c) { html += renderCard(c, chain, 'not_applicable', 'na'); });
      html += '</div></details>';
      html += '</div>';
    }

    html += '<div class="group"><details class="fold-group"><summary class="fold-group-h">すべての制度・サービスを見る(' + cards.length + '枚の一覧)</summary><div class="fold-group-body">';
    cards.forEach(function (c) {
      var st = c.status_type === 'derived' ? state.statuses[c.card_id] : null;
      var mode = st === 'available' ? 'available' : (st === 'not_applicable' ? 'na' : 'open');
      var statusArg = c.status_type === 'derived' ? st : c.status_type;
      html += renderCard(c, chain, statusArg, mode);
    });
    html += '</div></details></div>';

    html += renderBlueprint();

    html += '<p class="mame-entry"><button type="button" class="link-btn link-mame">' + icon('chevron') + ' 現場で知った小さなこと(番外編)</button></p>';

    html += '<h2 class="result-h2">家族に送るテキスト(引き継ぎ書)</h2>';
    html += '<p class="result-intro">下の文章をコピーして、LINEやメールで家族に共有できます。あなたが倒れたときの引き継ぎ書としても使えます。</p>';
    var familyText = buildFamilyText(profile, chain, derivedAvail, derivedPrep);
    html += '<div class="share-box">';
    html += '<textarea id="share-text" class="share-text" readonly rows="14">' + esc(familyText) + '</textarea>';
    html += '<div class="share-actions"><button type="button" id="btn-copy" class="btn btn-secondary">' + icon('copy') + ' テキストをコピー</button>';
    html += '<span id="copy-status" class="copy-status" role="status"></span></div></div>';

    html += '<div class="emg-cta"><p>ケアマネさんや駆けつけ役の名前・電話を<strong>体制メモ</strong>に登録しておくと、緊急時ガイドが「○○さんに電話」と固有名で案内します。</p>';
    html += '<button type="button" id="btn-goto-memo" class="btn btn-secondary">体制メモを開く</button></div>';

    html += '<div class="emg-cta"><p>いざという時は、このページの下ではなく<strong>【場面別ガイド】</strong>を開いてください。ブックマーク・印刷しておくと安心です。</p>';
    html += '<button type="button" id="btn-goto-emergency" class="btn btn-primary">場面別ガイドを開く</button></div>';

    container.innerHTML = html;

    var copyBtn = $('btn-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () { copyText(familyText, 'copy-status'); });
    var gotoEmg = $('btn-goto-emergency');
    if (gotoEmg) gotoEmg.addEventListener('click', function () { openEmergency(); });
    var gotoMemo = $('btn-goto-memo');
    if (gotoMemo) gotoMemo.addEventListener('click', function () { openMemo(); });
    var backMirror = $('btn-back-mirror');
    if (backMirror) backMirror.addEventListener('click', function () { renderMirror(profile); show('screen-mirror'); });
  }

  function activeScenes() {
    return state.data.scenes.scenes;
  }

  function openEmergency() {
    if (!state.statuses || !Object.keys(state.statuses).length) computeDerived();
    state.memo = loadMemo();
    var banner = $('danger-banner');
    banner.innerHTML = '<span class="db-icon">' + icon('phone') + '</span> ' + rich(state.data.scenes.danger_banner.text);
    var choices = $('scene-choices');
    choices.innerHTML = '';
    activeScenes().forEach(function (sc) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene-btn';
      b.innerHTML = '<span class="scene-illus">' + illus(SCENE_ILLUS[sc.scene_id] || '') + '</span>' +
        '<span class="scene-label">' + esc(sc.title) + '</span>';
      b.addEventListener('click', function () {
        choices.querySelectorAll('.scene-btn').forEach(function (x) { x.classList.remove('selected'); });
        b.classList.add('selected');
        renderScene(sc);
      });
      choices.appendChild(b);
    });
    $('scene-detail').innerHTML = '<p class="scene-placeholder">場面を選ぶと、あなたの手札で組み立てた手順が表示されます。</p>';
    show('screen-emergency');
  }

  function renderScene(scene) {
    var chain = buildChain(state.areaId);
    var detail = $('scene-detail');
    if (scene.branches) {
      var def = RulesEngine.defaultCaregiverBranch(state.answers);
      renderBranchedScene(scene, def, chain);
      return;
    }
    var lead = scene.lead ? '<p class="scene-lead">' + rich(scene.lead) + '</p>' : '';
    detail.innerHTML = '<h3 class="scene-title">' + esc(scene.title) + '</h3>' + lead + renderSteps(scene.steps, chain, scene.scene_id);
  }

  function renderBranchedScene(scene, branchId, chain) {
    var detail = $('scene-detail');
    var html = '<h3 class="scene-title">' + esc(scene.title) + '</h3>';
    html += '<p class="branch-prompt">' + esc(scene.branch_prompt || 'どちらの状況ですか?') + '</p>';
    html += '<div class="branch-choices">';
    scene.branches.forEach(function (b) {
      html += '<button type="button" class="branch-btn' + (b.branch_id === branchId ? ' selected' : '') +
        '" data-branch="' + esc(b.branch_id) + '">' + esc(b.label) + '</button>';
    });
    html += '</div>';
    var branch = scene.branches.filter(function (b) { return b.branch_id === branchId; })[0] || scene.branches[0];
    html += renderSteps(branch.steps, chain, scene.scene_id);
    detail.innerHTML = html;
    detail.querySelectorAll('.branch-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        renderBranchedScene(scene, btn.getAttribute('data-branch'), chain);
      });
    });
  }

  function renderSteps(steps, chain, sceneId) {
    var html = '<ol class="steps">';
    steps.forEach(function (st) {
      var sid = sceneId ? ' id="step-' + esc(sceneId) + '-' + st.step + '"' : '';
      html += '<li class="step"' + sid + '><div class="step-title">' + esc(st.title) + '</div>';
      html += '<div class="step-instruction">' + rich(st.instruction) + '</div>';
      var chips = (st.cards || []).map(function (id) { return cardChip(id, chain); }).filter(Boolean);
      if (chips.length) html += '<div class="step-cards">' + chips.join('') + '</div>';
      html += '</li>';
    });
    html += '</ol>';
    return html;
  }

  function cardChip(id, chain) {
    var card = cardById(id);
    if (!card) return '';
    if (!state.diagnosed) {
      var t0 = '';
      if (id === 'call_119') t0 = '<a class="chip-tel" href="tel:119">発信</a>';
      else if (id === 'sharp7119') { if (resolveSharp7119(chain).available === 'no') return ''; t0 = sharp7119Tel(chain); }
      return '<span class="chip chip-info">' + esc(card.name) + t0 + '</span>';
    }
    var st = state.statuses[id];
    if (card.status_type === 'derived' && st === 'not_applicable') return '';
    var res = RulesEngine.emergencyResource(id, state.memo, st);
    var cls = 'chip';
    var label = esc(card.name);
    var suffix = '';
    var tel = '';
    if (id === 'call_119') { cls += ' chip-info'; tel = '<a class="chip-tel" href="tel:119">発信</a>'; }
    else if (id === 'sharp7119') { if (resolveSharp7119(chain).available === 'no') return ''; cls += ' chip-info'; tel = sharp7119Tel(chain); }
    else if (res && res.registered) {
      cls += ' chip-avail';
      if (res.name) label += '<span class="chip-name">' + esc((res.prefix || '') + res.name) + '</span>';
      if (res.phone) {
        var dial = String(res.phone).replace(/[^0-9#+]/g, '');
        if (dial) tel = '<a class="chip-tel" href="tel:' + esc(dial) + '">発信</a>';
      }
    } else if (card.status_type === 'derived' && st === 'preparable') {
      cls += ' chip-prep';
      suffix = '<button type="button" class="chip-goto" data-goto-card="' + esc(id) + '">(未準備)→備える</button>';
    } else if (card.status_type === 'derived' && st === 'available') {
      cls += ' chip-avail';
    } else {
      cls += ' chip-info';
    }
    return '<span class="' + cls + '">' + label + suffix + tel + '</span>';
  }

  function buildFamilyText(profile, chain, avail, prep) {
    var L = [];
    L.push('【親の急変への備え／引き継ぎメモ】');
    L.push('(作成: ' + profile.updated_at + ' / とおまもり)');
    L.push('もし私が動けないときは、このメモに沿って対応してください。');
    L.push('');
    L.push('■ いま使える手札(すでに備えあり)');
    if (avail.length === 0) L.push('・(登録済みの手札はまだありません)');
    avail.forEach(function (c) { L.push('・' + c.name); });
    L.push('');
    L.push('■ これから準備する手札(未準備)');
    if (prep.length === 0) L.push('・(大きな不足はありません)');
    prep.forEach(function (c) { L.push('・' + c.name + (c.recommendation ? ' … ' + firstLine(substitute(c.recommendation, chain).text) : '')); });
    L.push('');
    L.push('■ 連絡先・場所(分かる範囲で追記してください)');
    var s7yes = resolveSharp7119(chain).available === 'yes';
    L.push(s7yes ? '・救急: 119 / 救急電話相談: #7119' : '・救急: 119');
    var houkatsu = resolvePlaceholder(chain, 'chiiki_houkatsu');
    if (houkatsu) L.push('・地域包括支援センター: ' + houkatsu.text);
    L.push('・ケアマネジャー: (連絡先を記入)');
    var vn = state.memo || {};
    var vnParts = [vn.visiting_nurse_name, vn.visiting_nurse_phone].filter(Boolean);
    L.push(vnParts.length ? '・訪問看護: ' + vnParts.join(' / ') : '・訪問看護: (連絡先を記入)');
    L.push('・かかりつけ医: (連絡先を記入)');
    L.push('・家に入る手段(鍵/キーボックス番号): (記入)');
    L.push('・保険証・お薬手帳・介護保険証の場所: (記入)');
    L.push('・駆けつけ役(誰が・何分で): (記入)');
    L.push('');
    L.push(s7yes ? '※命に関わる症状・判断に迷うときは、ためらわず 119 / #7119 / かかりつけ医へ。' : '※命に関わる症状・判断に迷うときは、ためらわず 119 / かかりつけ医へ。');
    L.push('※このメモは家族で共有してください。');
    return L.join('\n');
  }
  function firstLine(t) { var i = String(t).indexOf('\n'); return (i === -1 ? String(t) : String(t).slice(0, i)); }

  function copyText(text, statusId) {
    var status = statusId ? $(statusId) : null;
    function done() { if (status) { status.textContent = 'コピーしました'; setTimeout(function () { if (status) status.textContent = ''; }, 3000); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    else fallback();
    function fallback() {
      var ta = $('share-text');
      if (ta) { ta.focus(); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} }
    }
  }

  function bindScriptCopy() {
    document.body.addEventListener('click', function (e) {
      var btn = e.target;
      if (btn && btn.classList && btn.classList.contains('link-mame')) {
        e.preventDefault();
        openMame();
        return;
      }
      if (btn && btn.classList && btn.classList.contains('glossary-term')) {
        e.preventDefault();
        openGlossary(btn.getAttribute('data-term'));
        return;
      }
      if (btn && btn.classList && btn.classList.contains('glossary-goto')) {
        e.preventDefault();
        closeGlossary();
        gotoCardInResult(btn.getAttribute('data-goto-card'));
        return;
      }
      if (btn && btn.classList && btn.classList.contains('bp-link') && btn.getAttribute('data-scroll')) {
        e.preventDefault();
        scrollToSection(btn.getAttribute('data-scroll'));
        return;
      }
      if (btn && btn.classList && (btn.classList.contains('chip-goto') || (btn.classList.contains('bp-link') && btn.getAttribute('data-goto-card')))) {
        e.preventDefault();
        gotoCardInResult(btn.getAttribute('data-goto-card'));
        return;
      }
      if (btn && btn.classList && btn.classList.contains('btn-copy-script')) {
        var text = btn.getAttribute('data-copy') || '';
        var t = document.createElement('textarea');
        t.value = text;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(flash, flash);
        } else {
          document.body.appendChild(t); t.select();
          try { document.execCommand('copy'); } catch (e2) {}
          document.body.removeChild(t); flash();
        }
        function flash() {
          var old = btn.textContent;
          btn.textContent = 'コピーしました';
          setTimeout(function () { btn.textContent = old; }, 2000);
        }
      }
    });
  }

  function openMemo() {
    state.memo = loadMemo();
    renderMemoForm();
    show('screen-memo');
  }
  function renderMemoForm() {
    var form = $('memo-form');
    var m = state.memo || {};
    var html = '';
    MEMO_FIELDS.forEach(function (g) {
      html += '<fieldset class="memo-group"><legend>' + esc(g.group) + '</legend>';
      g.fields.forEach(function (f) {
        var val = m[f.key] != null ? m[f.key] : '';
        var maxlen = f.tel ? 20 : (f.wide ? 200 : 50);
        html += '<label class="memo-label">' + esc(f.label) +
          '<input type="' + (f.tel ? 'tel' : 'text') + '" class="memo-input' + (f.wide ? ' memo-wide' : '') +
          '" data-key="' + esc(f.key) + '" maxlength="' + maxlen + '" value="' + esc(val) + '" /></label>';
      });
      html += '</fieldset>';
    });
    form.innerHTML = html;
  }
  function collectMemo() {
    var form = $('memo-form');
    var m = {};
    form.querySelectorAll('.memo-input').forEach(function (inp) {
      var v = inp.value.trim();
      if (v) m[inp.getAttribute('data-key')] = v;
    });
    return m;
  }
  function backToResult() {
    var p = loadProfile();
    if (p) { restoreProfile(p); renderResult(p); show('screen-result'); }
    else show('screen-top');
  }
  function gotoCardInResult(cardId) {
    var p = loadProfile();
    if (p) { restoreProfile(p); renderResult(p); }
    show('screen-result');
    setTimeout(function () {
      var el = document.getElementById('card-' + cardId);
      if (el) { if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('card-flash'); }
    }, 60);
  }


  function firstSentence(t) {
    t = String(t == null ? '' : t);
    var i = t.indexOf('。');
    return i === -1 ? t : t.slice(0, i + 1);
  }

  function orderedPreparableCards() {
    return RulesEngine.orderedPreparableCards(state.answers, state.data.catalog, state.data.mirror, state.completed);
  }

  function computeProgress() {
    var snap = (state.todoSnapshot && state.todoSnapshot.length) ? state.todoSnapshot : orderedPreparableCards();
    var completed = state.completed || [];
    var doneCards = snap.filter(function (id) { return completed.indexOf(id) !== -1; }).length;
    var memoGroups = recommendedMemoGroups();
    var doneMemo = memoGroups.filter(function (g) { return memoGroupFilled(state.memo, g); }).length;
    return { x: doneCards + doneMemo, y: snap.length + memoGroups.length };
  }

  function nextMoveCard() {
    var ordered = orderedPreparableCards();
    return ordered.length ? cardById(ordered[0]) : null;
  }

  function saveProgress() {
    var p = loadProfile() || {};
    p.completed = state.completed;
    p.todo_cards = state.todoSnapshot;
    p.updated_at = todayStr();
    return persist(STORAGE_KEY, JSON.stringify(p));
  }

  function openHome() {
    var p = loadProfile();
    if (!p) { show('screen-top'); return; }
    try {
      restoreProfile(p);
      renderHome();
      show('screen-home');
    } catch (e) {
      show('screen-top');
    }
  }

  function renderHome() {
    if (!state.statuses || !Object.keys(state.statuses).length) computeDerived();
    var chain = buildChain(state.areaId);
    var next = nextMoveCard();
    var html = '';
    html += '<h2 class="result-h2">わが家の備え</h2>';
    if (next) {
      var recSrc = next.recommendation || next.risk || '';
      var oneLine = firstSentence(substitute(recSrc, chain).text);
      html += '<div class="next-move">';
      html += '<div class="next-move-label">あなたの次の一手</div>';
      html += '<div class="next-move-name">' + esc(next.name) + '</div>';
      html += '<p class="next-move-desc">' + rich(oneLine) + '</p>';
      html += '<div class="next-move-actions">';
      html += '<button type="button" class="btn btn-primary" data-nm-howto="' + esc(next.card_id) + '">やり方を見る</button>';
      html += '<button type="button" class="btn btn-secondary" data-nm-done="' + esc(next.card_id) + '">済んだので登録する</button>';
      html += '</div></div>';
    } else {
      html += '<div class="next-move next-move-done">';
      html += '<p class="nm-done-title"><strong>わが家の備えは、ひと通り整いました。</strong></p>';
      html += '<p>あとは「生きた状態」に保つこと──状況が変わったら再診断を。いざという時は下のボタンから。</p>';
      html += '</div>';
    }
    html += '<div class="home-links">';
    html += '<button type="button" id="home-all" class="link-btn">すべての備えを見る(処方一覧へ)</button>';
    html += '<button type="button" id="home-memo" class="link-btn">体制メモ</button>';
    html += '<button type="button" id="home-restart" class="link-btn">もう一度診断する</button>';
    html += '<button type="button" id="home-delete" class="link-btn link-danger">データ削除</button>';
    html += '</div>';
    $('home-area').innerHTML = html;

    var area = $('home-area');
    area.querySelectorAll('[data-nm-howto]').forEach(function (b) {
      b.addEventListener('click', function () { gotoCardInResult(b.getAttribute('data-nm-howto')); });
    });
    area.querySelectorAll('[data-nm-done]').forEach(function (b) {
      b.addEventListener('click', function () { markCardDone(b.getAttribute('data-nm-done')); });
    });
    $('home-all').addEventListener('click', function () { var p = loadProfile(); if (p) { restoreProfile(p); renderResult(p); show('screen-result'); } });
    $('home-memo').addEventListener('click', openMemo);
    $('home-restart').addEventListener('click', startDiagnosis);
    $('home-delete').addEventListener('click', deleteData);
  }

  function markCardDone(cardId) {
    if (state.completed.indexOf(cardId) === -1) state.completed.push(cardId);
    var saved = saveProgress();
    computeDerived();
    showCompletionToast(cardId);
    renderHome();
    renderStepBand('2');
    if (!saved) notifySaveFailed();
  }

  var STEP_META = [
    { key: '1', label: 'わが家を知る', illus: 'step-home' },
    { key: '2', label: '備えを整える', illus: 'step-prepare' },
    { key: '3', label: 'いざという時', illus: 'step-emergency' }
  ];
  function renderStepBand(active) {
    var band = $('step-band');
    if (!band) return;
    if (!loadProfile()) { band.classList.add('hidden'); return; }
    band.classList.remove('hidden');
    var prog;
    try { prog = computeProgress(); } catch (e) { prog = { x: 0, y: 0 }; }
    var html = '';
    STEP_META.forEach(function (s, i) {
      if (i > 0) html += '<span class="step-arrow" aria-hidden="true">→</span>';
      var cls = 'step-item' + (s.key === active ? ' step-active' + (active === '3' ? ' step-active-emg' : '') : '');
      var extra = (s.key === '2') ? '<span class="step-extra">(' + prog.x + '/' + prog.y + ')</span>' : '';
      html += '<button type="button" class="' + cls + '" data-step="' + s.key + '">' +
        '<span class="step-illus">' + illus(s.illus) + '</span>' +
        '<span class="step-label">' + esc(s.label) + extra + '</span></button>';
    });
    band.innerHTML = html;
    band.querySelectorAll('.step-item').forEach(function (btn) {
      btn.addEventListener('click', function () { navStep(btn.getAttribute('data-step')); });
    });
  }
  function navStep(step) {
    var p = loadProfile();
    if (!p) { if (step === '3') panicOpen(); return; }
    restoreProfile(p);
    if (step === '1') { renderMirror(p); show('screen-mirror'); }
    else if (step === '2') { renderResult(p); show('screen-result'); }
    else if (step === '3') { openEmergency(); }
  }

  function findSceneStepForCard(cardId) {
    var scenes = state.data.scenes.scenes;
    for (var i = 0; i < scenes.length; i++) {
      var sc = scenes[i];
      if (sc.steps) {
        for (var j = 0; j < sc.steps.length; j++) {
          if ((sc.steps[j].cards || []).indexOf(cardId) !== -1) return { sceneId: sc.scene_id, title: sc.title, step: sc.steps[j].step };
        }
      }
      if (sc.branches) {
        for (var b = 0; b < sc.branches.length; b++) {
          var stps = sc.branches[b].steps || [];
          for (var k = 0; k < stps.length; k++) {
            if ((stps[k].cards || []).indexOf(cardId) !== -1) return { sceneId: sc.scene_id, title: sc.title, step: stps[k].step, branch: sc.branches[b].branch_id };
          }
        }
      }
    }
    return null;
  }

  function showCompletionToast(cardId) {
    var card = cardById(cardId);
    var loc = findSceneStepForCard(cardId);
    if (!loc) { showToast('「' + (card ? card.name : '') + '」を準備済みにしました', null); return; }
    var res = RulesEngine.emergencyResource(cardId, state.memo, 'available');
    var msg;
    if (res && res.registered && res.name) {
      msg = '緊急時ガイドが更新されました: 「' + loc.title + '」の手順' + loc.step + 'が「' + (res.prefix || '') + res.name + 'へ発信」になりました';
    } else {
      msg = '「' + loc.title + '」の手順' + loc.step + 'の(未準備)が消えました';
    }
    showToast(msg, loc);
  }

  function showToast(msg, loc) {
    var root = $('toast-root');
    if (!root) return;
    var t = document.createElement('div');
    t.className = 'toast';
    var ic = document.createElement('span');
    ic.className = 'toast-icon';
    ic.innerHTML = icon('check');
    t.appendChild(ic);
    var span = document.createElement('span');
    span.className = 'toast-msg';
    span.textContent = msg;
    t.appendChild(span);
    if (loc) {
      var see = document.createElement('button');
      see.type = 'button';
      see.className = 'toast-see';
      see.textContent = '見てみる';
      see.addEventListener('click', function () { removeToast(t); openEmergencyToStep(loc); });
      t.appendChild(see);
    }
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', '閉じる');
    close.textContent = '×';
    close.addEventListener('click', function () { removeToast(t); });
    t.appendChild(close);
    root.appendChild(t);
    t._timer = setTimeout(function () { removeToast(t); }, 5000);
  }
  function removeToast(t) {
    if (t && t.parentNode) { if (t._timer) clearTimeout(t._timer); t.parentNode.removeChild(t); }
  }

  function openEmergencyToStep(loc) {
    openEmergency();
    setTimeout(function () {
      var scenes = state.data.scenes.scenes;
      var idx = scenes.map(function (s) { return s.scene_id; }).indexOf(loc.sceneId);
      var btns = document.querySelectorAll('#scene-choices .scene-btn');
      if (btns[idx]) btns[idx].click();
      setTimeout(function () {
        var el = document.getElementById('step-' + loc.sceneId + '-' + loc.step);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('step-flash'); }
      }, 70);
    }, 70);
  }

  function openCaregiverDownB() {
    var p = loadProfile();
    if (p) restoreProfile(p);
    else { state.answers = {}; state.completed = []; computeDerived(); }
    openEmergency();
    var list = activeScenes();
    var idx = list.map(function (s) { return s.scene_id; }).indexOf('scene_caregiver_down');
    if (idx === -1) return;
    var btns = document.querySelectorAll('#scene-choices .scene-btn');
    btns.forEach(function (x) { x.classList.remove('selected'); });
    if (btns[idx]) btns[idx].classList.add('selected');
    renderBranchedScene(list[idx], 'B', buildChain(state.areaId));
  }

  function panicOpen() {
    var p = loadProfile();
    if (p) { restoreProfile(p); }
    else { state.answers = {}; state.completed = []; computeDerived(); }
    openEmergency();
  }

  function openGlossary(term) {
    var g = state.data.glossary;
    if (!g) return;
    var entry = g.terms.filter(function (t) { return t.term === term; })[0];
    if (!entry) return;
    $('glossary-title').textContent = entry.name;
    var gseen = {};
    gseen[entry.term] = true;
    var body = '<div class="glossary-def">' + richG(entry.def, gseen) + '</div>';
    if (entry.ref_card) {
      body += '<p class="glossary-ref"><button type="button" class="link-btn glossary-goto" data-goto-card="' +
        esc(entry.ref_card) + '">→ 詳しくは「' + esc(entry.ref_label || '') + '」へ</button></p>';
    }
    body += '<p class="cost-note">' + esc(g.disclaimer) + '</p>';
    $('glossary-body').innerHTML = body;
    $('glossary-modal').classList.remove('hidden');
  }
  function closeGlossary() { $('glossary-modal').classList.add('hidden'); }

  function renderBlueprint() {
    var gseen = {};
    var h = '<div class="group blueprint"><h2 class="result-h2">この先の見取り図──「もしも」の先まで</h2>';
    h += '<p>' + rich('いま整えている備えは、在宅の生活を守るためのものです。でも、いつか在宅では支えきれない日が来るかもしれません。そのときの出口も、先に見ておきましょう。**出口があると分かっていることが、今日の安心になります。**') + '</p>';
    h += '<div class="bp-item"><p>' + richG('**もし、要介護が重くなったら**──特別養護老人ホーム(特養)という公的な受け皿があります(原則要介護3以上)。「施設=高い」は思い込みで、非課税世帯なら軽減制度で**月6〜8万円台**、年金の範囲に収まる場合もあります。', gseen) +
      ' <button type="button" class="link-btn bp-link" data-goto-card="shisetsu_okane">→ 詳しくは「施設のお金の真実」のカードへ</button></p></div>';
    h += '<div class="bp-item"><p>' + rich('**もし、介護のお金が家計を圧迫し始めたら**──月の上限(高額介護サービス費)、年の合算(高額医療・介護合算)、税の控除(障害者控除対象者認定書)。**削る前に、戻す制度を全部使う。**') +
      ' <button type="button" class="link-btn bp-link" data-scroll="group-money">→ 「お金と制度」のカード群へ</button></p></div>';
    h += '<div class="bp-item"><p>' + rich('**もし、あなたが先に動けなくなったら**──引き継ぎテキストと緊急ショートステイ。') +
      ' <button type="button" class="link-btn bp-link" data-goto-card="self_down_plan">→ 「あなたが倒れたときの引き継ぎ」のカードへ</button></p></div>';
    h += '<p>' + rich('全部をいま読む必要はありません。**「出口はある」──それだけ覚えて、①②の備えに戻ってください。**') + '</p>';
    h += '</div>';
    return h;
  }
  function scrollToSection(id) {
    var el = document.getElementById(id);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('card-flash'); }
  }

  function currentScreen() {
    for (var i = 0; i < SCREENS.length; i++) {
      var el = $(SCREENS[i]);
      if (el && !el.classList.contains('hidden')) return SCREENS[i];
    }
    return 'screen-top';
  }
  function renderMame() {
    var m = state.data.mame;
    var html = '<div class="mame-door-illus">' + illus('mame-door') + '</div>';
    html += '<h2 class="result-h2">' + esc(m.title) + '</h2>';
    html += '<p class="mame-intro">' + rich(m.intro) + '</p>';
    html += '<p class="mame-note">' + esc(m.note_line) + '</p>';
    m.items.filter(function (it) { return !it.hidden; }).forEach(function (it) {
      html += '<details class="mame-item"><summary class="mame-summary">' + esc(it.title) +
        (it.experience ? '<span class="mame-exp">〔開発者の体験から〕</span>' : '') + '</summary>' +
        '<div class="mame-body">' + rich(it.body) + '</div></details>';
    });
    $('mame-area').innerHTML = html;
  }
  function openMame() {
    state.mameReturn = currentScreen();
    renderMame();
    show('screen-mame');
  }

  function openAbout() {
    var sig = $('about-signature');
    if (sig) sig.textContent = SIGNATURE;
    show('screen-about');
  }

  function startDiagnosis() {
    state.index = 0;
    state.answers = {};
    state.questions = flattenQuestions();
    renderQuestion();
    show('screen-diagnosis');
  }

  function restoreProfile(profile) {
    state.areaId = profile.area_id || 'national';
    state.areaPref = profile.area_pref || '';
    state.areaMuni = profile.area_muni || '';
    state.answers = profile.answers || {};
    state.completed = Array.isArray(profile.completed) ? profile.completed.slice() : [];
    state.todoSnapshot = Array.isArray(profile.todo_cards) ? profile.todo_cards.slice() : [];
    computeDerived();
    if (!state.todoSnapshot.length) state.todoSnapshot = orderedPreparableCards();
  }

  function bindTopControls() {
    COST_DISCLAIMER = state.data.catalog.cost_disclaimer;
    CATEGORY_LABELS = state.data.catalog.category_labels;
    bindAreaSelects();
    updateTopPrimary();
    var siteTitle = $('site-title');
    if (siteTitle) siteTitle.addEventListener('click', function () { show('screen-top'); });
    var globalBack = $('btn-global-back');
    if (globalBack) globalBack.addEventListener('click', goBack);
    var homeBtn = $('home-btn');
    if (homeBtn) homeBtn.addEventListener('click', function () { show('screen-top'); });
    try { window.history.replaceState({ screen: 'screen-top' }, ''); } catch (e) {}
    window.addEventListener('beforeunload', function (e) {
      if (currentScreen() === 'screen-diagnosis' && Object.keys(state.answers).length >= 1) {
        e.preventDefault();
        e.returnValue = DIAG_LEAVE_MSG;
        return DIAG_LEAVE_MSG;
      }
    });
    window.addEventListener('popstate', function (e) {
      var id = e.state && e.state.screen ? e.state.screen : 'screen-top';
      if (id === 'screen-result') { var p = loadProfile(); if (p) { restoreProfile(p); renderResult(p); } }
      showRaw(id);
    });
    $('btn-back').addEventListener('click', back);
    $('btn-restart').addEventListener('click', startDiagnosis);
    $('btn-delete').addEventListener('click', deleteData);
    $('btn-emergency-back').addEventListener('click', function () {
      var p = loadProfile();
      if (p) { renderResult(p); show('screen-result'); } else show('screen-top');
    });

    $('btn-mirror-next').addEventListener('click', function () {
      var p = loadProfile() || { area_id: state.areaId, answers: state.answers };
      renderResult(p);
      show('screen-result');
    });
    $('btn-mirror-back').addEventListener('click', function () {
      if (state.questions.length) { state.index = state.questions.length - 1; renderQuestion(); show('screen-diagnosis'); }
      else show('screen-top');
    });

    var linkAbout = $('link-about');
    if (linkAbout) linkAbout.addEventListener('click', openAbout);
    $('btn-about-back').addEventListener('click', function () { show('screen-top'); });

    $('btn-mame-back').addEventListener('click', function () {
      var ret = state.mameReturn || 'screen-top';
      if (ret === 'screen-result') { var p = loadProfile(); if (p) { restoreProfile(p); renderResult(p); } }
      show(ret);
    });

    $('btn-open-memo').addEventListener('click', openMemo);
    $('btn-memo-back').addEventListener('click', backToResult);
    $('btn-memo-save').addEventListener('click', function () {
      var oldMemo = loadMemo();
      state.memo = collectMemo();
      var saved = saveMemo(state.memo);
      var s = $('memo-status');
      if (!saved) { notifySaveFailed(s); return; }
      var newly = MEMO_FIELDS.filter(function (g) { return memoGroupFilled(state.memo, g) && !memoGroupFilled(oldMemo, g); });
      if (newly.length) {
        var cid = MEMO_GROUP_CARD[newly[0].group];
        var loc = findSceneStepForCard(cid);
        var res = RulesEngine.emergencyResource(cid, state.memo, state.statuses[cid] || 'available');
        if (loc && res && res.name) {
          showToast('緊急時ガイドが更新されました: 「' + loc.title + '」の手順' + loc.step + 'が「' + (res.prefix || '') + res.name + 'へ発信」になりました', loc);
        }
      }
      if (s) { s.textContent = '保存しました'; setTimeout(function () { if (s) s.textContent = ''; }, 3000); }
    });
    $('btn-memo-clear').addEventListener('click', function () {
      try { localStorage.removeItem(MEMO_KEY); } catch (e) {}
      state.memo = {};
      renderMemoForm();
      var s = $('memo-status');
      if (s) { s.textContent = '消去しました'; setTimeout(function () { if (s) s.textContent = ''; }, 3000); }
    });

    ['link-self-down-quote', 'link-caregiver-down'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('click', function (e) { e.preventDefault(); openCaregiverDownB(); });
    });

    $('panic-btn').addEventListener('click', panicOpen);

    $('glossary-close').addEventListener('click', closeGlossary);
    $('glossary-backdrop').addEventListener('click', closeGlossary);

    var profile = loadProfile();
    if (profile) {
      $('resume-box').classList.remove('hidden');
      state.areaId = profile.area_id || 'national';
      state.areaPref = profile.area_pref || '';
      state.areaMuni = profile.area_muni || '';
      restoreAreaSelects();
      $('btn-resume').addEventListener('click', function () { var p = loadProfile() || profile; restoreProfile(p); renderResult(p); show('screen-result'); });
      $('btn-emergency-top').addEventListener('click', function () { var p = loadProfile() || profile; restoreProfile(p); openEmergency(); });
      openHome();
    }
  }

  function deleteData() {
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(MEMO_KEY); } catch (e) {}
    state.answers = {};
    state.statuses = {};
    state.completed = [];
    state.todoSnapshot = [];
    state.memo = {};
    state.diagnosed = false;
    $('resume-box').classList.add('hidden');
    var band = $('step-band'); if (band) band.classList.add('hidden');
    show('screen-top');
  }

  function fetchJSON(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('読み込み失敗: ' + url + ' (' + res.status + ')');
      return res.json();
    });
  }

  function init() {
    bindScriptCopy();
    Promise.all([
      fetchJSON('data/preparedness_questions.json'),
      fetchJSON('data/preparedness_rules.json'),
      fetchJSON('data/options_catalog.json'),
      fetchJSON('data/emergency_scenes.json'),
      fetchJSON('data/areas.json'),
      fetchJSON('data/mirror_copy.json'),
      fetchJSON('data/card_faq_v3.json'),
      fetchJSON('data/glossary.json'),
      fetchJSON('data/mame.json'),
      fetchJSON('data/municipalities.json'),
      fetchJSON('data/area_windows.json').catch(function () { return null; }),
      fetchJSON('data/pref_windows.json').catch(function () { return null; }),
      fetchJSON('data/verified_windows.json').catch(function () { return null; })
    ]).then(function (res) {
      state.data.questions = res[0];
      state.data.rules = res[1];
      state.data.catalog = res[2];
      state.data.scenes = res[3];
      state.data.areas = res[4];
      state.data.mirror = res[5];
      state.data.faq = res[6];
      state.data.glossary = res[7];
      state.data.mame = res[8];
      state.data.municipalities = res[9];
      state.data.areaWindows = res[10];
      state.data.prefWindows = res[11];
      state.data.verifiedWindows = res[12];
      bindTopControls();
    }).catch(function (err) {
      if (window.console && console.error) console.error(err);
      var html = '<div class="privacy-box">' +
        'データを読み込めませんでした。お手数ですが、ページを再読み込みしてください。';
      if (location.protocol === 'file:') {
        html += '<br>この画面は <code>file://</code> では動作しません。' +
          'README の起動方法(<code>npx serve</code> 等)でローカルサーバー経由で開いてください。';
      }
      html += '<div class="load-error-actions">' +
        '<button type="button" id="btn-reload" class="btn btn-secondary">再読み込み</button></div></div>';
      $('main').insertAdjacentHTML('afterbegin', html);
      var rb = $('btn-reload');
      if (rb) rb.addEventListener('click', function () { location.reload(); });
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      _state: state,
      buildChain: buildChain,
      areaIdFor: areaIdFor,
      resolvePlaceholder: resolvePlaceholder,
      substitute: substitute,
      resolveSharp7119: resolveSharp7119,
      sharp7119CardBlock: sharp7119CardBlock,
      renderWindowList: renderWindowList,
      renderPrefSection: renderPrefSection,
      areaWinSummaryLabel: areaWinSummaryLabel,
      hasVerifiedContent: hasVerifiedContent,
      PLACEHOLDER_DEFS: PLACEHOLDER_DEFS,
      OPTIONAL_PLACEHOLDERS: OPTIONAL_PLACEHOLDERS,
      PLACEHOLDER_FALLBACK: PLACEHOLDER_FALLBACK
    };
  }
})();
