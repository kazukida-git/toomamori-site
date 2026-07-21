/*
 * とおまもり — 選択肢カタログ型 画面制御(1ページSPA)
 * docs/options_catalog_spec_v2.md / docs/card_copy_v1.md / card_copy_v2_additions.md / landing_copy_v1.md に準拠。
 *
 * 責務:
 *  - data/*.json の読み込み(fetch)
 *  - 質問(18問+q_self_down_backup)を1問ずつ表示
 *  - RulesEngine でカード状態・フラグ・既定分岐を導出
 *  - 平時ビュー「あなたの手札一覧」/ 緊急時ビュー「場面別ガイド」を描画
 *  - 地域プレースホルダ解決(municipality → prefecture → national)
 *  - localStorage(ecn_preparedness_profile)保存・再表示・削除
 *
 * 制約: カード文言は data/options_catalog.json の原文をそのまま表示する。
 * 独自の医学的助言・事業者名・追記はしない。電話番号は tel: リンク。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ecn_preparedness_profile';
  var MEMO_KEY = 'ecn_care_memo';

  // 設定値(仕様4.3 §2-4)。未整備地域の「追加リクエスト」送信先。
  //   REQUEST_FORM_URL: 事前入力URL方式。基底URLの末尾(entry.NNN=)に市区町村名を
  //     encodeURIComponent して連結する(requestUrl 参照)。別パラメータは付加しない。
  //   未設定のときは REQUEST_MAIL_TO への mailto にフォールバックする。
  //   送信するのは市区町村名だけ。診断の回答・体制メモは一切載せない。
  // 設定済み(2026-07-20・事前入力URL方式): Googleフォームの質問1(entry.147722481)に
  //   都道府県付きの市区町村名を事前入力する。REQUEST_MAIL_TO は未使用(空のまま)。
  var CONFIG = {
    REQUEST_FORM_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSfNdQkHPwUGusWBU_m6ZH34dwqKXDpPm0AhbnyxSaL44XT4Vg/viewform?usp=pp_url&entry.147722481=',
    REQUEST_MAIL_TO: ''
  };

  var state = {
    areaId: 'national',
    areaPref: '',   // 選択された都道府県名(表示・検索リンク用)
    areaMuni: '',   // 選択された市区町村名(表示・検索リンク用)
    questions: [],
    index: 0,
    answers: {},
    data: { questions: null, rules: null, catalog: null, scenes: null, areas: null, mirror: null, faq: null, glossary: null, municipalities: null },
    statuses: {},
    flags: {},
    mirror: null,
    memo: {},
    completed: [],     // [済んだので登録する]で準備済みにしたカードID(進捗)
    todoSnapshot: [],  // 診断時点の未準備カードID(進捗の分母固定用)
    diagnosed: false
  };

  // 体制メモ(固有名)の項目定義。docs/planner_spec_v3.md 5章。
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

  // 体制メモの各グループ ↔ カードの対応(進捗・トースト用)。
  var MEMO_GROUP_CARD = {
    'ケアマネジャー': 'care_manager',
    '駆けつけ役': 'family_responder',
    '介護タクシー': 'care_taxi',
    'ヘルパー事業所': 'helper_office',
    'かかりつけ医': 'family_doctor',
    '鍵': 'key_access',
    '情報セット': 'info_set'
  };
  var PROGRESS_KEY = 'ecn_preparedness_profile'; // 進捗は profile 内に保存(削除対象に含める)

  // ---- Phase 4.2: 線画アイコン(絵文字の置き換え。色/太さは CSS .icon で制御) ----
  var ICONS = {
    phone: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    car: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 13l2-5.2A2 2 0 0 1 6.9 6.5h10.2a2 2 0 0 1 1.9 1.3L21 13v5h-3v-2H6v2H3z"/><circle cx="7.5" cy="16" r="1.6"/><circle cx="16.5" cy="16" r="1.6"/></svg>',
    check: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12.5l5 5 11-11"/></svg>',
    chevron: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7"/></svg>',
    copy: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>'
  };
  function icon(name) { return ICONS[name] || ''; }

  // ---- Phase 4.2: 挿絵9点(自作SVG・線画。人物なし)。docs/phase4_2_spec.md 仕様4 ----
  // 色はコンテナ側(.step-illus 等)の color を継承(currentColor)。差し色のみ深緑を明示。
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
  // 場面ID → 挿絵の対応(仕様4.5-4.8)
  var SCENE_ILLUS = {
    scene_no_answer: 'scene-phone',
    scene_fever: 'scene-fever',
    scene_fall: 'scene-fall',
    scene_caregiver_down: 'scene-handover'
  };

  // 体制メモのグループが「入力済み」か(いずれかのフィールドに値)。
  function memoGroupFilled(memo, group) {
    return group.fields.some(function (f) { return memo && memo[f.key]; });
  }
  // 利用者に推奨する体制メモ項目(対応カードが not_applicable でないグループ)。
  function recommendedMemoGroups() {
    var base = RulesEngine.deriveCardStatuses(state.answers); // 上書き前の素の状態
    return MEMO_FIELDS.filter(function (g) {
      var cid = MEMO_GROUP_CARD[g.group];
      var card = cardById(cid);
      if (!card) return false;
      if (card.status_type !== 'derived') return true; // 導出外(常時)は推奨に含める
      return base[cid] !== 'not_applicable';
    });
  }

  // プレースホルダ: token → 地域オブジェクトからの取得方法・表示文言
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
      display: function (o) { return o.name; }
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
    }
  };

  // ------- DOM ヘルパー -------
  function $(id) { return document.getElementById(id); }

  var SCREENS = ['screen-top', 'screen-home', 'screen-diagnosis', 'screen-mirror', 'screen-result', 'screen-emergency', 'screen-memo', 'screen-about', 'screen-mame'];

  // 署名(屋号決定まで暫定)。ここ一箇所で差し替え可能(docs/phase3_1_patch.md E-3)。
  // 仕様4.3 §1: {signature}機構は維持し、この文をデフォルト表示にする。
  var SIGNATURE = '埼玉県川口市から始めました。ここで確かめながら、全国へ広げていきます。';

  // 各画面 → 3ステップ帯のハイライト位置
  var SCREEN_STEP = { 'screen-mirror': '1', 'screen-home': '2', 'screen-result': '2', 'screen-memo': '2', 'screen-emergency': '3' };

  // 画面を切り替える本体。履歴には触らない(popstate からも使う)。
  function showRaw(screenId) {
    SCREENS.forEach(function (id) {
      var el = $(id);
      if (el) el.classList.toggle('hidden', id !== screenId);
    });
    var band = $('step-band');
    if (SCREEN_STEP[screenId] && loadProfile()) renderStepBand(SCREEN_STEP[screenId]);
    else if (band) band.classList.add('hidden');
    // トップを開くたびに第一ボタンの文言・遷移先を状態に合わせる(仕様5.2)
    if (screenId === 'screen-top') updateTopPrimary();
    // 「← 戻る」帯とホームボタンはトップ以外で出す(仕様4.3 §4-2)
    var bar = $('back-bar');
    if (bar) bar.classList.toggle('hidden', screenId === 'screen-top');
    var homeBtn = $('home-btn');
    if (homeBtn) homeBtn.classList.toggle('hidden', screenId === 'screen-top');
    window.scrollTo(0, 0);
  }

  // 画面遷移。ブラウザ履歴に1エントリ積むので、端末の戻るとも整合する(仕様4.3 §4-2)。
  function show(screenId) {
    if (currentScreen() !== screenId) {
      try { window.history.pushState({ screen: screenId }, ''); } catch (e) {}
    }
    showRaw(screenId);
  }

  // 直前の画面へ。ブラウザ履歴を1つ戻す(popstate 経由で showRaw が走る)。
  function goBack() {
    var st = window.history.state;
    if (st && st.screen && currentScreen() !== 'screen-top') window.history.back();
    else showRaw('screen-top');
  }

  // トップの第一ボタン: 診断済みなら「わが家の備えに戻る」→ホーム、未診断なら診断開始(仕様5.2)
  function updateTopPrimary() {
    var btn = $('btn-start');
    if (!btn) return;
    if (loadProfile()) {
      btn.textContent = 'わが家の備えに戻る';
      btn.onclick = function () { openHome(); };
    } else {
      btn.textContent = '5分で、わが家の手札を確認する';
      btn.onclick = startDiagnosis;
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ------- 表示層の変換(データ原文は書き換えない: 仕様4.3 §5 #12 / §2-2) -------

  // 退役した場面ID。options_catalog.json の原文「scene_immobile(連絡が取れない)」より、
  // 現行の scene_no_answer(電話に出ない・様子が分からない)に対応づける。
  var SCENE_ALIAS = { scene_immobile: 'scene_no_answer' };

  function sceneTitleById(id) {
    var real = SCENE_ALIAS[id] || id;
    var list = (state.data.scenes && state.data.scenes.scenes) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].scene_id === real) return list[i].title;
    }
    return null;
  }

  // 文中の scene_xxx を場面の日本語名に置き換える(表示時のみ)
  function sceneNames(text) {
    return String(text == null ? '' : text).replace(/scene_[a-z_]+/g, function (id) {
      var t = sceneTitleById(id);
      return t ? '「' + t + '」' : id;
    });
  }

  // 全国フォールバックの案内を、選択された市区町村名で個人化する
  function personalizeArea(text) {
    if (!state.areaMuni) return text;
    return String(text == null ? '' : text).replace(/\(市区町村名\)/g, state.areaMuni);
  }

  function searchUrl(q) {
    return 'https://www.google.com/search?q=' + encodeURIComponent(q);
  }

  // 「◯◯」で検索 → 検索リンクに組み立てる(esc 済みHTMLに対して適用)
  function linkifySearch(html) {
    return html.replace(/「([^「」]+)」で検索/g, function (whole, q) {
      return '<a href="' + searchUrl(q) + '" target="_blank" rel="noopener noreferrer">「' + q + '」で検索</a>';
    });
  }

  // **強調** を <strong> に。tel: リンク化。改行を <br>。
  function boldMd(escaped) {
    return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
  function linkifyPhones(escaped) {
    var re = /(#7119|0\d{1,4}-\d{1,4}-\d{3,4}|\b119\b)/g;
    return escaped.replace(re, function (m) {
      return '<a href="tel:' + m + '">' + m + '</a>';
    });
  }
  // リッチテキスト(表示用): 場面名・地域の個人化 → エスケープ → 強調 → 電話/検索リンク → 改行
  function rich(text) {
    return linkifySearch(linkifyPhones(boldMd(esc(sceneNames(personalizeArea(text)))))).replace(/\n/g, '<br>');
  }

  // 用語辞典(glossary)の語を本文中でタップ可能にする汎用機構。
  // rich() 済みHTMLに対し、seen で語ごとに最初の1回だけボタン化(既存タグ内は避ける)。
  function linkGlossary(html, seen) {
    var g = state.data.glossary;
    if (!g || !g.terms) return html;
    // 長い語から処理(部分一致の取りこぼし防止)
    var terms = g.terms.slice().sort(function (a, b) { return b.term.length - a.term.length; });
    terms.forEach(function (t) {
      if (seen[t.term]) return;
      var idx = html.indexOf(t.term);
      if (idx === -1) return;
      // 直近の '<' と '>' を見て、タグの内側なら避ける(単純判定)
      var before = html.slice(0, idx);
      var lt = before.lastIndexOf('<'), gt = before.lastIndexOf('>');
      if (lt > gt) return; // タグ属性内など → スキップ(次のブロックで拾う)
      seen[t.term] = true;
      var btn = '<button type="button" class="glossary-term" data-term="' + esc(t.term) + '">' + esc(t.term) + '</button>';
      html = html.slice(0, idx) + btn + html.slice(idx + t.term.length);
    });
    return html;
  }
  // rich + 用語リンク(seen は呼び出し側でカード単位に保持)
  function richG(text, seen) {
    return linkGlossary(rich(text), seen || {});
  }

  // ------- 地域選択(全国: 都道府県 → 市区町村。仕様4.3 §2) -------

  // areas.json に窓口情報がある市区町村だけが「整備済み」。
  // 「都道府県名|市区町村名」→ area_id の対応表を作る。
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

  // 追加リクエストの送信先。市区町村名だけを載せる(仕様4.3 §2-4)。
  // 事前入力URL方式: 基底URL(…entry.NNN=)の末尾に都道府県付きの市区町村名を
  // encodeURIComponent して連結。市名が無い文脈(実際には存在しない)では空値のまま
  // → 素の viewform が開く。別パラメータの付加はしない。
  function requestUrl(pref, muni) {
    var name = (pref || '') + (muni || '');
    if (CONFIG.REQUEST_FORM_URL) {
      return CONFIG.REQUEST_FORM_URL + encodeURIComponent(name);
    }
    return 'mailto:' + CONFIG.REQUEST_MAIL_TO +
      '?subject=' + encodeURIComponent('地域の追加リクエスト: ' + name) +
      '&body=' + encodeURIComponent(name);
  }

  function renderAreaNotice() {
    var box = $('area-notice');
    if (!box) return;
    if (!state.areaMuni) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    var muni = state.areaMuni;
    var supported = state.areaId !== 'national';
    if (supported) {
      box.innerHTML = '<p class="area-ready">' + esc(muni) + 'の窓口情報をご案内できます。</p>';
      return;
    }
    // 未整備地域の案内(承認済み文言)
    var html = '';
    html += '<p>' + esc(muni) + 'の詳しい窓口情報は、まだ準備中です。<strong>下のボタンから追加をリクエストできます。</strong>' +
      'いただいたリクエストから数日以内に追加し、次にお越しいただいたときに反映されています。' +
      'それまでの間も、診断・備えプラン・緊急時ガイドはすべてお使いいただけます</p>';
    html += '<ul class="area-links">';
    html += '<li><a href="' + searchUrl(muni + ' 地域包括支援センター') + '" target="_blank" rel="noopener noreferrer">「' + esc(muni) + ' 地域包括支援センター」で検索</a></li>';
    html += '<li><a href="' + searchUrl(muni + ' 公式サイト') + '" target="_blank" rel="noopener noreferrer">「' + esc(muni) + ' 公式サイト」で検索</a></li>';
    html += '</ul>';
    html += '<p><a id="area-request" class="area-request" href="' + esc(requestUrl(state.areaPref, muni)) + '" target="_blank" rel="noopener noreferrer">' + esc(muni) + 'の追加リクエストを送る</a></p>';
    box.innerHTML = html;
  }

  function renderMuniOptions(pref) {
    var sel = $('area-muni');
    if (!sel) return;
    var list = [];
    ((state.data.municipalities && state.data.municipalities.prefectures) || []).forEach(function (p) {
      if (p.name === pref) list = p.municipalities;
    });
    var html = '<option value="">市区町村を選ぶ</option>';
    list.forEach(function (m) { html += '<option value="' + esc(m) + '">' + esc(m) + '</option>'; });
    sel.innerHTML = html;
    sel.disabled = !list.length;
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
    });
    muni.addEventListener('change', function () {
      state.areaMuni = muni.value;
      state.areaId = state.areaMuni ? areaIdFor(state.areaPref, state.areaMuni) : 'national';
      renderAreaNotice();
    });
  }

  // 保存済みプロフィールから地域選択の見た目を復元する
  function restoreAreaSelects() {
    var pref = $('area-pref'), muni = $('area-muni');
    if (!pref || !muni || !state.areaPref) return;
    pref.value = state.areaPref;
    renderMuniOptions(state.areaPref);
    if (state.areaMuni) muni.value = state.areaMuni;
    renderAreaNotice();
  }

  // ------- 地域解決 -------
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

  // 【】(回答値)を差し込んでから {token}(地域値)を解決。未解決トークンは空文字に。
  //   bracketOpts: 準備済みカード用の { registered, time }(任意)
  function substitute(text, chain, bracketOpts) {
    var used = [];
    var seen = {};
    var opts = bracketOpts || {};
    // 【駆けつけ役】は体制メモの登録名(なければ「駆けつけ役の方」)に解決する。
    if (opts.responder == null) opts.responder = (state.memo && state.memo.responder_name) || '';
    var filled = RulesEngine.fillBrackets(text, state.answers, opts);
    var out = String(filled == null ? '' : filled).replace(/\{(\w+)\}/g, function (whole, token) {
      var r = resolvePlaceholder(chain, token);
      if (!r) return '';
      if (r.last_checked && !seen[token]) {
        seen[token] = true;
        used.push({ label: r.label, last_checked: r.last_checked, areaName: r.areaName });
      }
      return r.text == null ? '' : r.text;
    });
    return { text: out, used: used };
  }

  function checkedNote(used) {
    if (!used || !used.length) return '';
    var parts = used
      .filter(function (u) { return u.last_checked; })
      .map(function (u) { return esc(u.label) + '(' + esc(u.areaName) + ') 確認日: ' + esc(u.last_checked); });
    if (!parts.length) return '';
    return '<div class="checked-note"><span>' + parts.join('</span><span>') + '</span></div>';
  }

  // ------- 質問フロー -------
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

    // 10歳刻みチップ + 答えない
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

    // 詳しく入力する(数値欄・折りたたみ)
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
      if (input.value === '') input.value = '80'; // 空欄時は80から開始(矢印の起点)
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

  // ------- 判定 & 保存 -------
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function computeDerived() {
    state.statuses = RulesEngine.deriveCardStatuses(state.answers);
    // 完了登録(済んだので登録する)されたカードは準備済み扱いに上書き
    (state.completed || []).forEach(function (id) { if (state.statuses[id]) state.statuses[id] = 'available'; });
    state.flags = RulesEngine.deriveFlags(state.answers);
    state.mirror = RulesEngine.deriveMirror(state.answers);
    state.memo = loadMemo();
    state.diagnosed = Object.keys(state.answers).length > 0;
  }

  function finishDiagnosis() {
    state.completed = [];
    computeDerived();
    state.todoSnapshot = orderedPreparableCards(); // 進捗の分母(未準備カード)を固定
    var existing = loadProfile();
    var profile = {
      profile_version: PROFILE_VERSION,
      area_id: state.areaId,
      area_pref: state.areaPref,   // 未整備地域でも案内を個人化するため名称を保存(仕様4.3 §2-2)
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

  // ------- 状況の鏡 + テーマ宣言 -------
  function renderMirror(profile) {
    if (!state.mirror) computeDerived();
    var mc = state.data.mirror;
    var a = state.answers;
    var chain = buildChain(profile.area_id);
    var areaName = (chain[0] && chain[0].area_type !== 'national') ? chain[0].display_name : '';

    // 文1: 親の状況(続柄+年齢+世帯+地域)
    var subject = mc.fact.relation_subject[a.q_parent_relation] || mc.fact.relation_subject['default'];
    var agePhrase = RulesEngine.ageDisplay(a.q_parent_age); // 「87歳」/「80代」/ null
    var agePart = agePhrase ? '(' + esc(agePhrase) + ')' : '';
    var household = mc.fact.household[a.q_household] || '';
    var s1 = esc(subject) + agePart + 'は';
    if (areaName) s1 += esc(areaName) + 'で';
    s1 += (household ? esc(household) : 'お住まい') + 'です。';

    // 文2: 駆けつけ体制(距離+バックアップ+平日)
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
    // ここからの流れ(Phase 3.2 仕様5)
    html += '<div class="mirror-flow"><h3 class="mirror-flow-h">ここからの流れ</h3>';
    html += '<p><strong>① わが家を知る</strong>(いま終わりました)</p>';
    html += '<p><strong>② 備えを整える</strong>──このあと出てくる「やること」を、できるものから一つずつ。済んだら登録してください。</p>';
    html += '<p><strong>③ いざという時</strong>──何かあったら、右下の「いま困っている」を押すだけ。②で備えた分だけ、そこに出る手順があなたの家専用になっていきます。</p>';
    html += '</div>';
    $('mirror-area').innerHTML = html;
  }

  // 現行のプロフィール形式バージョン。これ以外は未診断として安全に扱う(監査バッチ1-2)。
  var PROFILE_VERSION = 3;
  function loadProfile() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      // 解釈不能(非オブジェクト)・旧バージョンは未診断扱い。既存データは破壊しない(消さない)。
      if (!p || typeof p !== 'object' || p.profile_version !== PROFILE_VERSION) return null;
      return p;
    } catch (e) { return null; }
  }
  function loadMemo() {
    try { var raw = localStorage.getItem(MEMO_KEY); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
  }
  // 保存失敗時の承認済み文言(監査バッチ1-1)。一字一句そのまま。
  var SAVE_FAIL_MSG = '保存できませんでした。プライベートブラウズ中や、端末の空き容量が少ないときに起こることがあります。';
  // 診断途中の離脱警告文言(監査バッチ1-4)。一字一句そのまま(ブラウザ仕様で表示されない場合あり)。
  var DIAG_LEAVE_MSG = '回答の途中です。このページを離れると、ここまでの回答が消えます。';
  // localStorage への保存。成功なら true、失敗(容量超過・プライベートモード等)なら false を返す。
  // 空catchで握り潰さず、成否を呼び出し側へ伝えて偽の成功表示を防ぐ。
  function persist(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { return false; }
  }
  // 保存失敗の通知。メモ画面など statusEl があればそこへ、無ければトーストで(チェックアイコンは出さない)。
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

  // ------- カード描画 -------
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
      '<button type="button" class="btn btn-copy-script" data-copy="' + esc(s.text) + '">' + icon('copy') + ' コピー</button>' +
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

  // FAQカードの連動リード(q_tax_status / q_techo に応じて先頭に表示)。
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

  // FAQ形式の本文(card_faq_v3.json)。用語はタップ辞典化(汎用)。
  function faqBody(card, chain) {
    var faq = state.data.faq && state.data.faq.faq_cards[card.card_id];
    if (!faq) return unpreparedBody(card, chain);
    var gseen = {}; // 用語リンクはカード単位で語ごと初回のみ
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

  // 高額介護サービス費(カード17)の負担上限。q_tax_status に連動(わからない=両パターン)。
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

  // 個人事業主向けなど、カード末尾の補足リスト(work_leave の appendix)。
  function appendixBlock(card, chain) {
    var ap = card.appendix;
    if (!ap) return '';
    var html = '<div class="card-sec card-appendix-sec"><div class="card-sec-h">' + esc(ap.label) + '</div><ul class="card-appendix">';
    (ap.items || []).forEach(function (it) { var s = substitute(it, chain); html += '<li>' + rich(s.text) + '</li>'; });
    html += '</ul></div>';
    return html;
  }

  // 未準備/知識/常時カードの本文(4節)
  function unpreparedBody(card, chain) {
    var html = '';
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
  // 準備済みカードの 【登録した内容】/【時間】 に体制メモを差し込むためのオプション。
  function bracketOptsFor(cardId) {
    var m = state.memo || {};
    if (cardId === 'family_responder') return { registered: m.responder_name || '', time: DISTANCE_LABEL[state.answers.q_my_distance] || '' };
    if (cardId === 'key_access') return { registered: m.key_location || '' };
    if (cardId === 'info_set') return { registered: m.info_location || '' };
    if (cardId === 'care_taxi') return { registered: m.care_taxi_name || '' };
    return {};
  }

  // 準備済み(available)カードの本文
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

  // 1枚のカードを描画。mode: 'open'(未準備・知識・特別) / 'available' / 'na'
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
    else if (mode === 'reference') body = unpreparedBody(card, chain); // 常時使える情報カード(折りたたみ+全文)
    else if (hasFaq(card.card_id)) body = faqBody(card, chain);
    else body = unpreparedBody(card, chain);

    if (mode === 'available' || mode === 'na' || mode === 'reference') {
      // 折りたたみ
      return '<details id="card-' + esc(card.card_id) + '" class="' + cls + '"><summary class="card-summary">' +
        '<span class="card-name">' + esc(card.name) + '</span>' + badge + '</summary>' +
        '<div class="card-body">' + body + '</div></details>';
    }
    // 展開表示
    return '<div id="card-' + esc(card.card_id) + '" class="' + cls + '"><div class="card-head"><span class="card-name">' + esc(card.name) + '</span>' + badge + '</div>' +
      '<div class="card-body">' + body + '</div></div>';
  }

  // 準備済みカードのコンパクト表示(済 + 固有名 + 緊急時の出番)。
  function telLinkHtml(phone) {
    if (!phone) return '';
    // 数字を除いた結果が空(例:「あとで」)なら発信リンクを作らない(監査バッチ1-6)。
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

  // テーマ処方: 1テーマ分のカード群を描画。used に載せた card_id は以降スキップ。
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
        if (st === 'not_applicable') return; // その他の折りたたみへ回す(used にしない)
        used[id] = true;
        body += st === 'available' ? compactDone(card) : renderCard(card, chain, 'preparable', 'open');
      } else if (card.status_type === 'knowledge') {
        used[id] = true;
        body += renderCard(card, chain, 'knowledge', 'open');
      } else if (card.status_type === 'always') {
        used[id] = true;
        body += renderCard(card, chain, 'always', 'open');
      } else if (card.status_type === 'special') {
        // self_down_plan は最上部で別途表示済み
        return;
      }
    });
    return body;
  }

  // ------- 平時ビュー(処方=備えプラン) -------
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
    var taxiKenEligible = RulesEngine.fukushiTaxiKenEligible(state.answers); // 手帳あり(1・2級)で昇格
    var parkingEligible = RulesEngine.parkingPermitEligible(state.answers);  // 手帳あり(1・2級/3級以下)で昇格
    var conditional = cards.filter(function (c) {
      if (c.card_id === 'fukushi_taxi_ken') return !taxiKenEligible; // 昇格時は折りたたみから外す
      if (c.card_id === 'fukushi_yusho') return !yushoEligible;
      if (c.card_id === 'parking_permit') return !parkingEligible;
      return false;
    });
    if (yushoEligible && yushoCard) derivedPrep.push(yushoCard);
    var self21 = cardById('self_down_plan');
    var worries = Array.isArray(state.answers.q_worries) ? state.answers.q_worries : [];

    var html = '';
    html += '<h2 class="result-h2">あなたの備えプラン</h2>';
    // テーマ宣言バナー(鏡と連動)
    var themeLabel = mc.theme_labels[state.mirror.theme] || '';
    html += '<div class="theme-banner"><span class="theme-banner-label">テーマ</span> ' + esc(themeLabel) +
      ' <button type="button" id="btn-back-mirror" class="link-btn">状況の鏡を見直す</button></div>';
    var availCount = derivedAvail.length + always.length;
    html += '<p class="summary-line">いま使える手札 <strong>' + availCount + '枚</strong> / 準備すれば増える手札 <strong>' + derivedPrep.length + '枚</strong></p>';

    // ① ケアマネを処方の最上位に固定(未準備の場合・すべての入口のため / A-1)
    var cmCard = cardById('care_manager');
    if (cmCard && state.statuses.care_manager === 'preparable' && !used.care_manager) {
      used.care_manager = true;
      html += '<div class="group group-pin">';
      html += '<h3 class="group-h">まず、ここから — 介護のすべての入口</h3>';
      html += renderCard(cmCard, chain, 'preparable', 'open');
      html += '</div>';
    }

    // ②(w_work選択時)介護休業を上位固定
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

    // ③ テーマ順の処方(主テーマ → 選択した心配ごと → その他)
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

    // ④ その他の備え(テーマに載らなかった手札)
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
      // お金の制度(25/26/27)を w_money / 非課税 のとき上位化(27は非課税で先頭 / T4)
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

    // 手帳あり: 福祉タクシー券(1・2級)・駐車禁止等除外標章を「使える可能性のある補助」へ昇格(C-2.3 / Phase 4.1)
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
    // いつでも使える相談・受診の窓口(119・#7119・Q助・地域包括 など / A-3)
    if (otherAlways.length) {
      html += '<div class="group"><h3 class="group-h">' + icon('phone') + 'いつでも使える相談・受診の窓口</h3>';
      html += '<p class="group-note">申し込み不要で、いざという時にそのまま使えます。タップして中身を確認しておきましょう。</p>';
      otherAlways.forEach(function (c) { html += renderCard(c, chain, 'always', 'reference'); });
      html += '</div>';
    }

    // あなたが倒れたときの引き継ぎ: 処方の常時最後尾に固定(仕様4.3 §5 #14)。
    // w_self_down を選んでいても最後尾。先に触れる役目は「状況の鏡」のテーマ側が担う。
    if (self21 && !used.self_down_plan) {
      used.self_down_plan = true;
      html += '<div class="group group-self-down"><h3 class="group-h">あなたが倒れたときの引き継ぎ(念のため)</h3>';
      html += renderCard(self21, chain, 'special', 'open');
      html += '</div>';
    }

    // 対象の方向けの制度(折りたたみ)
    html += '<div class="group">';
    html += '<details class="fold-group"><summary class="fold-group-h">対象の方向けの制度(手帳をお持ちの方・移動の支援)</summary><div class="fold-group-body">';
    conditional.forEach(function (c) { html += renderCard(c, chain, 'knowledge', 'open'); });
    html += '</div></details>';
    html += '</div>';

    // 今は対象外(折りたたみ)
    var otherNa = derivedNa.filter(function (c) { return !used[c.card_id]; });
    if (otherNa.length) {
      html += '<div class="group">';
      html += '<details class="fold-group"><summary class="fold-group-h">今は対象外の手札(' + otherNa.length + '枚) — 条件が変われば使えます</summary><div class="fold-group-body">';
      otherNa.forEach(function (c) { html += renderCard(c, chain, 'not_applicable', 'na'); });
      html += '</div></details>';
      html += '</div>';
    }

    // すべての制度・サービスを見る(参照ページ)
    html += '<div class="group"><details class="fold-group"><summary class="fold-group-h">すべての制度・サービスを見る(' + cards.length + '枚の一覧)</summary><div class="fold-group-body">';
    cards.forEach(function (c) {
      var st = c.status_type === 'derived' ? state.statuses[c.card_id] : null;
      var mode = st === 'available' ? 'available' : (st === 'not_applicable' ? 'na' : 'open');
      var statusArg = c.status_type === 'derived' ? st : c.status_type;
      html += renderCard(c, chain, statusArg, mode);
    });
    html += '</div></details></div>';

    // この先の見取り図(処方末尾・固定セクション / T3)
    html += renderBlueprint();

    // 番外編への入口(見取り図の下 / Phase 4.1)
    html += '<p class="mame-entry"><button type="button" class="link-btn link-mame">' + icon('chevron') + ' 現場で知った小さなこと(番外編)</button></p>';

    // 家族に送るテキスト(引き継ぎ書)
    html += '<h2 class="result-h2">家族に送るテキスト(引き継ぎ書)</h2>';
    html += '<p class="result-intro">下の文章をコピーして、LINEやメールで家族に共有できます。あなたが倒れたときの引き継ぎ書としても使えます。</p>';
    var familyText = buildFamilyText(profile, chain, derivedAvail, derivedPrep);
    html += '<div class="share-box">';
    html += '<textarea id="share-text" class="share-text" readonly rows="14">' + esc(familyText) + '</textarea>';
    html += '<div class="share-actions"><button type="button" id="btn-copy" class="btn btn-secondary">' + icon('copy') + ' テキストをコピー</button>';
    html += '<span id="copy-status" class="copy-status" role="status"></span></div></div>';

    // 体制メモへの導線
    html += '<div class="emg-cta"><p>ケアマネさんや駆けつけ役の名前・電話を<strong>体制メモ</strong>に登録しておくと、緊急時ガイドが「○○さんに電話」と固有名で案内します。</p>';
    html += '<button type="button" id="btn-goto-memo" class="btn btn-secondary">体制メモを開く</button></div>';

    // 緊急時ビューへの導線
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

  // ------- 緊急時ビュー(場面別ガイド) -------
  function activeScenes() {
    // 全4場面。caregiver_down は F_self_down_gap でも必ず有効(常時表示)。
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
      // 場面の線画挿絵(仕様4.5-4.8)+ 原文タイトル
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

  // 手順内のカード参照。登録済みの固有名+tel: で表示。not_applicable は非表示、
  // 未登録かつ preparable は「(未準備)→備える」で処方へリンク。
  function cardChip(id, chain) {
    var card = cardById(id);
    if (!card) return '';
    // 未診断(一般形): 固有名も(未準備)も出さず、カード名+緊急番号のみ表示
    if (!state.diagnosed) {
      var t0 = '';
      if (id === 'call_119') t0 = '<a class="chip-tel" href="tel:119">発信</a>';
      else if (id === 'sharp7119') t0 = '<a class="chip-tel" href="tel:#7119">発信</a>';
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
    else if (id === 'sharp7119') { cls += ' chip-info'; tel = '<a class="chip-tel" href="tel:#7119">発信</a>'; }
    else if (res && res.registered) {
      cls += ' chip-avail';
      if (res.name) label += '<span class="chip-name">' + esc((res.prefix || '') + res.name) + '</span>';
      // 数字を除いた結果が空なら「発信」ボタンを出さない(監査バッチ1-6)。
      if (res.phone) {
        var dial = String(res.phone).replace(/[^0-9#+]/g, '');
        if (dial) tel = '<a class="chip-tel" href="tel:' + esc(dial) + '">発信</a>';
      }
    } else if (card.status_type === 'derived' && st === 'preparable') {
      // 未登録(固有名スロットの有無を問わず)かつ準備段階 → (未準備)+処方へリンク
      cls += ' chip-prep';
      suffix = '<button type="button" class="chip-goto" data-goto-card="' + esc(id) + '">(未準備)→備える</button>';
    } else if (card.status_type === 'derived' && st === 'available') {
      cls += ' chip-avail';
    } else {
      cls += ' chip-info';
    }
    return '<span class="' + cls + '">' + label + suffix + tel + '</span>';
  }

  // ------- 引き継ぎ書テキスト -------
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
    L.push('・救急: 119 / 救急電話相談: #7119');
    var houkatsu = resolvePlaceholder(chain, 'chiiki_houkatsu');
    if (houkatsu) L.push('・地域包括支援センター: ' + houkatsu.text);
    L.push('・ケアマネジャー: (連絡先を記入)');
    L.push('・かかりつけ医: (連絡先を記入)');
    L.push('・家に入る手段(鍵/キーボックス番号): (記入)');
    L.push('・保険証・お薬手帳・介護保険証の場所: (記入)');
    L.push('・駆けつけ役(誰が・何分で): (記入)');
    L.push('');
    L.push('※命に関わる症状・判断に迷うときは、ためらわず 119 / #7119 / かかりつけ医へ。');
    L.push('※このメモは家族で共有してください。');
    return L.join('\n');
  }
  function firstLine(t) { var i = String(t).indexOf('\n'); return (i === -1 ? String(t) : String(t).slice(0, i)); }

  // ------- コピー -------
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

  // 台本コピー / 未準備チップ→処方リンク(イベント委譲)
  function bindScriptCopy() {
    document.body.addEventListener('click', function (e) {
      var btn = e.target;
      // 番外編ページへの入口
      if (btn && btn.classList && btn.classList.contains('link-mame')) {
        e.preventDefault();
        openMame();
        return;
      }
      // 用語辞典: 語をタップ→モーダル(閉じると元の位置に戻る)
      if (btn && btn.classList && btn.classList.contains('glossary-term')) {
        e.preventDefault();
        openGlossary(btn.getAttribute('data-term'));
        return;
      }
      // 用語モーダル / 見取り図 からカードへ
      if (btn && btn.classList && btn.classList.contains('glossary-goto')) {
        e.preventDefault();
        closeGlossary();
        gotoCardInResult(btn.getAttribute('data-goto-card'));
        return;
      }
      // 見取り図: セクションへスクロール
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

  // ------- 体制メモ -------
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
        // 常識的な入力上限(監査バッチ1-6): 電話20 / 自由記入200 / 氏名等50。
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
  // 緊急ガイドの「(未準備)→備える」から処方の該当カードへ
  function gotoCardInResult(cardId) {
    var p = loadProfile();
    if (p) { restoreProfile(p); renderResult(p); }
    show('screen-result');
    setTimeout(function () {
      var el = document.getElementById('card-' + cardId);
      if (el) { if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('card-flash'); }
    }, 60);
  }

  // ================= Phase 3.2: 流れの可視化 =================

  function firstSentence(t) {
    t = String(t == null ? '' : t);
    var i = t.indexOf('。');
    return i === -1 ? t : t.slice(0, i + 1);
  }

  // 未準備カードを処方の表示順で返す(engine に委譲。完了登録済みは除外)。
  function orderedPreparableCards() {
    return RulesEngine.orderedPreparableCards(state.answers, state.data.catalog, state.data.mirror, state.completed);
  }

  // 進捗 x/y。分母 = 診断時の未準備カード数 + 推奨メモ項目数、分子 = 完了カード + 入力済みメモ。
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

  // ------- ホーム(次の一手) -------
  function openHome() {
    var p = loadProfile();
    if (!p) { show('screen-top'); return; }
    // プロフィール起因の例外を封じ込め、JSON読込失敗の扱いに合流させない(監査バッチ1-2)。
    // 起動時はこの関数が init() の .then 内で走るため、ここで throw すると誤って
    // 「データを読み込めませんでした」に落ちてしまう。失敗時は安全にトップ(未診断)へ。
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

  // [済んだので登録する]: カードを準備済みに切り替え、進捗+1、次の一手を繰り上げ、因果トースト。
  function markCardDone(cardId) {
    if (state.completed.indexOf(cardId) === -1) state.completed.push(cardId);
    var saved = saveProgress();
    computeDerived();
    showCompletionToast(cardId);
    renderHome();
    renderStepBand('2');
    if (!saved) notifySaveFailed();
  }

  // ------- 3ステップの帯 -------
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
      // ③(いざという時)がアクティブなのは緊急ビュー=119バナー隣接。柿を避け深緑にする(仕様8-4)
      var cls = 'step-item' + (s.key === active ? ' step-active' + (active === '3' ? ' step-active-emg' : '') : '');
      var extra = (s.key === '2') ? '<span class="step-extra">(' + prog.x + '/' + prog.y + ')</span>' : '';
      // 各ステップに線画挿絵(仕様4.2-4.4)。番号円は廃し、絵と原文ラベルで示す
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

  // ------- 因果トースト -------
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

  // トップ共感ブロックの「もし自分のほうが急に入院したら」の飛び先(仕様4.3 §6)。
  // 診断済み: 固有名つきの scene_caregiver_down 分岐B / 未診断: 一般形の同分岐B。
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

  // 「いま困っている」: 診断済みなら固有名つき、未診断なら一般形でガイドを開く。
  function panicOpen() {
    var p = loadProfile();
    if (p) { restoreProfile(p); }
    else { state.answers = {}; state.completed = []; computeDerived(); }
    openEmergency();
  }

  // ------- 用語辞典(glossary)モーダル -------
  function openGlossary(term) {
    var g = state.data.glossary;
    if (!g) return;
    var entry = g.terms.filter(function (t) { return t.term === term; })[0];
    if (!entry) return;
    $('glossary-title').textContent = entry.name;
    var gseen = {};
    gseen[entry.term] = true; // 見出し語自身は本文でリンク化しない
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

  // ------- この先の見取り図(処方末尾・固定セクション) -------
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

  // ------- 番外編: 現場で知った小さなこと -------
  function currentScreen() {
    for (var i = 0; i < SCREENS.length; i++) {
      var el = $(SCREENS[i]);
      if (el && !el.classList.contains('hidden')) return SCREENS[i];
    }
    return 'screen-top';
  }
  function renderMame() {
    var m = state.data.mame;
    // 番外編の扉: 縁側と湯呑みの挿絵(仕様4.9)
    var html = '<div class="mame-door-illus">' + illus('mame-door') + '</div>';
    html += '<h2 class="result-h2">' + esc(m.title) + '</h2>';
    html += '<p class="mame-intro">' + rich(m.intro) + '</p>';
    html += '<p class="mame-note">' + esc(m.note_line) + '</p>';
    // 一時非表示の項目は出さない。復帰手順: data/mame.json の該当項目から "hidden": true の行を消す。
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

  // ------- 開発者より -------
  function openAbout() {
    var sig = $('about-signature');
    if (sig) sig.textContent = SIGNATURE;
    show('screen-about');
  }

  // ------- 起動 -------
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
    updateTopPrimary(); // btn-start の文言・onclick は状態に応じて設定(仕様5.2)
    // 全画面共通ヘッダーのサイトタイトル → トップへ(仕様5.1)
    var siteTitle = $('site-title');
    if (siteTitle) siteTitle.addEventListener('click', function () { show('screen-top'); });
    // 全画面共通の「← 戻る」+ 端末の戻る操作(仕様4.3 §4-2)
    var globalBack = $('btn-global-back');
    if (globalBack) globalBack.addEventListener('click', goBack);
    // 右下のホーム(題字タップと同じ動作。トップ以外の全画面で表示)
    var homeBtn = $('home-btn');
    if (homeBtn) homeBtn.addEventListener('click', function () { show('screen-top'); });
    try { window.history.replaceState({ screen: 'screen-top' }, ''); } catch (e) {}
    // 診断進行中(1問以上回答済み・未完了)のみ離脱警告(監査バッチ1-4)。
    // 診断画面を離れる=finishで鏡へ / トップ復帰 すると条件が偽になり自動的に解除される。
    window.addEventListener('beforeunload', function (e) {
      if (currentScreen() === 'screen-diagnosis' && Object.keys(state.answers).length >= 1) {
        e.preventDefault();
        e.returnValue = DIAG_LEAVE_MSG; // 多くのブラウザは固定文言を出すが仕様に沿って設定
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

    // 状況の鏡ナビ
    $('btn-mirror-next').addEventListener('click', function () {
      var p = loadProfile() || { area_id: state.areaId, answers: state.answers };
      renderResult(p);
      show('screen-result');
    });
    $('btn-mirror-back').addEventListener('click', function () {
      if (state.questions.length) { state.index = state.questions.length - 1; renderQuestion(); show('screen-diagnosis'); }
      else show('screen-top');
    });

    // 開発者より
    var linkAbout = $('link-about');
    if (linkAbout) linkAbout.addEventListener('click', openAbout);
    $('btn-about-back').addEventListener('click', function () { show('screen-top'); });

    // 番外編ページ: 戻る(開いた元の画面へ)
    $('btn-mame-back').addEventListener('click', function () {
      var ret = state.mameReturn || 'screen-top';
      if (ret === 'screen-result') { var p = loadProfile(); if (p) { restoreProfile(p); renderResult(p); } }
      show(ret);
    });

    // 体制メモ
    $('btn-open-memo').addEventListener('click', openMemo);
    $('btn-memo-back').addEventListener('click', backToResult);
    $('btn-memo-save').addEventListener('click', function () {
      var oldMemo = loadMemo();
      state.memo = collectMemo();
      var saved = saveMemo(state.memo);
      var s = $('memo-status');
      // 保存に失敗したら偽の成功表示をせず、承認済み文言を出して終了(監査バッチ1-1)
      if (!saved) { notifySaveFailed(s); return; }
      // 新規に固有名が入ったグループを検出し、因果トーストを出す(仕様3)。保存成功時のみ。
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

    // ランディングから「支える側が倒れた・分岐B」へ(仕様4.3 §6)。
    // 共感ブロックの引用文中のリンクと、「このサイトができること」内のリンクの両方。
    ['link-self-down-quote', 'link-caregiver-down'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('click', function (e) { e.preventDefault(); openCaregiverDownB(); });
    });

    // 「いま困っている」固定ボタン(全画面・未診断でも一般形ガイド)
    $('panic-btn').addEventListener('click', panicOpen);

    // 用語辞典モーダルを閉じる
    $('glossary-close').addEventListener('click', closeGlossary);
    $('glossary-backdrop').addEventListener('click', closeGlossary);

    var profile = loadProfile();
    if (profile) {
      $('resume-box').classList.remove('hidden');
      if (profile.area_id) state.areaId = profile.area_id;
      restoreAreaSelects();
      $('btn-resume').addEventListener('click', function () { restoreProfile(profile); renderResult(profile); show('screen-result'); });
      $('btn-emergency-top').addEventListener('click', function () { restoreProfile(profile); openEmergency(); });
      // 2回目以降の入口 = ホーム(次の一手)
      openHome();
    }
  }

  function deleteData() {
    // 進捗・準備済み切り替えも profile 内。体制メモも含めて全消去(サーバー送信なし)。
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
      fetchJSON('data/municipalities.json')
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
      bindTopControls();
    }).catch(function (err) {
      if (window.console && console.error) console.error(err); // 詳細は開発者コンソールへ
      // 承認済み文言(監査バッチ1-2)。一字一句そのまま。
      var html = '<div class="privacy-box">' +
        'データを読み込めませんでした。お手数ですが、ページを再読み込みしてください。';
      // 「file://では動作しません」の案内は file: プロトコルのときだけ分離表示。
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
