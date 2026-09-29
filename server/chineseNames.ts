type RawRecord = Record<string, unknown>;

export interface LocalizedName {
  name: string;
  shortName: string;
}

const asRecord = (value: unknown): RawRecord =>
  value !== null && typeof value === "object" ? (value as RawRecord) : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

const countryCodes: Readonly<Record<string, string>> = {
  BAN: "BD",
  BRN: "BH",
  CHN: "CN",
  HKG: "HK",
  INA: "ID",
  IND: "IN",
  IRI: "IR",
  JPN: "JP",
  KAZ: "KZ",
  KGZ: "KG",
  KOR: "KR",
  LAO: "LA",
  LBN: "LB",
  MAC: "MO",
  MDV: "MV",
  MGL: "MN",
  NEP: "NP",
  PAK: "PK",
  PRK: "KP",
  QAT: "QA",
  SGP: "SG",
  THA: "TH",
  TPE: "TW",
  UZB: "UZ",
  YEM: "YE"
};

const isoCountryCodes = new Set([
  "AE", "AF", "AL", "AM", "AO", "AR", "AT", "AU", "AZ", "BA", "BD",
  "BE", "BF", "BG", "BH", "BI", "BJ", "BN", "BO", "BR", "BT", "BW",
  "BY", "CA", "CD", "CF", "CG", "CH", "CI", "CL", "CM", "CN", "CO",
  "CR", "CU", "CV", "CY", "CZ", "DE", "DJ", "DK", "DO", "DZ", "EC",
  "EE", "EG", "ER", "ES", "ET", "FI", "FJ", "FR", "GA", "GB", "GD",
  "GE", "GH", "GM", "GN", "GQ", "GR", "GT", "GW", "GY", "HN", "HR",
  "HT", "HU", "ID", "IE", "IL", "IN", "IQ", "IR", "IS", "IT", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KP", "KR", "KW", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MG", "MH", "MK", "ML", "MM", "MN", "MO",
  "MR", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NE", "NG",
  "NI", "NL", "NO", "NP", "NR", "NZ", "OM", "PA", "PE", "PG", "PH",
  "PK", "PL", "PT", "PW", "PY", "QA", "RO", "RS", "RU", "RW", "SA",
  "SB", "SC", "SD", "SE", "SG", "SI", "SK", "SL", "SM", "SN", "SO",
  "SR", "SS", "ST", "SV", "SY", "SZ", "TD", "TG", "TH", "TJ", "TL",
  "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "US",
  "UY", "UZ", "VA", "VC", "VE", "VN", "VU", "WS", "YE", "ZA", "ZM",
  "ZW"
]);

export const getCountryCode = (value: unknown): string | null => {
  const side = asRecord(value);
  const org = text(side.Org).trim().toUpperCase();
  const mapped = countryCodes[org];
  if (mapped) {
    return mapped;
  }

  if (isoCountryCodes.has(org)) {
    return org;
  }

  const reg = text(side.Reg).trim().toUpperCase();
  const teamCode = reg.match(/TEAM-+([A-Z]{3})\d/)?.[1];
  if (teamCode) {
    const teamCountryCode = countryCodes[teamCode];
    if (teamCountryCode) {
      return teamCountryCode;
    }
  }

  return null;
};

