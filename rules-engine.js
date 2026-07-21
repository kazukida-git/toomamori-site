/*
 * 事前備えプラン診断 判定エンジン
 * docs/preparedness_plan_spec_v1.md 2〜3章 / data/preparedness_rules.json に準拠。
 *
 * 設計方針:
 *  - 純粋関数のみ。DOM や fetch には依存しない(ブラウザ・Node 双方から利用)。
 *  - 「わからない(unknown)」はすべて安全側 = いいえ(no)相当として評価する。
 *  - 判定は必ず 中間判定(J1〜J5)+補助フラグ を経由してからルールを発火させる。
 *  - ルールのメタ情報(cost / priority / 表示順)は rulesData(preparedness_rules.json)から取得する。
 *
 * ブラウザでは window.RulesEngine、Node では module.exports として公開する。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RulesEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // わからない(unknown)を安全側=no相当に正規化する。
  // 未回答(undefined/null)はそのまま(各判定の肯定条件が満たされず ng になる)。
  function normalizeAnswers(answers) {
    var out = {};
    for (var k in answers) {
      if (!Object.prototype.hasOwnProperty.call(answers, k)) continue;
      var v = answers[k];
      out[k] = v === 'unknown' ? 'no' : v;
    }
    return out;
  }

  // 中間判定(5指標)。値は 'ok' / 'ng'。
  function deriveJudgements(a) {
    return {
      // J1 初動力: 30分以内に誰かが現地に行けるか
      J1_first_response:
        (a.q_my_distance === 'within30' && a.q_weekday_availability === 'yes') ||
        a.q_backup_person === 'within30'
          ? 'ok'
          : 'ng',
      // J2 入室力: 家族到着前に誰かが家に入れるか
      // 「ない(none)」および未回答・不明は ng。合鍵/キーボックス/鍵預かりのいずれかで ok。
      J2_entry:
        a.q_key_access === 'neighbor_key' ||
        a.q_key_access === 'key_box' ||
        a.q_key_access === 'key_service'
          ? 'ok'
          : 'ng',
      // J3 本人力: 本人がSOSを出し状況を伝えられるか
      J3_self_report:
        a.q_self_report === 'yes' && a.q_cognition === 'no' ? 'ok' : 'ng',
      // J4 公的接続: 認定・ケアマネ等の公的ルートにつながっているか
      J4_public_link:
        (a.q_care_level === 'yoshien' || a.q_care_level === 'yokaigo') &&
        a.q_care_manager === 'yes'
          ? 'ok'
          : 'ng',
      // J5 情報共有: 誰が動いても同じ情報にアクセスできるか
      J5_info_share:
        a.q_info_location === 'yes' && a.q_contact_shared === 'yes' ? 'ok' : 'ng'
    };
  }

  // 補助フラグ。
  function deriveFlags(a) {
    return {
      F_alone_risk:
        a.q_household === 'alone' ||
        a.q_household === 'elderly_couple' ||
        a.q_household === 'daytime_alone',
      F_fall: a.q_fall_history === 'yes',
      F_caregiver_household: a.q_household === 'always_someone',
      F_transport_gap:
        (a.q_my_distance === 'within120' || a.q_my_distance === 'over') &&
        a.q_backup_person === 'none' &&
        a.q_care_taxi !== 'yes',
      // F_self_down_gap: あなた自身が倒れたときの代替が「いる・ある(yes)」以外なら true。
      // unknown は normalizeAnswers で no 相当に正規化されるため true(安全側)。未回答も true。
      F_self_down_gap: a.q_self_down_backup !== 'yes'
    };
  }

  // カード状態(available/preparable/not_applicable)の導出。
  // docs/options_catalog_spec_v2.md 1章の導出規則に対応。status_type が derived の15枚のみを対象とし、
  // knowledge(16-20)/special(21)/always(119等) は状態導出の対象外なので含めない。
  function deriveCardStatuses(answers) {
    var a = normalizeAnswers(answers || {});
    var f = deriveFlags(a);
    var svcs =
      answers && Array.isArray(answers.q_services) ? answers.q_services : [];
    function hasSvc(s) {
      return svcs.indexOf(s) !== -1;
    }
    var hasBackup =
      a.q_backup_person === 'within30' ||
      a.q_backup_person === 'within60' ||
      a.q_backup_person === 'far';
    var hasKey =
      a.q_key_access === 'neighbor_key' ||
      a.q_key_access === 'key_box' ||
      a.q_key_access === 'key_service';

    return {
      family_responder:
        hasBackup || a.q_my_distance === 'within30' ? 'available' : 'preparable',
      key_access: hasKey ? 'available' : 'preparable',
      emergency_call_system:
        a.q_emergency_call_system === 'yes'
          ? 'available'
          : f.F_alone_risk
          ? 'preparable'
          : 'not_applicable',
      care_manager: a.q_care_manager === 'yes' ? 'available' : 'preparable',
      care_taxi: a.q_care_taxi === 'yes' ? 'available' : 'preparable',
      info_set:
        a.q_info_location === 'yes' && a.q_contact_shared === 'yes'
          ? 'available'
          : 'preparable',
      family_doctor: a.q_family_doctor === 'yes' ? 'available' : 'preparable',
      helper_office: hasSvc('helper') ? 'available' : 'not_applicable',
      visiting_nurse: hasSvc('visiting_nurse')
        ? 'available'
        : a.q_care_manager === 'yes'
        ? 'preparable'
        : 'not_applicable',
      watch_service:
        a.q_watch_service === 'yes'
          ? 'available'
          : f.F_alone_risk
          ? 'preparable'
          : 'not_applicable',
      short_stay:
        a.q_short_stay === 'yes'
          ? 'available'
          : a.q_care_manager === 'yes'
          ? 'preparable'
          : 'not_applicable'
    };
  }

  // scene_caregiver_down の既定分岐。q_household == 'always_someone' なら A(同居家族が倒れた)、
  // それ以外は B(離れて支える主担当=あなたが倒れた)。UI 側で切替可能。
  function defaultCaregiverBranch(answers) {
    var a = normalizeAnswers(answers || {});
    return a.q_household === 'always_someone' ? 'A' : 'B';
  }

  // 福祉有償運送(fukushi_yusho)の表示昇格判定。
  // q_care_level が要支援(yoshien)/要介護(yokaigo)なら対象条件を満たすため、
  // 平時ビューで「準備すれば使える手札」として表示する(true)。それ以外は折りたたみ(false)。
  function fukushiYushoEligible(answers) {
    var a = normalizeAnswers(answers || {});
    return a.q_care_level === 'yoshien' || a.q_care_level === 'yokaigo';
  }

  // ルール発火条件(rules.json の fire_if を JS で実装)。
  var RULE_PREDICATES = {
    r_no_first_response: function (j) {
      return j.J1_first_response === 'ng';
    },
    r_no_public_link: function (j, f) {
      return j.J4_public_link === 'ng' && (f.F_fall || f.F_alone_risk);
    },
    r_no_entry: function (j) {
      return j.J2_entry === 'ng';
    },
    r_no_info_share: function (j) {
      return j.J5_info_share === 'ng';
    },
    r_no_self_report: function (j) {
      return j.J3_self_report === 'ng';
    },
    r_caregiver_backup: function (j, f, a) {
      return f.F_caregiver_household && a.q_short_stay !== 'yes';
    },
    r_emergency_rule_unknown: function (j, f, a) {
      return j.J4_public_link === 'ok' && a.q_contact_shared !== 'yes';
    },
    r_watch_gap: function (j, f, a) {
      return (
        f.F_alone_risk &&
        a.q_watch_service !== 'yes' &&
        a.q_emergency_call_system !== 'yes'
      );
    },
    r_transport_gap: function (j, f) {
      return f.F_transport_gap;
    }
  };

  /*
   * 回答から判定結果一式を返す。
   *   answers   : { q_xxx: value, ... }(未回答キーは無くてよい)
   *   rulesData : preparedness_rules.json をパースしたオブジェクト
   * 戻り値: { judgements, flags, firedRules, firedRuleIds }
   *   firedRules は表示順(priority 昇順 → rules.json の並び順)でソート済み。
   */
  function evaluate(answers, rulesData) {
    var a = normalizeAnswers(answers || {});
    var judgements = deriveJudgements(a);
    var flags = deriveFlags(a);

    var rules = (rulesData && rulesData.rules) || [];
    var fired = [];
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var pred = RULE_PREDICATES[rule.rule_id];
      if (pred && pred(judgements, flags, a)) {
        fired.push({
          rule_id: rule.rule_id,
          cost: rule.cost,
          priority: rule.priority,
          order: i
        });
      }
    }

    fired.sort(function (x, y) {
      if (x.priority !== y.priority) return x.priority - y.priority;
      return x.order - y.order;
    });

    return {
      judgements: judgements,
      flags: flags,
      firedRules: fired,
      firedRuleIds: fired.map(function (r) {
        return r.rule_id;
      })
    };
  }

  // ================= Phase 3 =================

  // 状況の鏡: 主テーマ(含意パターン)を導出する純粋関数。
  // docs/planner_spec_v3.md 3.2 の優先順位表を上から評価し、最初に該当したものを返す。
  // 心配ごと(q_worries)は同順位の判定に優先度として効く(w_no_answer→D, w_self_down→B)。
  var MIRROR_THEME = {
    A: 'T_first_hour',
    B: 'T_self_down',
    C: 'T_daytime_gap',
    C_prime: 'T_public_link',
    D: 'T_unknown_time',
    'default': 'T_maintain'
  };

  function deriveMirror(answers) {
    var a = normalizeAnswers(answers || {});
    var j = deriveJudgements(a);
    var f = deriveFlags(a);
    var worries =
      answers && Array.isArray(answers.q_worries) ? answers.q_worries : [];
    function w(id) {
      return worries.indexOf(id) !== -1;
    }
    var pattern;
    // 1: 連絡不通型(分からない時間)
    if (w('w_no_answer') || (j.J3_self_report === 'ng' && f.F_alone_risk)) {
      pattern = 'D';
    // 2: 同居型 / 自分が倒れる不安
    } else if (f.F_caregiver_household || w('w_self_down')) {
      pattern = 'B';
    // 3: 初動の1時間が空く
    } else if (j.J1_first_response === 'ng') {
      pattern = 'A';
    // 4: 平日日中の空白(初動は確保できているが日中は動けない)
    } else if (j.J1_first_response === 'ok' && a.q_weekday_availability === 'no') {
      pattern = 'C';
    // 5: 公的支援に未接続
    } else if (j.J4_public_link === 'ng') {
      pattern = 'C_prime';
    // 6: いずれも該当なし(維持フェーズ)
    } else {
      pattern = 'default';
    }
    return { pattern: pattern, theme: MIRROR_THEME[pattern] };
  }

  // 年齢の10歳刻みチップ(docs/phase3_2_spec.md 7章)。値→表示ラベル。
  var AGE_BAND_LABEL = { '60s': '60代', '70s': '70代', '80s': '80代', '90s': '90代', '100plus': '100歳以上' };

  // q_parent_age の表示句を返す。数値→「87歳」/ チップ→「80代」「100歳以上」/ 未回答→null。
  function ageDisplay(ageRaw) {
    if (ageRaw == null || String(ageRaw).trim() === '') return null;
    var s = String(ageRaw).trim();
    if (/^\d+$/.test(s)) return s + '歳';
    return AGE_BAND_LABEL[s] || s;
  }

  // 【 】プレースホルダを回答値・体制メモで差し込む。
  // 任意項目が未回答のときは一般形にフォールバックし、生の【】を画面に残さない。
  //   opts: { registered: '登録内容の文字列', time: '所要時間の文字列' }(準備済みカードの表示用・任意)
  function fillBrackets(text, answers, opts) {
    var a = answers || {};
    var o = opts || {};
    var rel = a.q_parent_relation;
    var relWord =
      rel === 'mother' ? '母' : rel === 'father' ? '父' : rel === 'both' ? '両親' : '親';
    // 敬称つき(A-4の続柄置換用)。未回答は「親御さん」にフォールバックする。
    var relHonorific =
      rel === 'mother' ? '母' : rel === 'father' ? '父' : rel === 'both' ? '両親' : '親御さん';
    var ageRaw = a.q_parent_age;
    var age =
      ageRaw != null && String(ageRaw).trim() !== '' ? String(ageRaw).trim() : null;
    var out = String(text == null ? '' : text);
    // 年齢: 数値は「【年齢】歳」のテンプレの歳を活かす(87歳)。チップは「80代」等で歳を含めない。
    // 未回答なら「【年齢】歳の」「【年齢】歳」ごと除去して自然な文にする。
    if (age && /^\d+$/.test(age)) {
      out = out.replace(/【年齢】/g, age);
    } else if (age) {
      var disp = AGE_BAND_LABEL[age] || age;
      out = out
        .replace(/【年齢】歳の/g, disp + 'の')
        .replace(/【年齢】歳/g, disp)
        .replace(/【年齢】/g, disp);
    } else {
      out = out
        .replace(/【年齢】歳の/g, '')
        .replace(/【年齢】歳/g, '')
        .replace(/【年齢】/g, '');
    }
    out = out.replace(/【続柄敬称】/g, relHonorific);
    out = out.replace(/【続柄】/g, relWord);
    out = out.replace(/【持病】/g, '持病');
    out = out.replace(/【駆けつけ役】/g, o.responder || '駆けつけ役の方');
    out = out.replace(/【登録した内容があれば表示】/g, o.registered || '');
    out = out.replace(/【登録した内容】/g, o.registered || '(未登録)');
    out = out.replace(/【時間】/g, o.time || '');
    return out;
  }

  // 緊急時ガイドで手順内の資源(カード)を固有名で表示するための解決。
  // 体制メモ(memo)に登録があれば固有名+電話を返し、未登録かつ preparable なら (未準備) を立てる。
  var EMG_RESOURCE = {
    // 固有名の接頭辞は「ケアマネの」のまま(表示例:「ケアマネの田中さん」)。
    // #13(ケアマネ→ケアマネさん)の置換対象からは、この接頭辞のみ除外する。
    care_manager: { prefix: 'ケアマネの', nameKey: 'care_manager_name', phoneKey: 'care_manager_phone' },
    family_responder: { prefix: '駆けつけ役 ', nameKey: 'responder_name', phoneKey: 'responder_phone' },
    care_taxi: { prefix: '介護タクシー ', nameKey: 'care_taxi_name', phoneKey: 'care_taxi_phone' },
    helper_office: { prefix: 'ヘルパー事業所 ', nameKey: 'helper_name', phoneKey: 'helper_phone' },
    family_doctor: { prefix: 'かかりつけ医 ', nameKey: 'doctor_name', phoneKey: 'doctor_phone' },
    key_access: { prefix: '入室手段: ', nameKey: 'key_location', phoneKey: null },
    info_set: { prefix: '情報の保管場所: ', nameKey: 'info_location', phoneKey: null }
  };

  function emergencyResource(cardId, memo, status) {
    var def = EMG_RESOURCE[cardId];
    if (!def) return null;
    var m = memo || {};
    var name = def.nameKey ? m[def.nameKey] || '' : '';
    var phone = def.phoneKey ? m[def.phoneKey] || '' : '';
    var registered = !!(name || phone);
    return {
      cardId: cardId,
      prefix: def.prefix,
      name: name,
      phone: phone,
      registered: registered,
      // 未登録かつ「準備すれば使える」段階なら、手順上は(未準備)+処方リンクにする
      unprepared: !registered && status === 'preparable'
    };
  }

  // ================= Phase 3.1 =================

  // 高額介護サービス費(カード17)の負担上限をどのパターンで表示するか。
  // docs/phase3_1_patch.md C-2: 非課税→hikazei / 課税→kazei / わからない・未回答→両方(安全側noには倒さない)。
  function taxLimitKeys(taxStatus) {
    if (taxStatus === 'hikazei') return ['hikazei'];
    if (taxStatus === 'kazei') return ['kazei'];
    return ['hikazei', 'kazei'];
  }

  // 福祉タクシー利用券(カード19)の昇格判定。手帳あり(1・2級)のとき折りたたみ→上位へ。
  function fukushiTaxiKenEligible(answers) {
    var a = answers || {};
    return a.q_techo === 'level12';
  }

  // ================= Phase 4 =================

  // カード28(駐車禁止等除外標章)の昇格判定。障害者手帳あり(1・2級/3級以下)で「使える可能性のある補助」へ。
  function parkingPermitEligible(answers) {
    var a = answers || {};
    return a.q_techo === 'level12' || a.q_techo === 'level3';
  }

  // お金の制度カード(25/26/27)の上位表示順。docs/card_copy_v4_batch.md 連動。
  // w_money 選択 or 非課税 のとき上位化。カード27(年金生活者支援給付金)は非課税時に先頭。
  function moneyPriorityCards(answers) {
    var a = answers || {};
    var worries = Array.isArray(a.q_worries) ? a.q_worries : [];
    var wMoney = worries.indexOf('w_money') !== -1;
    var hikazei = a.q_tax_status === 'hikazei';
    if (!wMoney && !hikazei) return [];
    return hikazei
      ? ['nenkin_kyufu', 'shogaisha_kojo', 'kougaku_gassan']
      : ['shogaisha_kojo', 'kougaku_gassan', 'nenkin_kyufu'];
  }

  // ================= Phase 3.2 =================

  // 未準備カードを処方の表示順で返す(care_manager 最優先 → テーマ順 → カタログ順)。
  // completed(完了登録済み)のカードは available 扱いにして除外する。「次の一手」の選定に使う。
  //   catalog    : options_catalog.json
  //   mirrorCopy : mirror_copy.json(worry_theme / theme_cards)
  function orderedPreparableCards(answers, catalog, mirrorCopy, completed) {
    var statuses = deriveCardStatuses(answers);
    (completed || []).forEach(function (id) { if (statuses[id]) statuses[id] = 'available'; });
    var mirror = deriveMirror(answers);
    var worries = answers && Array.isArray(answers.q_worries) ? answers.q_worries : [];
    var byId = {};
    (catalog.cards || []).forEach(function (c) { byId[c.card_id] = c; });
    var ids = [];
    function isPrep(id) { var c = byId[id]; return c && c.status_type === 'derived' && statuses[id] === 'preparable'; }
    function add(id) { if (isPrep(id) && ids.indexOf(id) === -1) ids.push(id); }
    add('care_manager'); // 最優先(すべての入口)
    var themeOrder = [mirror.theme];
    worries.forEach(function (w) { var t = mirrorCopy.worry_theme[w]; if (t && themeOrder.indexOf(t) === -1) themeOrder.push(t); });
    themeOrder.forEach(function (t) { ((mirrorCopy.theme_cards || {})[t] || []).forEach(add); });
    (catalog.cards || []).forEach(function (c) { add(c.card_id); });
    return ids;
  }

  // localStorage 保存用に J1_xxx → J1 の短縮キーへ変換する(仕様書 5.1)。
  function shortJudgements(judgements) {
    var map = {
      J1_first_response: 'J1',
      J2_entry: 'J2',
      J3_self_report: 'J3',
      J4_public_link: 'J4',
      J5_info_share: 'J5'
    };
    var out = {};
    for (var k in map) {
      if (judgements[k]) out[map[k]] = judgements[k];
    }
    return out;
  }

  return {
    normalizeAnswers: normalizeAnswers,
    deriveJudgements: deriveJudgements,
    deriveFlags: deriveFlags,
    deriveCardStatuses: deriveCardStatuses,
    defaultCaregiverBranch: defaultCaregiverBranch,
    fukushiYushoEligible: fukushiYushoEligible,
    deriveMirror: deriveMirror,
    fillBrackets: fillBrackets,
    ageDisplay: ageDisplay,
    emergencyResource: emergencyResource,
    taxLimitKeys: taxLimitKeys,
    fukushiTaxiKenEligible: fukushiTaxiKenEligible,
    parkingPermitEligible: parkingPermitEligible,
    moneyPriorityCards: moneyPriorityCards,
    orderedPreparableCards: orderedPreparableCards,
    evaluate: evaluate,
    shortJudgements: shortJudgements
  };
});
