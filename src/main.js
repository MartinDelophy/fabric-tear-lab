/* Responsive controls, application state and browser viewport integration. */
import { jsxRuntime, React, ReactDOM, LanguageProvider, useLanguage, releaseAsset, defaultLiquidParams, defaultFabricParams, liquidVolumeToSlider, sliderToLiquidVolume, normalizeLiquidParams, defaultIdleMotion, idleMotionNames, SimulationScene } from './runtime.js';
const fabricDefaults = {
    denier: .75,
    stiffness: .5,
    toughness: 5,
    runTendency: 1,
    tension: 1,
    adhesion: .12,
    segments: 96,
    grabRadius: .045,
    pullWrinkles: !0,
    color: [.96, .96, .96]
  },
  RN = {
    ...fabricDefaults,
    grabRadius: .07
  };
function toFabricControl(o, t) {
  switch (o) {
    case "denier":
    case "runTendency":
      return t * 100;
    case "stiffness":
      return t * 2;
    case "tension":
      return (1 - t) * 100;
    case "adhesion":
      return t / .12 * 100;
    default:
      return t;
  }
}
function fromFabricControl(o, t) {
  switch (o) {
    case "denier":
    case "runTendency":
      return t / 100;
    case "stiffness":
      return t / 2;
    case "tension":
      return 1 - t / 100;
    case "adhesion":
      return t / 100 * .12;
    default:
      return t;
  }
}
const hosieryColors = [{
    label: "黑",
    value: [.05, .05, .07]
  }, {
    label: "烟灰",
    value: [.32, .31, .33]
  }, {
    label: "肤",
    value: [.8, .64, .54]
  }, {
    label: "白",
    value: [.96, .96, .96]
  }],
  UN = [{
    key: "denier",
    label: "厚度 / 不透明度",
    min: 25,
    max: 100,
    step: 1,
    fmt: o => `${Math.round(o)}%`
  }, {
    key: "stiffness",
    label: "弹性回复",
    min: 0,
    max: 2,
    step: .02,
    fmt: o => o.toFixed(2)
  }, {
    key: "toughness",
    label: "韧性（断裂伸长）",
    min: 2.5,
    max: 8,
    step: .1,
    fmt: o => `×${o.toFixed(2)}`
  }, {
    key: "runTendency",
    label: "抽丝倾向",
    min: 0,
    max: 200,
    step: 1,
    fmt: o => `${Math.round(o)}%`
  }, {
    key: "tension",
    label: "预张力",
    min: -20,
    max: 20,
    step: 1,
    fmt: o => `${Math.round(o)}%`
  }, {
    key: "adhesion",
    label: "贴合度",
    min: 0,
    max: 200,
    step: 1,
    fmt: o => `${Math.round(o)}%`
  }],
  LN = [{
    key: "flow",
    label: "单次水量",
    min: 0,
    max: defaultFabricParams,
    step: 1,
    fmt: o => `${Number(o.toFixed(1))} ml`
  }, {
    key: "spread",
    label: "落点范围",
    min: .004,
    max: .1,
    step: .001,
    fmt: o => `${(o * 100).toFixed(1)} cm`
  }, {
    key: "viscosity",
    label: "液体黏度",
    min: 1,
    max: 8,
    step: .1,
    fmt: o => `×${o.toFixed(1)}`,
    hint: "越高，流动与浸透越慢"
  }, {
    key: "surfaceTension",
    label: "表面张力",
    min: .3,
    max: 1.5,
    step: .05,
    fmt: o => `${Math.round(o * 100)}%`,
    hint: "越高，水分越容易聚拢"
  }, {
    key: "absorption",
    label: "浸透速度",
    min: .2,
    max: 3,
    step: .1,
    fmt: o => `×${o.toFixed(1)}`
  }, {
    key: "evaporation",
    label: "干燥速度",
    min: 0,
    max: 3,
    step: .1,
    fmt: o => o === 0 ? "保持湿润" : `×${o.toFixed(1)}`
  }],
  modeOptions = [{
    value: "fabric",
    label: "布料"
  }, {
    value: "water",
    label: "泼水"
  }],
  Q7 = "(max-width: 700px), (max-width: 1100px) and (pointer: coarse)";