export const athleteNames: Readonly<Record<string, string>> = {
  // Bangladesh
  "975500": "拉姆希姆利安·鲍姆",
  "14011923": "伊姆鲁尔·伊蒙",
  "11973732": "诺琳·马希",
  "13982093": "穆霍塔辛·里多伊",
  "1118418": "索南·索玛",
  "1123574": "萨曼塔·图希",
  // Bahrain
  "333748": "穆罕默德·阿拉利",
  "9723415": "赛义德·马赫福德",
  "9722716": "拉希德·拉希德",
  "13217998": "穆罕默德·萨利赫",
  // China
  "16276085": "陈熠",
  "14244548": "范姝涵",
  "16272436": "黄友政",
  "16276904": "蒯曼",
  "16272951": "林诗栋",
  "16277232": "孙颖莎",
  "16273238": "王楚钦",
  "16277438": "王曼昱",
  "16273540": "温瑞博",
  "16274163": "向鹏",
  // Hong Kong, China
  "11118415": "陈颢桦",
  "11118638": "杜凯琹",
  "11119017": "关文皓",
  "11119120": "林兆恒",
  "11119223": "林依诺",
  "11119448": "李皓晴",
  "11119894": "吴咏琳",
  "11120123": "苏籽童",
  "11120243": "黄镇廷",
  "11120693": "姚钧涛",
  // Indonesia
  "513004": "古斯蒂·德斯里扎尔",
  "6111391": "穆罕默德·因扎吉",
  "6111949": "穆罕默德·朱宁德拉",
  "6318908": "妮·马哈拉尼",
  "451609": "阿尔迈拉·尼布甲尼撒",
  "523649": "穆罕默德·内加拉",
  "434463": "阿凡·普拉塔马",
  "15261238": "辛迪·普特里",
  "4820871": "西特拉·拉斯米",
  "991515": "科芒·苏达尔尼塔",
  // India
  "10227465": "斯雷贾·阿库拉",
  "12185132": "迪亚·奇塔莱",
  "10231549": "辛德蕾拉·达斯",
  "10214830": "哈米特·德赛",
  "10232271": "亚沙斯维尼·戈尔帕德",
  "10218679": "萨蒂扬·格纳纳塞卡兰",
  "5928969": "帕亚斯·贾因",
  "10230508": "苏蒂尔塔·穆克吉",
  "12171959": "马努什·沙阿",
  "11337146": "马纳夫·塔卡尔",
  // Iran
  "8653263": "尼马·阿拉米安",
  "8652944": "诺沙德·阿拉米扬",
  "8656634": "马赫希德·阿什塔里",
  "8653771": "本雅明·法拉吉",
  "8655832": "阿里安·加法里",
  "4033621": "穆罕默德·哈比比",
  "8656334": "塞塔耶什·伊卢哈尼",
  // Japan
  "380921": "张本美和",
  "380315": "张本智和",
  "381042": "早田希娜",
  "381170": "伊藤美诚",
  "380420": "松岛辉空",
  "381381": "面手凛",
  "381277": "长崎美柚",
  "380768": "篠塚大登",
  "380535": "户上隼辅",
  "380663": "宇田幸矢",
  // Kazakhstan
  "1564267": "绍蕾什·阿卡舍娃",
  "1562569": "基里尔·格拉西缅科",
  "1563407": "艾多斯·肯日古洛夫",
  "1563957": "伊斯肯德尔·哈尔基",
  "1564572": "扎内尔克·科什昆巴耶娃",
  "1563026": "阿兰·库尔曼加利耶夫",
  "1564436": "萨尔维诺兹·米尔卡迪罗娃",
  "1564819": "安吉丽娜·罗曼诺夫斯卡娅",
  "1565706": "阿尔宾娜·扎克西雷科娃",
  "1563710": "桑扎尔·茹巴诺夫",
  // Kyrgyzstan
  "5884522": "努尔克孜·阿亚兹别科娃",
  "370530": "阿拜·卡西莫夫",
  "6667953": "阿泰·卡西莫夫",
  "10541855": "努拉迪尔·托洛戈诺夫",
  // Republic of Korea
  "16562314": "安宰贤",
  "16562417": "张禹珍",
  "16564388": "朱芊曦",
  "16564496": "金娜英",
  "16564702": "李恩惠",
  "16562726": "林钟勋",
  "16562520": "吴晙诚",
  "16770274": "朴佳贤",
  "16562623": "朴奎炫",
  "16564280": "申裕斌",
  // Laos
  "4458468": "约翰·哈格贝里",
  "4471755": "蓬萨万·森马尼",
  "12661875": "阿南·冯萨",
  "980414": "赛萨纳·赛萨瓦",
  "609605": "朱蒂蓬·西松本",
  // Lebanon
  "2688649": "莱蒂西亚·阿扎尔",
  "7207379": "塔莉娅·阿扎尔",
  "15879840": "比桑·奇里",
  // Macau, China
  "5718625": "陈梓贤",
  "5718955": "关卓琳",
  "5718727": "梁安娜",
  "5718418": "麦天恩",
  "5718521": "郑孔崴",
  "4444863": "朱雨玲",
  // Malaysia
  "2594982": "钟杰文",
  "10537735": "黄祺燊",
  // Maldives
  "4995868": "穆萨·艾哈迈德",
  "6871630": "法蒂玛·阿里",
  "15187671": "米什卡·易卜拉欣",
  "6879283": "穆罕默德·伊斯梅尔",
  "7945452": "阿赫亚尔·哈立德",
  "15177437": "艾莎·纳菲兹",
  "6869850": "艾莎·纳齐姆",
  "7956503": "穆罕默德·拉菲乌",
  // Mongolia
  "1468986": "比尔古恩·安赫巴亚尔",
  "9431632": "博洛尔埃格希格伦·巴特蒙赫",
  "4586815": "博洛尔额尔德尼·巴特蒙赫",
  "9106558": "恩赫塔米尔巴雅斯嘎兰·博迪苏伦",
  "1504151": "恩赫图古勒杜尔巴雅斯嘎兰·博迪苏伦",
  "3495793": "铁木伦·米扬达勒",
  "5798006": "布伦扎尔嘎勒·桑扎",
  "4576115": "安赫玛·色尔奥德",
  // Nepal
  "3871978": "加南贾亚·达哈尔",
  "10218056": "桑约格·卡帕利",
  "11357083": "鲁宾·马哈詹",
  "10248725": "永吉·波德尔",
  "3898676": "纳比塔·什雷斯塔",
  "11268141": "埃瓦娜·塔帕",
  // Pakistan
  "9961222": "诺辛·阿斯拉姆",
  "5120675": "塔哈·比拉尔",
  "13488731": "阿巴斯·汗",
  "9954769": "阿卜杜勒·汗",
  "9955117": "阿丽娜·汗",
  "4912891": "法蒂玛·汗",
  "13493711": "卡尔苏姆·汗",
  "9959500": "穆罕默德·汗",
  "9959998": "穆罕默德·汗",
  // Democratic People's Republic of Korea
  "8015463": "车秀英",
  "6936666": "崔正明",
  "5067587": "金琴英",
  "6935349": "边松景",
  "15241975": "李正植",
  "6932766": "宇泰龙",
  // Qatar
  "11275827": "阿卜杜拉·阿卜杜勒侯赛因",
  "11899060": "穆罕默德·阿侯赛因",
  "12444629": "努拉·阿布里",
  "12424736": "苏丹·库瓦里",
  "3780889": "法齐娅·马利基",
  "11296865": "玛丽亚姆·阿里",
  "11289575": "拉瓦德·纳赛尔",
  "12426604": "艾哈迈德·科拉尼",
  "11919904": "阿娅·穆罕默德",
  "11301221": "萨丽娜·谢赫",
  // Singapore
  "2841351": "周哲宇",
  "2841458": "蔡劭恒",
  "15946297": "莱·埃尔斯沃思",
  "2841968": "赖可盈",
  "15946702": "洛伊·明",
  "2841764": "冯耀恩",
  "15947019": "郭勇",
  "15947122": "舒麟茜",
  "2841662": "陈昭澐",
  "15947225": "曾尖",
  // Syria
  "2269484": "拉谢尔·阿布德",
  "2267365": "亨德·扎扎",
  // Thailand
  "4625533": "奥拉万·帕拉南",
  "7385907": "提塔帕·普里查扬",
  "7384856": "帕克普姆·桑关辛",
  "4815683": "金妮帕·萨维塔布特",
  "12969577": "素塔西尼·萨维塔布特",
  "7385059": "萨拉育·丹查伦",
  "12970602": "库拉帕斯·维吉特维里亚古尔",
  "12970857": "帕萨拉蓬·翁拉孔",
  // Chinese Taipei
  "2008192": "陈思羽",
  "665537": "郑怡静",
  "15725713": "冯翊新",
  "15728414": "许贤家",
  "644675": "洪敬恺",
  "641974": "郭冠宏",
  "4735886": "林昀儒",
  "4767662": "彭郁涵",
  "667302": "吴映萱",
  "15753718": "叶伊恬",
  // Uzbekistan
  "4654774": "胡尔希德·阿赫梅多夫",
  "4654353": "迪约尔别克·迪尔肖多夫",
  "4655228": "阿塞尔·埃尔克巴耶娃",
  "4654456": "肖赫鲁赫·伊斯坎达罗夫",
  "4655094": "阿鲁詹·卡马洛娃",
  "4654991": "阿德丽娜·哈萨诺娃",
  // Yemen
  "7796317": "马吉德·杜布哈尼",
  "11377796": "阿卜杜勒拉赫曼·亚法伊",
  "10112543": "易卜拉欣·古布兰"
};

