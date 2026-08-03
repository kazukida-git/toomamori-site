











(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RulesEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizeAnswers(answers) {
    var out = {};
    for (var k in answers) {
      if (!Object.prototype.hasOwnProperty.call(answers, k)) continue;
      var v = answers[k];
      out[k] = v === 'unknown' ? 'no' : v;
    }
    return out;
  }

  function deriveJudgements(a) {
    return {
      J1_first_response:
        (a.q_my_distance === 'within30' && a.q_weekday_availability === 'yes') ||
        a.q_backup_person === 'within30'
          ? 'ok'
          : 'ng',
      J2_entry:
        a.q_key_access === 'neighbor_key' ||
        a.q_key_access === 'key_box' ||
        a.q_key_access === 'key_service'
          ? 'ok'
          : 'ng',
      J3_self_report:
        a.q_self_report === 'yes' && a.q_cognition === 'no' ? 'ok' : 'ng',
      J4_public_link:
        (a.q_care_level === 'yoshien' || a.q_care_level === 'yokaigo') &&
        a.q_care_manager === 'yes'
          ? 'ok'
          : 'ng',
      J5_info_share:
        a.q_info_location === 'yes' && a.q_contact_shared === 'yes' ? 'ok' : 'ng'
    };
  }

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
      F_self_down_gap: a.q_self_down_backup !== 'yes'
    };
  }

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

  function prerequisitesMet(prereqs, statuses, answers, completed) {
    var list = prereqs || [];
    var a = answers || {};
    var st = statuses || {};
    var done = completed || [];
    var unmet = [], unknown = false;
    for (var i = 0; i < list.length; i++) {
      var p = list[i], ok = false;
      if (p.type === 'card') {
        ok = st[p.card_id] === 'available' || done.indexOf(p.card_id) !== -1;
      } else if (p.type === 'certification') {
        if (a.q_care_level === 'yoshien' || a.q_care_level === 'yokaigo') ok = true;
        else if (a.q_care_level === 'none') ok = false;
        else { ok = false; unknown = true; }
      } else if (p.type === 'care_plan') {
        if (a.q_care_manager === 'yes') ok = true;
        else if (a.q_care_manager === 'no') ok = false;
        else { ok = false; unknown = true; }
      } else {
        ok = false; unknown = true;
      }
      if (!ok) unmet.push(p);
    }
    return { met: unmet.length === 0, unmet: unmet, unknown: unknown };
  }

  function defaultCaregiverBranch(answers) {
    var a = normalizeAnswers(answers || {});
    return a.q_household === 'always_someone' ? 'A' : 'B';
  }

  function fukushiYushoEligible(answers) {
    var a = normalizeAnswers(answers || {});
    return a.q_care_level === 'yoshien' || a.q_care_level === 'yokaigo';
  }

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
    if (w('w_no_answer') || (j.J3_self_report === 'ng' && f.F_alone_risk)) {
      pattern = 'D';
    } else if (f.F_caregiver_household || w('w_self_down')) {
      pattern = 'B';
    } else if (j.J1_first_response === 'ng') {
      pattern = 'A';
    } else if (j.J1_first_response === 'ok' && a.q_weekday_availability === 'no') {
      pattern = 'C';
    } else if (j.J4_public_link === 'ng') {
      pattern = 'C_prime';
    } else {
      pattern = 'default';
    }
    return { pattern: pattern, theme: MIRROR_THEME[pattern] };
  }

  var AGE_BAND_LABEL = { '60s': '60代', '70s': '70代', '80s': '80代', '90s': '90代', '100plus': '100歳以上' };

  function ageDisplay(ageRaw) {
    if (ageRaw == null || String(ageRaw).trim() === '') return null;
    var s = String(ageRaw).trim();
    if (/^\d+$/.test(s)) return s + '歳';
    return AGE_BAND_LABEL[s] || s;
  }

  function fillBrackets(text, answers, opts) {
    var a = answers || {};
    var o = opts || {};
    var rel = a.q_parent_relation;
    var relWord =
      rel === 'mother' ? '母' : rel === 'father' ? '父' : rel === 'both' ? '両親' : '親';
    var relHonorific =
      rel === 'mother' ? '母' : rel === 'father' ? '父' : rel === 'both' ? '両親' : '親御さん';
    var ageRaw = a.q_parent_age;
    var age =
      ageRaw != null && String(ageRaw).trim() !== '' ? String(ageRaw).trim() : null;
    var out = String(text == null ? '' : text);
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

  var EMG_RESOURCE = {
    care_manager: { prefix: 'ケアマネの', nameKey: 'care_manager_name', phoneKey: 'care_manager_phone' },
    family_responder: { prefix: '駆けつけ役 ', nameKey: 'responder_name', phoneKey: 'responder_phone' },
    care_taxi: { prefix: '介護タクシー ', nameKey: 'care_taxi_name', phoneKey: 'care_taxi_phone' },
    helper_office: { prefix: 'ヘルパー事業所 ', nameKey: 'helper_name', phoneKey: 'helper_phone' },
    visiting_nurse: { prefix: '訪問看護 ', nameKey: 'visiting_nurse_name', phoneKey: 'visiting_nurse_phone' },
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
      unprepared: !registered && status === 'preparable'
    };
  }


  function taxLimitKeys(taxStatus) {
    if (taxStatus === 'hikazei') return ['hikazei'];
    if (taxStatus === 'kazei') return ['kazei'];
    return ['hikazei', 'kazei'];
  }

  function fukushiTaxiKenEligible(answers) {
    var a = answers || {};
    return a.q_techo === 'level12';
  }


  function parkingPermitEligible(answers) {
    var a = answers || {};
    return a.q_techo === 'level12' || a.q_techo === 'level3';
  }

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
    add('care_manager');
    var themeOrder = [mirror.theme];
    worries.forEach(function (w) { var t = mirrorCopy.worry_theme[w]; if (t && themeOrder.indexOf(t) === -1) themeOrder.push(t); });
    themeOrder.forEach(function (t) { ((mirrorCopy.theme_cards || {})[t] || []).forEach(add); });
    (catalog.cards || []).forEach(function (c) { add(c.card_id); });
    return ids;
  }

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
    prerequisitesMet: prerequisitesMet,
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
