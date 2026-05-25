import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BASE_URL, request } from "./src/api/mockClient";
import { articles as localArticles } from "./src/data/knowledge";
import { colors } from "./src/theme/colors";

const tabs = [
  { key: "home", label: "首页", icon: "⌂" },
  { key: "identify", label: "识别", icon: "◎" },
  { key: "discover", label: "知识", icon: "◇" },
  { key: "plants", label: "我的", icon: "♧" },
];

const waterLabels = { low: "低", medium: "中", high: "高" };
const lightLabels = { low: "弱", medium: "中", high: "强" };
const taskLabels = { water: "浇水", fertilize: "施肥", repot: "换盆", inspect: "检查" };
const weatherIcons = { 0: "☀", 1: "☀", 2: "◐", 3: "☁", 61: "雨" };

function toast(message) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("greenai-toast", { detail: message }));
  } else {
    Alert.alert("植物管家", message);
  }
}

function formatDate() {
  const now = new Date();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const h = now.getHours();
  const greeting = h < 5 ? "夜深了" : h < 12 ? "早上好" : h < 18 ? "下午好" : "晚上好";
  return {
    greeting,
    heroDate: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
    weekday: weekdays[now.getDay()],
  };
}

function taskView(t) {
  return {
    ...t,
    displayType: taskLabels[t.type] || t.type,
    displayTime: t.dueDate ? String(t.dueDate).slice(0, 16).replace("T", " ") : "",
    typeClass: t.type === "water" ? "water" : t.type === "fertilize" ? "fertilize" : "other",
  };
}

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function Pill({ label, onPress, tone = "default" }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        tone === "primary" && styles.pillPrimary,
        tone === "danger" && styles.pillDanger,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.pillText, tone === "primary" && styles.pillPrimaryText]}>{label}</Text>
    </Pressable>
  );
}