export const athleteShortNames: Readonly<Record<string, string>> = {};

export const sideNames: Readonly<Record<string, string>> = {
  "7": "轮空",
  "8": "轮空",
  "9": "轮空",
  "TTEMTEAM-------BAN01": "孟加拉国",
  "TTEWTEAM-------BAN01": "孟加拉国",
  "TTEMTEAM-------BRN01": "巴林",
  "TTEMTEAM-------CHN01": "中国",
  "TTEWTEAM-------CHN01": "中国",
  "TTEMTEAM-------HKG01": "中国香港",
  "TTEWTEAM-------HKG01": "中国香港",
  "TTEMTEAM-------INA01": "印度尼西亚",
  "TTEWTEAM-------INA01": "印度尼西亚",
  "TTEMTEAM-------IND01": "印度",
  "TTEWTEAM-------IND01": "印度",
  "TTEMTEAM-------IRI01": "伊朗",
  "TTEMTEAM-------JPN01": "日本",
  "TTEWTEAM-------JPN01": "日本",
  "TTEMTEAM-------KAZ01": "哈萨克斯坦",
  "TTEWTEAM-------KAZ01": "哈萨克斯坦",
  "TTEMTEAM-------KGZ01": "吉尔吉斯斯坦",
  "TTEMTEAM-------KOR01": "韩国",
  "TTEWTEAM-------KOR01": "韩国",
  "TTEMTEAM-------LAO01": "老挝",
  "TTEWTEAM-------LBN01": "黎巴嫩",
  "TTEMTEAM-------MAC01": "中国澳门",
  "TTEWTEAM-------MAC01": "中国澳门",
  "TTEMTEAM-------MDV01": "马尔代夫",
  "TTEWTEAM-------MDV01": "马尔代夫",
  "TTEMTEAM-------MGL01": "蒙古",
  "TTEWTEAM-------MGL01": "蒙古",
  "TTEMTEAM-------NEP01": "尼泊尔",
  "TTEWTEAM-------NEP01": "尼泊尔",
  "TTEMTEAM-------PAK01": "巴基斯坦",
  "TTEWTEAM-------PAK01": "巴基斯坦",
  "TTEWTEAM-------PRK01": "朝鲜",
  "TTEMTEAM-------QAT01": "卡塔尔",
  "TTEWTEAM-------QAT01": "卡塔尔",
  "TTEMTEAM-------SGP01": "新加坡",
  "TTEWTEAM-------SGP01": "新加坡",
  "TTEMTEAM-------THA01": "泰国",
  "TTEWTEAM-------THA01": "泰国",
  "TTEMTEAM-------TPE01": "中国台北",
  "TTEWTEAM-------TPE01": "中国台北",
  "TTEMTEAM-------UZB01": "乌兹别克斯坦",
  "TTEWTEAM-------UZB01": "乌兹别克斯坦",
  "TTEMTEAM-------YEM01": "也门"
};

