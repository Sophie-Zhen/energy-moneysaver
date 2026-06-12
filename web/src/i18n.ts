// Bilingual (English / 中文) UI strings. Only interface text is translated —
// the plan catalogue (labels, supplier names, sources, notes) stays English,
// and no computation logic depends on the language.
//
// Pattern: App holds the `lang` state and provides it via LangContext; every
// component reads `const { t } = useT()`. Interpolated strings are functions.

import { createContext, useContext } from "react";

export type Lang = "en" | "zh";

const en = {
  // header / intro
  tagline: "The Irish energy plan checker — switch with confidence.",
  intro: (hasGas: boolean) =>
    `Compare Irish electricity ${hasGas ? "& gas " : ""}plans. Pick a mode: a form-only quick estimate, or upload your ESB Networks half-hour export for higher accuracy. Files never leave your browser.`,
  newHere: "New here? ",
  howToRead: "How to read your result →",
  midDot: "  ·  ",
  dataGuideAsk:
    "Not sure where to find your annual kWh or how to download an HDF? ",
  dataGuide: "Data guide →",
  loadError: (msg: string) => `Could not load catalogue: ${msg}`,

  // input mode
  inputMode: "Input mode",
  formMode: "Form mode (annual kWh + default profile)",
  hdfMode: "Upload HDF (ESB Networks half-hour CSV)",

  // form
  currentPlanLabel: "Your current plan (to see your saving)",
  selectCurrentPlan: "— select your current plan —",
  contractEndLabel: "Current plan ends on (optional)",
  contractEndHint: "Unlocks your switch date and anchors the price projection.",
  annualElecKwh: "Annual electricity kWh",
  hdfFile: "HDF CSV file",
  hdfError: (msg: string) => `Error: ${msg}`,
  hdfStats: (wd: number, we: number, kwh: number, evRows: number) =>
    `${wd} weekdays + ${we} weekend days, annualised ~${kwh} kWh${
      evRows > 0 ? ` (${evRows} rows after EV cutoff)` : ""
    }`,
  meterType: "Meter type",
  meterSmart: "Smart meter",
  meterDayNight: "Day/Night (MCC02 legacy)",
  meterStandard: "Standard 24hr (non-smart)",
  haveGas: "I have gas",
  annualGasKwh: "Annual gas kWh",
  haveEv: "I have an EV (charged at home)",
  annualEvKwh: "Annual EV charging kWh",
  evScheduledHint: " (assumed scheduled to cheapest band)",
  evStartLabel: "EV charging started on (optional)",
  evStartHint:
    " Skips readings on/after this date so the baseload isn't inflated by EV charging.",
  haveSolar: "I have solar panels (export to grid)",
  annualExportKwh: "Annual export kWh",
  exportUploadHint: " Upload your HDF to read this from your meter instead.",
  exportFromHdf: (kwh: number) => `Export read from your HDF: ~${kwh} kWh/yr.`,
  exportNoneInHdf:
    "No Active Export rows found in this HDF — switch to form mode to enter an estimate.",
  exportUploadFirst: "Upload your HDF above to read your export.",
  jointBill: "Bill is in two names (raises tax-free export to €800)",

  // answer hero
  cheapestForYou: "Cheapest for you, next 12 months",
  perYrEur: (n: string) => `€${n}/yr`,
  selectToSave: "Select your current plan above to see how much you'd save.",
  alreadyBestHead: "You're already on the cheapest plan ✅",
  nothingToDo: (label: string, eur: string) =>
    `${label} · €${eur}/yr. Nothing to do.`,
  yourPlanVs: "Your plan vs the cheapest for you — next 12 months",
  heroSaveSuffix: (save: string) => ` save €${save}/yr`,
  curCheapestLine: (cur: string, best: string) =>
    `Current: ${cur}. Cheapest: ${best}.`,
  hikeNote:
    "⚠️ Your current figure includes your supplier's announced July increase — part of why switching saves.",

  // breakdown rows
  rowNight: "Night units",
  rowDay: "Day units",
  rowPeak: "Peak units (wkdy 17–19)",
  rowElecStanding: "Electricity standing",
  rowPso: "PSO levy",
  rowGasUnits: "Gas units",
  rowGasCarbon: "Gas carbon tax",
  rowGasStanding: "Gas standing",
  rowWelcome: "Welcome credit",
  rowSolarCredit: "Solar export credit",
  rowTotal: "Total",

  // cost breakdown
  costBreakdown: "Cost breakdown",
  colComponent: "Component",
  colCurrent: "Current",
  colCheapest: "Cheapest",
  colAnnual: "Annual",
  colYouSave: "You save",
  breakdownCaptionCur: (cur: string, best: string) =>
    `Current: ${cur}. Cheapest: ${best}. "You save" is current minus cheapest per line.`,
  breakdownCaptionNoCur: (best: string) =>
    `Cheapest for you: ${best}. Pick your current plan above to compare it line by line.`,
  ratesSources: "Rates & sources for these plans",
  cheapestColon: (label: string) => `Cheapest: ${label}`,
  currentColon: (label: string) => `Current: ${label}`,

  // rate lines
  unitRate24: "Unit rate (24 hr)",
  unitRate: "Unit rate",
  standingCharge: "Standing charge",
  welcomeCredit: "Welcome credit",
  onceSuffix: " once",
  perYrSuffix: "/yr",
  rateNoteElec: (discountPct: number) =>
    `Inc VAT${
      discountPct > 0
        ? ` and the ${discountPct}% discount (both already in the rates above)`
        : ""
    }. PSO levy (€19.10/yr) is added by the model, not the supplier.`,
  rateNoteGas: (discountPct: number) =>
    `Inc VAT${
      discountPct > 0 ? `, ${discountPct}% discount included` : ""
    }; carbon tax (1.25 c/kWh) is added by the model.`,

  // switch timing
  switchTitle: "If you switch: when and how",
  submitAroundPre: "Submit your switch around ",
  submitAroundPost: " — the day after your current plan ends.",
  submitGeneric:
    "Submit the day after your fixed contract or discount ends. Find that date on your bill or welcome email and enter it above for an exact day.",
  timingExitFee:
    "Switching before your end date can trigger an early-exit fee (≈€50); it stops applying once the contract ends.",
  timingForum:
    "Some people who switched on the exact end date were auto-charged the fee and had to dispute it — a day later is safer.",
  timingDuration:
    "The switch takes ~10–15 working days; you can waive the 14-day cooling-off to speed it up.",
  timingEveryDay:
    "Every day past your end date sits on the higher standard rate — don't drag it out.",
  timingCheck:
    "Confirm your exact end date in your supplier account before scheduling anything.",

  // negotiate
  negotiateTitle: "Best option: stay and negotiate",
  negLeadPre: "Switching saves about ",
  negLeadPost:
    " but staying is less hassle if your current supplier matches it. What to ask for:",
  negFirstYearBold: (pct: number) => `≈${pct}% off your current rates`,
  negFirstYearRest: (bonusPart: string, target: string) =>
    ` matches their first-year deal${bonusPart} (≈€${target}/yr).`,
  negBonusPart: (bonus: string) => ` including the €${bonus} sign-up bonus`,
  negFirstYearInfeasible:
    "Even free units wouldn't match — your standing charges and other fixed costs alone exceed the cheapest switch. Switching is the only way to save here.",
  negOngoingBold: (pct: number) => `≈${pct}% off`,
  negOngoingRest: (target: string) =>
    ` matches their ongoing rate once the one-off bonus is gone (≈€${target}/yr) — enough to win from year 2.`,
  negOngoingBeats: (bonus: string) =>
    `Your current ongoing rate already beats theirs — their deal only wins in year 1 thanks to the €${bonus} bonus. Staying may be cheaper long-term.`,
  negotiateFootnote:
    "These are targets to aim for on the call, not a promise they'll offer them. Most Irish suppliers have a retention team — ask before you cancel.",

  // solar
  solarTitle: "Your solar export",
  solarNoExportHdf:
    "No export readings found in your HDF. Switch to form mode to enter an annual export estimate.",
  solarEnterExport:
    "Enter your annual export kWh above to see your export credit.",
  solarLead1: "You export ~",
  solarLead2: ". The cheapest plan is with ",
  solarLead3: ", which pays ",
  solarLead4: " — a ",
  solarLead5: " credit, already subtracted in the figures above.",
  solarKwhYr: (kwh: number) => `${kwh} kWh/yr`,
  solarCKwh: (rate: string) => `${rate} c/kWh`,
  solarGross: (gross: string) => `€${gross}/yr`,
  solarSameSupplier:
    "Export must be with the same supplier as your import (CRU rule), so the export rate is tied to whichever plan you choose — it's baked into each plan's ranking, not a separate switch.",
  solarRateLine: (supplier: string, rate: string, date: string) =>
    `${supplier} export rate ${rate} c/kWh (verified ${date}).`,
  solarTaxExcess: (
    cap: number,
    jointPart: string,
    gross: string,
    excess: string,
  ) =>
    `Export income is tax-free up to €${cap}/yr${jointPart}. Yours is ~€${gross}, so ~€${excess} is taxable at your marginal rate. The figures above use the gross credit (what hits your bill).`,
  solarTaxUnder: (cap: number, jointPart: string) =>
    `Export income is tax-free up to €${cap}/yr${jointPart}; you're under it, so no tax applies (in force to end-2028).`,
  solarJointPart: " (jointly-named bill)",
  solarNoRate: (supplier: string) =>
    `No published export rate for ${supplier} yet, so no credit is applied to the cheapest plan. Other suppliers do publish one — see the ranking.`,

  // why cheapest
  whyTitle: "Why this is cheapest for you",
  bandNight: "Night",
  bandDay: "Day",
  bandPeak: "Peak",
  whyLeadPre: (dom: string, pct: string) =>
    `Most of your electricity is used in the ${dom} window (${pct}%), so plans that price ${dom} cheaply — like `,
  whyLeadPost: " — come out ahead for you.",
  whyEvNote:
    " Your EV charging is scheduled to each plan's cheapest band on top of this.",
  whyBasedHdf: "Based on your uploaded half-hourly data.",
  whyBasedProfile:
    "Based on a typical household profile — upload your HDF for your real shape.",
  whyExcludesEv: " Usage shape excludes EV charging.",

  // ranking
  allPlans: (count: number, kwh: number | null) =>
    `All plans (${count} combos${
      kwh != null ? `, modelled at ${kwh} kWh elec` : ""
    })`,
  noPlans:
    "No plans match these constraints. Try changing meter type or toggling gas/EV.",
  colRank: "#",
  colPlan: "Plan",
  colAnnualEur: "Annual €",
  colVsBest: "vs best",
  gasSuffix: (supplier: string) => ` + ${supplier} gas`,

  // plan detail
  elecTitle: (supplier: string) => `Electricity: ${supplier}`,
  gasTitle: (supplier: string) => `Gas: ${supplier}`,
  verifiedOn: (date: string) => `verified ${date}`,
  hikeDetailNote: (supplier: string, pct: number) =>
    `⚠️ ${supplier} announced a +${pct}% increase. These are the verified pre-increase rates (check them against the source); the ranking applies the increase, time-weighted, on top — so your modelled annual cost is higher than these rates alone.`,
  sourceLabel: "Source: ",

  // modelling disclosure
  modellingSummary: "What's modelled (and what isn't)",
  modIncludedBold: "Included:",
  modIncludedRest:
    " unit rates (inc 9% VAT), standing charges (inc VAT), PSO levy (€19.10/year), gas carbon tax (1.25 c/kWh), welcome credits (deducted once).",
  modProjectionBold: "Next-12-month projection, time-weighted.",
  modProjectionRest:
    " Announced July 2026 increases — Electric Ireland (+8% elec / +7.7% gas) and Yuno (+9.5% / +11%) — are applied only to the part of the year after they take effect (1 Jul 2026), measured from today. Other suppliers are shown at their current rate: they're variable too and could change, but nothing is announced, so we don't speculate. Weighting is uniform over time, not by seasonal usage.",
  modDiscountBold: "Discount assumed for the full year.",
  modDiscountRest:
    ` Most "X% off" deals revert to standard rates after 12 months — you may end up paying more in year 2 unless you switch again.`,
  modRuralBold: "Urban standing charges only.",
  modRuralRest:
    " Rural standing is typically €60-€90/year higher; not yet modelled.",
  modEvBold: "EV charging assumed scheduled to each plan's cheapest band",
  modEvRest:
    " (e.g. via a Zappi smart charger). Without scheduling, the rankings could shift by €100+/year.",
  modFreeDayBold: "Free Day / weekend-free plans",
  modFreeDayRest:
    " (SSE Smart Weekends, BG Smart Weekend, EI Weekender) are not yet modelled.",
  modSolarBold: "Solar export",
  modSolarRest:
    " is netted at each supplier's standard CEG rate (import and export must be the same supplier). The gross credit is shown; income above €400/yr (€800 jointly-named) is taxable and not deducted. Conditional partner rates (e.g. SSE Activ8) are excluded.",

  // language toggle
  langAria: "Language",
};