function ControlPanel({
  interactionMode: o,
  onInteractionMode: t,
  liquidParams: e,
  onLiquidParams: n,
  onDry: s,
  audioVolume: r,
  onAudioVolume: l,
  idleLevel: u,
  onIdleLevel: h,
  quality: f,
  onQuality: p,
  params: m,
  onParams: g,
  onReset: v
}) {
  const {
      language: x,
      toggleLanguage: S,
      t: _
    } = useLanguage(),
    [y, T] = React.useState(() => typeof window < "u" && window.matchMedia(Q7).matches),
    [w, A] = React.useState(!1),
    [C, E] = React.useState(!1),
    R = React.useRef(null),
    D = React.useRef(null),
    U = y ? !C : w,
    N = e.color ?? defaultLiquidParams.color,
    I = Math.round((1 - (e.opacity ?? defaultLiquidParams.opacity)) * 100);
  React.useEffect(() => {
    const B = window.matchMedia(Q7),
      G = () => T(B.matches);
    return G(), B.addEventListener("change", G), () => B.removeEventListener("change", G);
  }, []);
  const F = () => y ? E(B => !B) : A(B => !B);
  return jsxRuntime.jsxs("section", {
    className: `panel${U ? " collapsed" : ""}`,
    "aria-label": _("布料与泼水参数"),
    onKeyDown: B => {
      var G;
      y && C && B.key === "Escape" && (E(!1), (G = R.current) == null || G.focus(), B.stopPropagation());
    },
    children: [jsxRuntime.jsxs("div", {
      className: "panel-heading-row",
      children: [jsxRuntime.jsxs("h1", {
        className: "panel-heading",
        children: [jsxRuntime.jsx("span", {
          className: "panel-title",
          children: _("丝袜布料实验室")
        }), y && U && jsxRuntime.jsxs("span", {
          className: "panel-touch-hint",
          children: [_(o === "water" ? "轻点泼一团" : "单指拉扯"), " · ", _("双指缩放/平移")]
        })]
      }), jsxRuntime.jsxs("div", {
        className: "panel-heading-actions",
        children: [jsxRuntime.jsx("button", {
          type: "button",
          className: "language-toggle",
          onClick: S,
          "aria-label": x === "zh" ? "Switch to English" : "切换到中文",
          lang: x === "zh" ? "en" : "zh-CN",
          children: x === "zh" ? "EN" : "中文"
        }), jsxRuntime.jsx("button", {
          ref: R,
          type: "button",
          className: "panel-toggle",
          onClick: F,
          "aria-expanded": !U,
          "aria-controls": "fabric-panel-content",
          children: jsxRuntime.jsxs("span", {
            className: "panel-toggle-label",
            children: [_(U ? "调整" : "收起"), jsxRuntime.jsx("svg", {
              className: "panel-chevron",
              width: "12",
              height: "12",
              viewBox: "0 0 12 12",
              "aria-hidden": "true",
              children: jsxRuntime.jsx("path", {
                d: "m3 4.5 3 3 3-3",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "1.5",
                strokeLinecap: "round",
                strokeLinejoin: "round"
              })
            })]
          })
        })]
      }), y && U && jsxRuntime.jsx("button", {
        type: "button",
        className: "mode-quick-switch",
        onClick: () => t(o === "fabric" ? "water" : "fabric"),
        "aria-label": _(o === "fabric" ? "切换到泼水模式" : "切换到布料拉扯模式"),
        children: _(o === "fabric" ? "泼水" : "拉扯")
      })]
    }), !U && jsxRuntime.jsxs("div", {
      id: "fabric-panel-content",
      className: "panel-content",
      children: [jsxRuntime.jsx("div", {
        className: "seg mode-tabs",
        role: "tablist",
        "aria-label": _("交互模式"),
        ref: D,
        onKeyDown: B => {
          var j, O;
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(B.key)) return;
          B.preventDefault();
          const G = B.key === "Home" ? 0 : B.key === "End" || o === "fabric" ? 1 : 0;
          t(modeOptions[G].value), (O = (j = D.current) == null ? void 0 : j.querySelectorAll('[role="tab"]')[G]) == null || O.focus();
        },
        children: modeOptions.map(B => jsxRuntime.jsx("button", {
          type: "button",
          role: "tab",
          id: `mode-tab-${B.value}`,
          "aria-controls": `mode-panel-${B.value}`,
          "aria-selected": o === B.value,
          tabIndex: o === B.value ? 0 : -1,
          className: o === B.value ? "on" : "",
          onClick: () => t(B.value),
          children: _(B.label)
        }, B.value))
      }), jsxRuntime.jsxs("div", {
        className: "panel-scroll",
        children: [jsxRuntime.jsx("a", {
          className: "model-label",
          href: "https://booth.pm/en/items/6727723",
          target: "_blank",
          rel: "noopener noreferrer",
          title: _("查看原作者模型页面（新标签页）"),
          children: _("调月莉音 · MissQing · 常服 / 高跟鞋")
        }), jsxRuntime.jsxs("div", {
          className: "seg",
          "aria-label": _("渲染画质"),
          children: [jsxRuntime.jsx("button", {
            type: "button",
            "aria-pressed": f === "hd",
            className: f === "hd" ? "on" : "",
            onClick: () => p("hd"),
            children: _(y ? "高清" : "高清 2×")
          }), jsxRuntime.jsx("button", {
            type: "button",
            "aria-pressed": f === "ultra",
            className: f === "ultra" ? "on" : "",
            onClick: () => p("ultra"),
            children: _(y ? "超清" : "超清 3×")
          })]
        }), y && jsxRuntime.jsx("p", {
          className: "quality-hint",
          children: _("自动适配性能")
        }), jsxRuntime.jsx("div", {
          className: "seg",
          "aria-label": _("丝袜颜色"),
          children: hosieryColors.map(B => jsxRuntime.jsx("button", {
            type: "button",
            "aria-pressed": B.value.join() === m.color.join(),
            className: B.value.join() === m.color.join() ? "on" : "",
            onClick: () => g({
              ...m,
              color: B.value
            }),
            children: _(B.label)
          }, _(B.label)))
        }), jsxRuntime.jsxs("div", {
          id: "mode-panel-fabric",
          role: "tabpanel",
          "aria-labelledby": "mode-tab-fabric",
          tabIndex: 0,
          hidden: o !== "fabric",
          children: [UN.map(B => jsxRuntime.jsxs("div", {
            className: "row",
            children: [jsxRuntime.jsxs("label", {
              htmlFor: `fabric-${B.key}`,
              children: [_(B.label), jsxRuntime.jsx("b", {
                children: B.fmt(toFabricControl(B.key, m[B.key]))
              })]
            }), jsxRuntime.jsx("input", {
              id: `fabric-${B.key}`,
              type: "range",
              "aria-valuetext": B.fmt(toFabricControl(B.key, m[B.key])),
              min: B.min,
              max: B.max,
              step: B.step,
              value: toFabricControl(B.key, m[B.key]),
              onChange: G => g({
                ...m,
                [B.key]: fromFabricControl(B.key, Number(G.target.value))
              })
            })]
          }, B.key)), jsxRuntime.jsxs("div", {
            className: "row switch-row",
            children: [jsxRuntime.jsx("span", {
              id: "pull-wrinkles-label",
              children: _("拉扯褶皱")
            }), jsxRuntime.jsxs("button", {
              type: "button",
              role: "switch",
              className: "param-switch",
              "aria-labelledby": "pull-wrinkles-label",
              "aria-checked": m.pullWrinkles,
              onClick: () => g({
                ...m,
                pullWrinkles: !m.pullWrinkles
              }),
              children: [jsxRuntime.jsx("span", {
                "aria-hidden": "true",
                children: m.pullWrinkles ? _("开启") : _("关闭")
              }), jsxRuntime.jsx("span", {
                className: "switch-track",
                "aria-hidden": "true"
              })]
            })]
          })]
        }), jsxRuntime.jsxs("div", {
          id: "mode-panel-water",
          role: "tabpanel",
          "aria-labelledby": "mode-tab-water",
          tabIndex: 0,
          hidden: o !== "water",
          children: [jsxRuntime.jsx("p", {
            className: "water-hint",
            children: _(y ? "轻点袜面泼一团 · 双指缩放/平移" : "点击袜面泼一团，液体落下后摊开、流动并浸透")
          }), jsxRuntime.jsxs("div", {
            className: "liquid-appearance",
            children: [jsxRuntime.jsxs("div", {
              className: "row liquid-color-row",
              children: [jsxRuntime.jsxs("label", {
                htmlFor: "liquid-color",
                children: [_("液体颜色"), jsxRuntime.jsx("span", {
                  className: "liquid-color-value",
                  children: N.toUpperCase()
                })]
              }), jsxRuntime.jsx("input", {
                id: "liquid-color",
                type: "color",
                value: N,
                onChange: B => n({
                  ...e,
                  color: B.target.value
                })
              })]
            }), jsxRuntime.jsxs("div", {
              className: "row liquid-opacity-row",
              children: [jsxRuntime.jsxs("label", {
                htmlFor: "liquid-transparency",
                children: [_("液体透明度"), jsxRuntime.jsxs("b", {
                  children: [I, "%"]
                })]
              }), jsxRuntime.jsx("input", {
                id: "liquid-transparency",
                type: "range",
                min: 0,
                max: 100,
                step: 1,
                value: I,
                "aria-valuetext": `${I}% ${_("透明")}`,
                onChange: B => n({
                  ...e,
                  opacity: 1 - Number(B.target.value) / 100
                })
              })]
            })]
          }), LN.map(B => jsxRuntime.jsxs("div", {
            className: "row liquid-row",
            children: [jsxRuntime.jsxs("label", {
              htmlFor: `liquid-${B.key}`,
              children: [_(B.label), jsxRuntime.jsx("b", {
                children: _(B.fmt(e[B.key]))
              })]
            }), jsxRuntime.jsx("input", {
              id: `liquid-${B.key}`,
              type: "range",
              min: B.min,
              max: B.max,
              step: B.step,
              value: B.key === "flow" ? sliderToLiquidVolume(e.flow) : e[B.key],
              "aria-valuetext": _(B.fmt(e[B.key])),
              "aria-describedby": B.hint ? `liquid-${B.key}-hint` : void 0,
              onChange: G => n({
                ...e,
                [B.key]: B.key === "flow" ? liquidVolumeToSlider(Number(G.target.value)) : Number(G.target.value)
              })
            }), B.hint && jsxRuntime.jsx("p", {
              id: `liquid-${B.key}-hint`,
              className: "liquid-hint",
              children: _(B.hint)
            })]
          }, B.key)), jsxRuntime.jsx("button", {
            type: "button",
            className: "liquid-defaults",
            onClick: () => n({
              ...defaultLiquidParams
            }),
            children: _("恢复默认参数")
          })]
        }), jsxRuntime.jsxs("div", {
          className: "row idle-control",
          children: [jsxRuntime.jsxs("label", {
            htmlFor: "idle-level",
            children: [_("待机动作"), jsxRuntime.jsx("b", {
              children: _(normalizeLiquidParams[u])
            })]
          }), jsxRuntime.jsx("input", {
            id: "idle-level",
            type: "range",
            min: 0,
            max: 3,
            step: 1,
            value: u,
            "aria-valuetext": _(normalizeLiquidParams[u]),
            onChange: B => h(idleMotionNames(Number(B.target.value)))
          }), jsxRuntime.jsx("div", {
            className: "idle-stops",
            "aria-hidden": "true",
            children: normalizeLiquidParams.map((B, G) => jsxRuntime.jsx("span", {
              className: G === u ? "selected" : "",
              children: _(B)
            }, _(B)))
          })]
        }), o === "fabric" && jsxRuntime.jsxs("div", {
          className: "row",
          children: [jsxRuntime.jsxs("label", {
            htmlFor: "fabric-audio",
            children: [_("撕裂音效"), jsxRuntime.jsx("b", {
              children: r ? `${Math.round(r * 100)}%` : _("静音")
            })]
          }), jsxRuntime.jsx("input", {
            id: "fabric-audio",
            type: "range",
            min: 0,
            max: 100,
            step: 1,
            value: Math.round(r * 100),
            "aria-valuetext": r ? `${Math.round(r * 100)}%` : _("静音"),
            onChange: B => l(Number(B.target.value) / 100)
          })]
        })]
      }), jsxRuntime.jsx("div", {
        className: "panel-actions",
        children: jsxRuntime.jsx("button", {
          type: "button",
          className: "act",
          style: {
            gridColumn: "1 / -1"
          },
          onClick: o === "water" ? s : v,
          children: _(o === "water" ? "清除水分" : "重置布料")
        })
      })]
    })]
  });
}
function bindVisualViewport() {
  const o = window.visualViewport,
    t = document.documentElement,
    e = ["--viewport-left", "--viewport-top", "--viewport-width", "--viewport-height", "--viewport-inverse-scale"],
    n = e.map(r => t.style.getPropertyValue(r)),
    s = () => {
      const r = [`${(o == null ? void 0 : o.offsetLeft) ?? 0}px`, `${(o == null ? void 0 : o.offsetTop) ?? 0}px`, `${(o == null ? void 0 : o.width) ?? t.clientWidth}px`, `${(o == null ? void 0 : o.height) ?? t.clientHeight}px`, String(1 / ((o == null ? void 0 : o.scale) || 1))];
      e.forEach((l, u) => {
        t.style.getPropertyValue(l) !== r[u] && t.style.setProperty(l, r[u]);
      });
    };
  return s(), window.addEventListener("resize", s), o == null || o.addEventListener("resize", s), o == null || o.addEventListener("scroll", s), () => {
    window.removeEventListener("resize", s), o == null || o.removeEventListener("resize", s), o == null || o.removeEventListener("scroll", s), e.forEach((r, l) => {
      n[l] ? t.style.setProperty(r, n[l]) : t.style.removeProperty(r);
    });
  };
}
function FabricTearApp() {
  const {
    t: o
  } = useLanguage();
  React.useEffect(bindVisualViewport, []);
  const [t, e] = React.useState(null),
    [n, s] = React.useState(RN),
    [r, l] = React.useState("fabric"),
    [u, h] = React.useState(defaultLiquidParams),
    [f, p] = React.useState(0),
    [m, g] = React.useState(.55),
    [v, x] = React.useState(defaultIdleMotion),
    [S, _] = React.useState(0),
    [y, T] = React.useState("ultra"),
    [w, A] = React.useState(null);
  return React.useEffect(() => {
    fetch(releaseAsset("models/rio/stockings.json")).then(C => {
      if (!C.ok) throw new Error("莉音连裤袜加载失败");
      return C.json();
    }).then(e).catch(C => A(String(C)));
  }, []), jsxRuntime.jsxs(jsxRuntime.Fragment, {
    children: [t ? jsxRuntime.jsx(SimulationScene, {
      interactionMode: r,
      liquidParams: u,
      dryKey: f,
      audioVolume: m,
      idleLevel: v,
      paused: !1,
      demoKey: 0,
      data: t,
      quality: y,
      params: n,
      resetKey: S
    }) : jsxRuntime.jsx("div", {
      className: "loading",
      children: o(w ?? "加载莉音模型…")
    }), jsxRuntime.jsx(ControlPanel, {
      interactionMode: r,
      onInteractionMode: l,
      liquidParams: u,
      onLiquidParams: h,
      onDry: () => p(C => C + 1),
      audioVolume: m,
      onAudioVolume: g,
      idleLevel: v,
      onIdleLevel: x,
      quality: y,
      onQuality: T,
      params: n,
      onParams: s,
      onReset: () => _(C => C + 1)
    })]
  });
}
window.addEventListener("wheel", o => o.ctrlKey && o.preventDefault(), {
  passive: !1
});
for (const o of ["gesturestart", "gesturechange"]) document.addEventListener(o, t => t.preventDefault());
ReactDOM.createRoot(document.getElementById("root")).render(jsxRuntime.jsx(React.StrictMode, {
  children: jsxRuntime.jsx(LanguageProvider, {
    children: jsxRuntime.jsx(FabricTearApp, {})
  })
}));