const officialName = (record: RawRecord, fallback: string): string =>
  text(record.NameS) || text(record.Name) || fallback;

export const localizeAthleteName = (
  value: unknown,
  fallback = "待定"
): LocalizedName => {
  const athlete = asRecord(value);
  const reg = text(athlete.Reg);
  const name =
    athleteNames[reg] ??
    officialName(athlete, fallback);

  return {
    name,
    shortName:
      athleteShortNames[reg] ??
      athleteNames[reg] ??
      officialName(athlete, fallback)
  };
};

export const localizeSideName = (
  value: unknown,
  fallback = "待定"
): LocalizedName => {
  const side = asRecord(value);
  const reg = text(side.Reg);
  const explicitName = sideNames[reg];
  if (explicitName) {
    return {
      name: explicitName,
      shortName: explicitName
    };
  }

  const members = asArray(side.Members).map(asRecord);
  const isTeamSide = reg.toUpperCase().includes("TEAM");
  if (!isTeamSide && members.length === 2) {
    const names = members.map((member) => {
      const memberReg = text(member.Reg);
      return (
        athleteNames[memberReg] ??
        officialName(member, fallback)
      );
    });
    const shortNames = members.map((member) => {
      const memberReg = text(member.Reg);
      return (
        athleteShortNames[memberReg] ??
        athleteNames[memberReg] ??
        officialName(member, fallback)
      );
    });

    return {
      name: names.join(" / "),
      shortName: shortNames.join(" / ")
    };
  }

  return localizeAthleteName(side, fallback);
};