export type Strings = typeof en;

const zh: Strings = {
  // header / intro
  tagline: "爱尔兰能源套餐核查器 —— 换得明白，换得放心。",
  intro: (hasGas: boolean) =>
    `对比爱尔兰电力${hasGas ? "和燃气" : ""}套餐。选一种方式：用表单快速估算，或上传你的 ESB Networks 半小时用电数据以获得更高精度。文件只在你的浏览器里处理，不会上传。`,
  newHere: "第一次用？",
  howToRead: "如何读懂结果 →",
  midDot: "  ·  ",
  dataGuideAsk: "不知道年用电量在哪查、HDF 怎么下载？",
  dataGuide: "数据指南 →",
  loadError: (msg: string) => `无法加载套餐数据：${msg}`,

  // input mode
  inputMode: "输入方式",
  formMode: "表单模式（年用电量 + 默认用电曲线）",
  hdfMode: "上传 HDF（ESB Networks 半小时 CSV）",

  // form
  currentPlanLabel: "你当前的套餐（用于计算能省多少）",
  selectCurrentPlan: "— 选择你当前的套餐 —",
  contractEndLabel: "当前套餐到期日（选填）",
  contractEndHint: "用于推算换供应商的日期，并作为涨价投影的基准。",
  annualElecKwh: "年用电量 kWh",
  hdfFile: "HDF CSV 文件",
  hdfError: (msg: string) => `错误：${msg}`,
  hdfStats: (wd: number, we: number, kwh: number, evRows: number) =>
    `${wd} 个工作日 + ${we} 个周末日，年化约 ${kwh} kWh${
      evRows > 0 ? `（EV 起始日后跳过 ${evRows} 行）` : ""
    }`,
  meterType: "电表类型",
  meterSmart: "智能电表",
  meterDayNight: "昼夜表（MCC02 旧式）",
  meterStandard: "标准 24 小时表（非智能）",
  haveGas: "我有燃气",
  annualGasKwh: "年用气量 kWh",
  haveEv: "我有电动车（在家充电）",
  annualEvKwh: "电动车年充电量 kWh",
  evScheduledHint: "（假设排到最便宜的时段充电）",
  evStartLabel: "开始在家充电的日期（选填）",
  evStartHint: " 该日期（含）之后的读数会被跳过，以免基础负荷被充电拉高。",
  haveSolar: "我有太阳能板（向电网卖电）",
  annualExportKwh: "年上网电量 kWh",
  exportUploadHint: " 上传 HDF 可直接从电表读取这个数。",
  exportFromHdf: (kwh: number) => `已从 HDF 读取上网电量：约 ${kwh} kWh/年。`,
  exportNoneInHdf:
    "这份 HDF 里没有 Active Export 行 —— 切到表单模式手动填一个估值。",
  exportUploadFirst: "在上方上传 HDF 以读取上网电量。",
  jointBill: "账单为两人联名（免税上网收入上限提到 €800）",

  // answer hero
  cheapestForYou: "未来 12 个月对你最划算的",
  perYrEur: (n: string) => `€${n}/年`,
  selectToSave: "在上方选择你当前的套餐，即可看到能省多少。",
  alreadyBestHead: "你已经在最便宜的套餐上了 ✅",
  nothingToDo: (label: string, eur: string) =>
    `${label} · €${eur}/年。无需更换。`,
  yourPlanVs: "你的套餐 vs 对你最划算的 —— 未来 12 个月",
  heroSaveSuffix: (save: string) => ` 省 €${save}/年`,
  curCheapestLine: (cur: string, best: string) =>
    `当前：${cur}。最便宜：${best}。`,
  hikeNote:
    "⚠️ 你当前的数字已包含供应商公告的 7 月涨价 —— 这也是换套餐能省的部分原因。",

  // breakdown rows
  rowNight: "夜间用电",
  rowDay: "日间用电",
  rowPeak: "峰时用电（工作日 17–19）",
  rowElecStanding: "电力待机费",
  rowPso: "PSO 公共服务税",
  rowGasUnits: "燃气用量",
  rowGasCarbon: "燃气碳税",
  rowGasStanding: "燃气待机费",
  rowWelcome: "迎新返利",
  rowSolarCredit: "太阳能上网返利",
  rowTotal: "合计",

  // cost breakdown
  costBreakdown: "费用拆分",
  colComponent: "项目",
  colCurrent: "当前",
  colCheapest: "最便宜",
  colAnnual: "年度",
  colYouSave: "可省",
  breakdownCaptionCur: (cur: string, best: string) =>
    `当前：${cur}。最便宜：${best}。"可省"为每行的当前减最便宜。`,
  breakdownCaptionNoCur: (best: string) =>
    `对你最便宜：${best}。在上方选择当前套餐即可逐行对比。`,
  ratesSources: "这些套餐的费率与来源",
  cheapestColon: (label: string) => `最便宜：${label}`,
  currentColon: (label: string) => `当前：${label}`,

  // rate lines
  unitRate24: "单一费率（24 小时）",
  unitRate: "单位费率",
  standingCharge: "待机费",
  welcomeCredit: "迎新返利",
  onceSuffix: "（一次性）",
  perYrSuffix: "/年",
  rateNoteElec: (discountPct: number) =>
    `含 VAT${
      discountPct > 0 ? `，且已含 ${discountPct}% 折扣（以上费率均已计入）` : ""
    }。PSO 税（€19.10/年）由模型另加，非供应商收取。`,
  rateNoteGas: (discountPct: number) =>
    `含 VAT${
      discountPct > 0 ? `，已含 ${discountPct}% 折扣` : ""
    }；碳税（1.25 c/kWh）由模型另加。`,

  // switch timing
  switchTitle: "如果你要换：何时、怎么换",
  submitAroundPre: "建议在 ",
  submitAroundPost: " 左右提交换约 —— 即当前套餐到期的次日。",
  submitGeneric:
    "在固定合约或折扣到期的次日提交。到期日可在账单或迎新邮件上找到，填到上方即可得到精确日期。",
  timingExitFee:
    "在到期日之前换约可能触发提前解约费（约 €50）；合约到期后就不再收。",
  timingForum:
    "有人正好在到期当天换，被自动扣了费、还得去申诉 —— 晚一天更稳妥。",
  timingDuration: "换约约需 10–15 个工作日；可放弃 14 天冷静期来加快。",
  timingEveryDay: "到期后每多一天都按更贵的标准费率算 —— 别拖。",
  timingCheck: "安排前先在供应商账户里确认你确切的到期日。",

  // negotiate
  negotiateTitle: "最优选：留下来谈价",
  negLeadPre: "换套餐大约能省 ",
  negLeadPost: " 但如果你现在的供应商愿意匹配，留下来更省事。可以这样谈：",
  negFirstYearBold: (pct: number) => `在当前费率上再打约 ${pct}% 折扣`,
  negFirstYearRest: (bonusPart: string, target: string) =>
    ` 就能追平对方第一年的套餐${bonusPart}（约 €${target}/年）。`,
  negBonusPart: (bonus: string) => `（含 €${bonus} 签约返利）`,
  negFirstYearInfeasible:
    "即便电费免费也追不平 —— 光待机费等固定费用就超过了最便宜的换约方案。这种情况只能靠换约来省。",
  negOngoingBold: (pct: number) => `约 ${pct}% 折扣`,
  negOngoingRest: (target: string) =>
    ` 就能在一次性返利用完后追平对方的长期费率（约 €${target}/年）—— 足以从第二年起更划算。`,
  negOngoingBeats: (bonus: string) =>
    `你当前的长期费率已经比对方低 —— 对方只是靠 €${bonus} 返利在第一年占优。长期看留下来可能更省。`,
  negotiateFootnote:
    "这些只是打电话时可以争取的目标，不保证对方一定给。爱尔兰多数供应商都有挽留团队 —— 取消前先问问。",

  // solar
  solarTitle: "你的太阳能上网",
  solarNoExportHdf:
    "HDF 里没有上网读数。切到表单模式手动填一个年上网电量估值。",
  solarEnterExport: "在上方填入年上网电量，即可看到上网返利。",
  solarLead1: "你每年上网约 ",
  solarLead2: "。最便宜的套餐来自 ",
  solarLead3: "，其上网电价为 ",
  solarLead4: " —— 相当于 ",
  solarLead5: " 的返利，已在上方数字中扣除。",
  solarKwhYr: (kwh: number) => `${kwh} kWh/年`,
  solarCKwh: (rate: string) => `${rate} c/kWh`,
  solarGross: (gross: string) => `€${gross}/年`,
  solarSameSupplier:
    "卖电必须和买电用同一家供应商（CRU 规定），所以上网电价跟你选哪个套餐绑定 —— 它已算进每个套餐的排名里，不是单独再换一次。",
  solarRateLine: (supplier: string, rate: string, date: string) =>
    `${supplier} 上网电价 ${rate} c/kWh（核验于 ${date}）。`,
  solarTaxExcess: (
    cap: number,
    jointPart: string,
    gross: string,
    excess: string,
  ) =>
    `上网收入每年 €${cap}${jointPart} 以内免税。你的约 €${gross}，所以约 €${excess} 要按你的边际税率计税。上方数字用的是税前返利（实际进账单的金额）。`,
  solarTaxUnder: (cap: number, jointPart: string) =>
    `上网收入每年 €${cap}${jointPart} 以内免税；你在额度内，无需缴税（政策有效至 2028 年底）。`,
  solarJointPart: "（联名账单）",
  solarNoRate: (supplier: string) =>
    `${supplier} 目前未公布上网电价，所以最便宜的套餐没有计入返利。其他供应商有公布 —— 见排名。`,

  // why cheapest
  whyTitle: "为什么这对你最划算",
  bandNight: "夜间",
  bandDay: "日间",
  bandPeak: "峰时",
  whyLeadPre: (dom: string, pct: string) =>
    `你大部分电量用在${dom}时段（${pct}%），所以把${dom}时段定价便宜的套餐 —— 比如 `,
  whyLeadPost: " —— 对你最划算。",
  whyEvNote: " 此外，你的电动车充电会排到每个套餐最便宜的时段。",
  whyBasedHdf: "基于你上传的半小时数据。",
  whyBasedProfile: "基于典型家庭用电曲线 —— 上传 HDF 可得到你的真实曲线。",
  whyExcludesEv: " 用电曲线不含电动车充电。",

  // ranking
  allPlans: (count: number, kwh: number | null) =>
    `全部套餐（${count} 个组合${
      kwh != null ? `，按 ${kwh} kWh 用电量测算` : ""
    }）`,
  noPlans:
    "没有符合条件的套餐。试试换电表类型，或勾选/取消燃气、电动车。",
  colRank: "#",
  colPlan: "套餐",
  colAnnualEur: "年度 €",
  colVsBest: "对比最优",
  gasSuffix: (supplier: string) => ` + ${supplier} 燃气`,

  // plan detail
  elecTitle: (supplier: string) => `电力：${supplier}`,
  gasTitle: (supplier: string) => `燃气：${supplier}`,
  verifiedOn: (date: string) => `核验于 ${date}`,
  hikeDetailNote: (supplier: string, pct: number) =>
    `⚠️ ${supplier} 已公告涨价 +${pct}%。以上是核验过的涨价前费率（可对照来源核对）；排名里在此基础上按时间加权计入了涨幅 —— 所以模型算出的年费用会高于仅按这些费率。`,
  sourceLabel: "来源：",

  // modelling disclosure
  modellingSummary: "哪些算了、哪些没算",
  modIncludedBold: "已包含：",
  modIncludedRest:
    " 单位费率（含 9% VAT）、待机费（含 VAT）、PSO 税（€19.10/年）、燃气碳税（1.25 c/kWh）、迎新返利（一次性抵扣）。",
  modProjectionBold: "未来 12 个月投影，按时间加权。",
  modProjectionRest:
    " 已公告的 2026 年 7 月涨价 —— Electric Ireland（电 +8% / 气 +7.7%）和 Yuno（+9.5% / +11%）—— 只对生效日（2026 年 7 月 1 日）之后那段时间计入，从今天起算。其他供应商按当前费率显示：它们也是浮动的、可能变，但没有公告，所以不臆测。加权按时间均匀，不按季节用电分布。",
  modDiscountBold: "折扣按整年假设。",
  modDiscountRest:
    " 多数 \"X% off\" 优惠在 12 个月后回到标准费率 —— 不再换约的话，第二年可能反而更贵。",
  modRuralBold: "仅用城市待机费。",
  modRuralRest: " 乡村待机费通常每年高 €60–€90；暂未建模。",
  modEvBold: "电动车充电假设排到每个套餐最便宜的时段",
  modEvRest:
    "（如通过 Zappi 智能充电桩）。不排程的话，排名可能变动 €100+/年。",
  modFreeDayBold: "免费日 / 周末免费套餐",
  modFreeDayRest:
    "（SSE Smart Weekends、BG Smart Weekend、EI Weekender）暂未建模。",
  modSolarBold: "太阳能上网",
  modSolarRest:
    " 按各供应商的标准 CEG 上网电价净算（买电卖电须同一家）。显示的是税前返利；每年超过 €400（联名 €800）的部分应税、未扣除。带条件的合作商专属电价（如 SSE Activ8）不计入。",

  // language toggle
  langAria: "语言",
};

export const STRINGS: Record<Lang, Strings> = { en, zh };

const STORAGE_KEY = "ems-lang";

export function detectLang(): Lang {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  }
  if (
    typeof navigator !== "undefined" &&
    navigator.language?.toLowerCase().startsWith("zh")
  ) {
    return "zh";
  }
  return "en";
}

export function persistLang(lang: Lang): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, lang);
  }
}

type LangCtx = { lang: Lang; setLang: (l: Lang) => void; t: Strings };

export const LangContext = createContext<LangCtx | null>(null);

export function useT(): LangCtx {
  const c = useContext(LangContext);
  if (!c) throw new Error("useT must be used within a LangContext provider");
  return c;
}