function Hero({ eyebrow, title, desc }) {
  return (
    <View style={styles.hero}>
      {eyebrow ? <Text style={styles.heroEyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.heroTitle}>{title}</Text>
      {desc ? <Text style={styles.heroDesc}>{desc}</Text> : null}
    </View>
  );
}

function HomeScreen({ go }) {
  const [state, setState] = useState({
    tasks: [],
    plants: [],
    weather: null,
    forecast: [],
    loading: true,
  });
  const date = useMemo(formatDate, []);

  async function load() {
    const [tasksRaw, plants, weather, forecast] = await Promise.all([
      request({ path: "/tasks/today" }),
      request({ path: "/plants" }),
      request({ path: "/weather/current" }),
      request({ path: "/weather/forecast" }),
    ]);
    setState({
      tasks: tasksRaw.map(taskView),
      plants,
      weather,
      forecast: forecast.days || [],
      loading: false,
    });
  }

  useEffect(() => {
    load();
  }, []);

  const pending = state.tasks.length;
  const summary =
    pending > 0 ? `今天有 ${pending} 项养护待办` : state.plants.length ? "" : "还没有植物，去添加一盆吧";

  async function finishTask(id, mode) {
    await request({ path: `/tasks/${id}/${mode}`, method: "POST" });
    toast(mode === "complete" ? "已完成" : "已跳过");
    load();
  }

  return (
    <Screen>
      <Hero
        eyebrow={`${date.heroDate} · ${date.weekday}`}
        title={date.greeting}
        desc={state.loading ? "加载 Mock 数据中..." : summary}
      />
      <Text style={styles.sectionTitle}>养护</Text>
      <View style={styles.statsRow}>
        <Stat label="植物" value={state.plants.length} onPress={() => go("plants")} />
        <Stat label="待办" value={pending} accent />
        <Stat label="需关注" value={Math.min(pending, state.plants.length)} warn onPress={() => go("diagnose")} />
      </View>
      <Card style={[styles.weatherCard, styles.homeBlock]}>
        <View style={styles.weatherHead}>
          <Text style={styles.weatherIcon}>◐</Text>
          <Text style={styles.weatherTemp}>{state.weather?.temperatureC ?? "--"}°C</Text>
          <Text style={styles.muted}>湿度 {state.weather?.relativeHumidity ?? "--"}%</Text>
        </View>
        <View style={styles.forecastRow}>
          {state.forecast.map((d, index) => (
            <View key={d.date} style={styles.forecastDay}>
              <Text style={styles.forecastDow}>{index === 0 ? "今日" : d.date.slice(5)}</Text>
              <Text style={styles.forecastIcon}>{weatherIcons[d.weatherCode] || "◐"}</Text>
              <Text style={styles.small}>{Math.round(d.tempMinC)}° / {Math.round(d.tempMaxC)}°</Text>
            </View>
          ))}
        </View>
      </Card>
      {state.tasks.length ? <Text style={styles.sectionTitle}>待办</Text> : null}
      {state.tasks.map((task) => (
        <Card key={task.id} style={styles.homeTaskCard}>
          <View style={styles.rowBetween}>
            <Text style={[styles.badge, task.typeClass === "fertilize" && styles.badgeGold]}>
              {task.displayType}
            </Text>
            <Text style={styles.small}>{task.displayTime}</Text>
          </View>
          <Text style={styles.cardTitle}>{task.plant?.nickname}</Text>
          <View style={styles.actionRow}>
            <Pill label="标记完成" tone="primary" onPress={() => finishTask(task.id, "complete")} />
            <Pill label="跳过" onPress={() => finishTask(task.id, "skip")} />
          </View>
        </Card>
      ))}
      <Card style={styles.homeQuickCard}>
        <View style={styles.quickGrid}>
          <Quick label="拍照识花" icon="花" onPress={() => go("identify")} />
          <Quick label="土壤诊断" icon="土" onPress={() => go("diagnose", { mode: "soil" })} />
          <Quick label="症状诊断" icon="症" onPress={() => go("diagnose")} />
          <Quick label="添加植物" icon="＋" onPress={() => go("plantEdit")} wide />
        </View>
      </Card>
    </Screen>
  );
}

function Stat({ label, value, accent, warn, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.stat, pressed && styles.pressed]}>
      <Text style={[styles.statNum, accent && styles.accent, warn && styles.warn]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

function Quick({ icon, label, wide, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, wide && styles.quickWide, pressed && styles.pressed]}>
      <Text style={styles.quickIcon}>{icon}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function IdentifyScreen({ go }) {
  const [result, setResult] = useState(null);
  async function identify() {
    const data = await request({ path: "/plants/identify", method: "POST", data: { imageBase64: "mock" } });
    setResult({
      speciesLabel: data.best.name,
      confidence: data.best.confidence,
      desc: data.best.baikeDescription || data.best.careSummary,
    });
    toast("识别成功，已使用 Mock 照片");
  }
  return (
    <Screen>
      <Hero title="识别与诊断" desc="拍照识花、AI 诊断、症状对照，多角度辅助养护决策。" />
      <MenuCard icon="花" title="拍照识花" desc="拍摄植物照片，AI 智能识别品种" onPress={identify} />
      <MenuCard icon="土" title="土壤诊断" desc="拍摄盆土照片，AI 评估干湿与肥力" onPress={() => go("diagnose", { mode: "soil" })} />
      <MenuCard icon="症" title="症状诊断" desc="勾选症状，获取规则匹配的养护建议" onPress={() => go("diagnose")} />
      {result ? (
        <Card>
          <Text style={styles.sectionTitleInline}>识别结果</Text>
          <Text style={styles.cardTitle}>品种：{result.speciesLabel}</Text>
          <Text style={styles.body}>置信度：{result.confidence}%</Text>
          <Text style={styles.body}>{result.desc}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function MenuCard({ icon, title, desc, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuCard, pressed && styles.pressed]}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.body}>{desc}</Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </Pressable>
  );
}

function DiscoverScreen({ go }) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState(localArticles);
  useEffect(() => {
    request({ path: "/knowledge/articles" }).then(setRemote);
  }, []);
  const list = remote.filter((a) => `${a.title} ${a.summary} ${a.body}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <Screen>
      <Hero title="植物知识" desc="把小程序知识库迁移为可搜索、可离线 Mock 的移动端文章流。" />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="搜索品种、浇水、施肥..."
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      {list.map((article) => (
        <Pressable key={article.id} onPress={() => go("article", { id: article.id })} style={({ pressed }) => [styles.article, pressed && styles.pressed]}>
          <View style={[styles.articleCover, { backgroundColor: coverColor(article.coverTone) }]}>
            <Text style={styles.articleGlyph}>{article.title.charAt(0)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{article.title}</Text>
            <Text style={styles.body}>{article.summary}</Text>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

function PlantsScreen({ go }) {
  const [plants, setPlants] = useState([]);
  const [me, setMe] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [weather, setWeather] = useState(null);
  async function load() {
    const [p, u, w, fc] = await Promise.all([
      request({ path: "/plants" }),
      request({ path: "/users/me" }),
      request({ path: "/weather/current" }),
      request({ path: "/weather/forecast" }),
    ]);
    setPlants(p);
    setMe(u);
    setWeather(w);
    setForecast(fc.days || []);
  }
  useEffect(() => {
    load();
  }, []);
  async function removePlant(id) {
    await request({ path: `/plants/${id}`, method: "DELETE" });
    toast("已删除");
    load();
  }
  return (
    <Screen>
      <Hero title="我的植物" desc="管理品种、环境与养护节奏；编辑后将自动重算计划。" />
      <View style={styles.sectionAction}>
        <Pill label="添加植物" tone="primary" onPress={() => go("plantEdit")} />
      </View>
      {plants.map((plant) => (
        <Card key={plant.id}>
          <View style={styles.plantHead}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{plant.nickname?.charAt(0) || "植"}</Text></View>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{plant.nickname}</Text>
              <Text style={styles.body}>{plant.speciesLabel}</Text>
            </View>
          </View>
          <View style={styles.actionRow}>
            <Pill label="计划" onPress={() => go("plan", { id: plant.id })} />
            <Pill label="传感器" onPress={() => go("sensors", { id: plant.id })} />
            <Pill label="编辑" onPress={() => go("plantEdit", { id: plant.id })} />
            <Pill label="删除" tone="danger" onPress={() => removePlant(plant.id)} />
          </View>
        </Card>
      ))}
      <Text style={styles.sectionTitle}>位置与天气</Text>
      <Card>
        <View style={styles.weatherHead}>
          <Text style={styles.weatherIcon}>◐</Text>
          <View>
            <Text style={styles.cardTitle}>{weather ? `${weather.temperatureC}°C` : "--"}</Text>
            <Text style={styles.body}>{me?.locationLabel || "未设置位置"} · 湿度 {weather?.relativeHumidity ?? "--"}%</Text>
          </View>
        </View>
        <View style={styles.forecastRow}>
          {forecast.map((d) => (
            <View key={d.date} style={styles.forecastDay}>
              <Text style={styles.forecastDow}>{d.date.slice(5)}</Text>
              <Text style={styles.small}>{Math.round(d.tempMinC)}° / {Math.round(d.tempMaxC)}°</Text>
            </View>
          ))}
        </View>
        <View style={styles.actionRow}>
          <Pill label="使用当前定位" onPress={() => toast("Mock 定位已保存")} />
          <Pill label="清除位置" onPress={() => toast("Mock 模式保留演示位置")} />
        </View>
      </Card>
    </Screen>
  );
}

function PlantEditScreen({ route, goBack }) {
  const [form, setForm] = useState({
    nickname: "",
    speciesLabel: "",
    waterPreference: "medium",
    lightLevel: "medium",
    indoor: true,
    heating: false,
    soilMoistureHint: "moderate",
    careTips: "",
  });
  const id = route?.id;
  useEffect(() => {
    if (id) request({ path: `/plants/${id}` }).then((p) => p && setForm({ ...form, ...p }));
  }, [id]);
  function patch(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  async function identifyPlant() {
    const res = await request({ path: "/plants/identify", method: "POST", data: { imageBase64: "mock" } });
    patch("speciesLabel", res.best.name);
    patch("nickname", form.nickname || res.best.name);
    patch("careTips", res.best.careSummary);
    toast("已用 Mock 识别结果填入品种");
  }
  async function submit() {
    if (!form.nickname.trim() || !form.speciesLabel.trim()) {
      toast("请填写昵称和品种");
      return;
    }
    await request({ path: "/users/me", method: "PATCH", data: { airConditioning: true, windowAspect: "east" } });
    if (id) {
      await request({ path: `/plants/${id}`, method: "PATCH", data: form });
      await request({ path: `/plants/${id}/plan/regenerate`, method: "POST" });
    } else {
      await request({ path: "/plants", method: "POST", data: form });
    }
    toast("已保存，养护计划已更新");
    goBack();
  }
  return (
    <Screen>
      <Hero title={id ? "编辑植物" : "添加植物"} desc="迁移小程序表单、识别填充、盆土提示和订阅引导的主要路径。" />
      <Field label="昵称" value={form.nickname} onChangeText={(v) => patch("nickname", v)} />
      <Field label="品种" value={form.speciesLabel} onChangeText={(v) => patch("speciesLabel", v)} />
      <Field label="养护提示" value={form.careTips} onChangeText={(v) => patch("careTips", v)} multiline />
      <View style={styles.actionRow}>
        <Pill label={`浇水偏好：${waterLabels[form.waterPreference]}`} onPress={() => patch("waterPreference", nextValue(form.waterPreference, ["low", "medium", "high"]))} />
        <Pill label={`光照：${lightLabels[form.lightLevel]}`} onPress={() => patch("lightLevel", nextValue(form.lightLevel, ["low", "medium", "high"]))} />
      </View>
      <View style={styles.actionRow}>
        <Pill label="拍照识别植物" tone="primary" onPress={identifyPlant} />
        <Pill label="估算盆土" onPress={() => toast("Mock 盆土估算：偏干，肥力适中")} />
      </View>
      <View style={styles.sectionAction}>
        <Pill label="保存植物" tone="primary" onPress={submit} />
      </View>
    </Screen>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} placeholderTextColor={colors.muted} style={[styles.input, props.multiline && styles.textarea]} />
    </View>
  );
}

function PlanScreen({ route }) {
  const [tasksForPlant, setTasksForPlant] = useState([]);
  const [soil, setSoil] = useState([]);
  useEffect(() => {
    request({ path: `/plants/${route.id}/tasks` }).then((list) => setTasksForPlant(list.map(taskView)));
    request({ path: `/plants/${route.id}/soil-records` }).then(setSoil);
  }, [route.id]);
  return (
    <Screen>
      <Hero title="养护计划" desc="展示该植物的待办、状态和近期盆土拍照摘要。" />
      {soil.length ? (
        <Card>
          <Text style={styles.sectionTitleInline}>盆土摘要</Text>
          {soil.slice(0, 3).map((r) => <Text key={r.id} style={styles.body}>{r.createdAt.slice(0, 16).replace("T", " ")} · {r.wateringTip}</Text>)}
        </Card>
      ) : null}
      {tasksForPlant.map((t) => (
        <Card key={t.id}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{t.displayType}</Text>
            <Text style={styles.badge}>{t.status === "pending" ? "待办" : t.status}</Text>
          </View>
          <Text style={styles.body}>{t.displayTime}</Text>
        </Card>
      ))}
    </Screen>
  );
}

function SensorScreen({ route, go }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    Promise.all([
      request({ path: `/plants/${route.id}` }),
      request({ path: `/plants/${route.id}/sensor/series?hours=72` }),
      request({ path: "/devices" }),
    ]).then(([plant, series, devices]) => setData({ plant, series, devices }));
  }, [route.id]);
  const latest = data?.series?.latest;
  const metrics = [
    ["环境温度", latest?.tempC?.toFixed(1), "℃"],
    ["土壤湿度", latest?.soilMoisture?.toFixed(0), "%"],
    ["土壤 pH", latest?.phLevel?.toFixed(1), ""],
    ["光照", latest?.lux?.toFixed(0), "lx"],
  ];
  return (
    <Screen>
      <Hero title="传感器" desc={data?.plant ? `${data.plant.nickname} · 最近 72 小时` : "加载 Mock 读数中"} />
      <View style={styles.metricGrid}>
        {metrics.map(([label, value, unit]) => (
          <Card key={label} style={styles.metricCard}>
            <Text style={styles.body}>{label}</Text>
            <Text style={styles.metricValue}>{value || "--"}{unit}</Text>
          </Card>
        ))}
      </View>
      <Card>
        <Text style={styles.sectionTitleInline}>设备绑定</Text>
        {(data?.devices || []).map((d) => (
          <View key={d.id} style={styles.rowBetween}>
            <Text style={styles.body}>{d.label || d.hardwareId}</Text>
            <Text style={styles.small}>{d.plantId === route.id ? "已绑定" : "可绑定"}</Text>
          </View>
        ))}
        <Pill label="打开配网向导" onPress={() => go("provision")} />
      </Card>
    </Screen>
  );
}

function DiagnoseScreen({ route, go }) {
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [soilResult, setSoilResult] = useState(null);
  useEffect(() => {
    request({ path: "/diagnose/catalog" }).then((res) => setCatalog(res.symptoms || []));
  }, []);
  function toggle(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  async function submit() {
    const res = await request({ path: "/diagnose", method: "POST", data: { symptomIds: selected } });
    setResult(res);
  }
  async function soil() {
    const res = await request({ path: "/soil/estimate-photo", method: "POST", data: { imageBase64: "mock" } });
    setSoilResult(res);
  }
  return (
    <Screen>
      <Hero title="诊断" desc={route?.mode === "soil" ? "已进入土壤诊断面板。" : "勾选症状，获取规则匹配的养护建议。"} />
      <Text style={styles.sectionTitle}>症状对照</Text>
      <View style={styles.chipWrap}>
        {catalog.map((s) => (
          <Pressable key={s.id} onPress={() => toggle(s.id)} style={[styles.chip, selected.includes(s.id) && styles.chipActive]}>
            <Text style={[styles.chipText, selected.includes(s.id) && styles.chipTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.sectionAction}>
        <Pill label="开始分析" tone="primary" onPress={submit} />
      </View>
      {result ? (
        <Card>
          <Text style={styles.cardTitle}>{result.summary}</Text>
          {result.suggestions.map((s) => <Text key={s} style={styles.body}>· {s}</Text>)}
          <View style={styles.cardAction}>
            <Pill label="查看相关知识" onPress={() => go("article", { id: result.articles[0].id })} />
          </View>
        </Card>
      ) : null}
      <Text style={styles.sectionTitle}>土壤照片诊断</Text>
      <Card>
        <Text style={styles.body}>Mock 模式下使用内置样张返回盆土干湿、肥力与浇水建议。</Text>
        <Pill label="选择照片并分析" onPress={soil} />
        {soilResult ? <Text style={styles.body}>{soilResult.rationale} {soilResult.wateringTip}</Text> : null}
      </Card>
    </Screen>
  );
}

function ArticleScreen({ route }) {
  const article = localArticles.find((a) => a.id === route.id) || localArticles[0];
  return (
    <Screen>
      <Hero title={article.title} desc={article.summary} />
      <Card>
        {article.body.split("\n").map((p) => <Text key={p} style={styles.bodyPara}>{p}</Text>)}
      </Card>
    </Screen>
  );
}

function ProvisionScreen() {
  const steps = [
    "确保设备已通电并处于配网模式",
    "打开手机蓝牙",
    "输入家中 Wi-Fi 名称与密码",
    "等待设备连接云端",
  ];
  return (
    <Screen>
      <Hero title="设备配网向导" desc="BLE 配网通道以说明页形式迁移，读数仍走设备到云端 HTTPS。" />
      {steps.map((title, index) => (
        <Card key={title}>
          <Text style={styles.cardTitle}>{index + 1}. {title}</Text>
          <Text style={styles.body}>{index === 2 ? "仅支持 2.4 GHz 频段。" : "按照设备指示完成该步骤。"}</Text>
        </Card>
      ))}
    </Screen>
  );
}

function Screen({ children }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

function ToastHost() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const handler = (e) => {
      setMessage(e.detail);
      setTimeout(() => setMessage(""), 1800);
    };
    if (typeof window !== "undefined") window.addEventListener("greenai-toast", handler);
    return () => typeof window !== "undefined" && window.removeEventListener("greenai-toast", handler);
  }, []);
  return message ? <View style={styles.toast}><Text style={styles.toastText}>{message}</Text></View> : null;
}

function nextValue(current, values) {
  return values[(values.indexOf(current) + 1) % values.length];
}

function coverColor(tone) {
  return ["#dfe9dc", "#d8ead5", "#d9e6e8", "#eadfcf", "#e8dadd", "#e7e0cf"][tone || 0];
}

export default function App() {
  const [stack, setStack] = useState([{ name: "home", params: {} }]);
  const current = stack[stack.length - 1];
  const go = (name, params = {}) => setStack((prev) => [...prev, { name, params }]);
  const switchTab = (name) => setStack([{ name, params: {} }]);
  const goBack = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  const isTab = tabs.some((t) => t.key === current.name);

  let content;
  if (current.name === "home") content = <HomeScreen go={go} />;
  else if (current.name === "identify") content = <IdentifyScreen go={go} />;
  else if (current.name === "discover") content = <DiscoverScreen go={go} />;
  else if (current.name === "plants") content = <PlantsScreen go={go} />;
  else if (current.name === "plantEdit") content = <PlantEditScreen route={current.params} goBack={goBack} />;
  else if (current.name === "plan") content = <PlanScreen route={current.params} />;
  else if (current.name === "sensors") content = <SensorScreen route={current.params} go={go} />;
  else if (current.name === "diagnose") content = <DiagnoseScreen route={current.params} go={go} />;
  else if (current.name === "article") content = <ArticleScreen route={current.params} />;
  else if (current.name === "provision") content = <ProvisionScreen />;

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar barStyle="light-content" />
      <View style={styles.phoneFrame}>
        <View style={styles.topBar}>
          {!isTab ? <Pressable onPress={goBack}><Text style={styles.back}>‹ 返回</Text></Pressable> : <Text style={styles.brand}>植物管家</Text>}
          <Text style={styles.baseUrl}>{BASE_URL}</Text>
        </View>
        <View style={styles.content}>{content}</View>
        <View style={styles.tabbar}>
          {tabs.map((tab) => (
            <Pressable key={tab.key} onPress={() => switchTab(tab.key)} style={styles.tab}>
              <Text style={[styles.tabIcon, current.name === tab.key && styles.tabActive]}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, current.name === tab.key && styles.tabActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
        <ToastHost />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: "#dfe7dc", alignItems: "center" },
  phoneFrame: {
    width: "100%",
    maxWidth: 430,
    height: "100vh",
    maxHeight: "100vh",
    backgroundColor: "#e8ece6",
    boxShadow: "0 20px 60px rgba(28,46,36,0.18)",
  },
  topBar: { backgroundColor: colors.ink, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  brand: { color: "white", fontSize: 18, fontWeight: "800" },
  back: { color: "white", fontSize: 16, fontWeight: "700" },
  baseUrl: { color: "#b9cbb9", fontSize: 11, marginTop: 4 },
  content: { flex: 1, minHeight: 0 },
  screen: { flex: 1, minHeight: 0 },
  screenContent: { padding: 16, paddingBottom: 92 },
  hero: { backgroundColor: colors.ink, borderRadius: 28, padding: 22, marginBottom: 18 },
  heroEyebrow: { color: "#b9cbb9", fontSize: 13, marginBottom: 8 },
  heroTitle: { color: "white", fontSize: 32, fontWeight: "900" },
  heroDesc: { color: "#dfe9dc", fontSize: 14, lineHeight: 22, marginTop: 8 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "900", marginTop: 10, marginBottom: 10 },
  sectionTitleInline: { color: colors.ink, fontSize: 16, fontWeight: "900", marginBottom: 8 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 22, padding: 16, alignItems: "center" },
  statNum: { fontSize: 28, fontWeight: "900", color: colors.leaf },
  statLabel: { color: colors.muted, fontSize: 12 },
  accent: { color: colors.warn },
  warn: { color: colors.danger },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(42,77,58,0.07)",
  },
  weatherCard: { gap: 14 },
  homeBlock: { marginBottom: 16 },
  homeTaskCard: { marginBottom: 16 },
  homeQuickCard: { marginTop: 4 },
  weatherHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  weatherIcon: { fontSize: 34, color: colors.leaf },
  weatherTemp: { fontSize: 28, color: colors.ink, fontWeight: "900" },
  muted: { color: colors.muted },
  forecastRow: { flexDirection: "row", gap: 8 },
  forecastDay: { flex: 1, backgroundColor: colors.mint, borderRadius: 16, padding: 10, alignItems: "center" },
  forecastDow: { color: colors.leaf, fontWeight: "800", fontSize: 12 },
  forecastIcon: { color: colors.ink, fontSize: 18, marginVertical: 4 },
  small: { color: colors.muted, fontSize: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionAction: { alignSelf: "flex-start", marginTop: 12, marginBottom: 12 },
  cardAction: { alignSelf: "flex-start", marginTop: 12 },
  badge: { overflow: "hidden", backgroundColor: colors.leafSoft, color: colors.leaf, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, fontWeight: "800" },
  badgeGold: { backgroundColor: "#f2ead5", color: colors.warn },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: "900", marginBottom: 4 },
  body: { color: colors.sage, fontSize: 14, lineHeight: 21 },
  bodyPara: { color: colors.sage, fontSize: 15, lineHeight: 24, marginBottom: 12 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  pill: { backgroundColor: colors.mint, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  pillPrimary: { backgroundColor: colors.leaf },
  pillDanger: { backgroundColor: "#f6e4e1" },
  pillText: { color: colors.leaf, fontWeight: "800" },
  pillPrimaryText: { color: "white" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quick: { width: "30%", flexGrow: 1, backgroundColor: colors.mint, borderRadius: 18, padding: 14, alignItems: "center" },
  quickWide: { width: "100%" },
  quickIcon: { color: colors.leaf, fontSize: 20, fontWeight: "900" },
  quickLabel: { color: colors.ink, marginTop: 6, fontWeight: "800" },
  menuCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 24, padding: 16, marginBottom: 12, gap: 14 },
  menuIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.mint, color: colors.leaf, textAlign: "center", lineHeight: 48, fontWeight: "900" },
  arrow: { color: colors.muted, fontSize: 24 },
  flex: { flex: 1 },
  input: { backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  textarea: { minHeight: 92, textAlignVertical: "top" },
  article: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 22, padding: 12, marginBottom: 12, gap: 12, alignItems: "center" },
  articleCover: { width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  articleGlyph: { fontSize: 22, color: colors.leaf, fontWeight: "900" },
  plantHead: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: { width: 48, height: 48, borderRadius: 18, backgroundColor: colors.leafSoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.leaf, fontSize: 20, fontWeight: "900" },
  field: { marginBottom: 4 },
  label: { color: colors.ink, fontWeight: "800", marginBottom: 6 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { width: "47%", flexGrow: 1 },
  metricValue: { color: colors.ink, fontSize: 24, fontWeight: "900", marginTop: 6 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.leaf, borderColor: colors.leaf },
  chipText: { color: colors.leaf, fontWeight: "800" },
  chipTextActive: { color: "white" },
  tabbar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", backgroundColor: colors.cream, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, paddingBottom: 12 },
  tab: { flex: 1, alignItems: "center" },
  tabIcon: { color: colors.muted, fontSize: 18, fontWeight: "900" },
  tabLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  tabActive: { color: colors.leaf },
  toast: { position: "absolute", left: 24, right: 24, bottom: 84, backgroundColor: "rgba(28,46,36,0.92)", padding: 12, borderRadius: 16, alignItems: "center" },
  toastText: { color: "white", fontWeight: "800" },
  pressed: { opacity: 0.72 },
});
